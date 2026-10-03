import json
import httpx
import os
import shutil
import tempfile
from fastapi import UploadFile, File,FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi import Depends
from sqlalchemy.orm import Session
from database import Base, engine, get_db
from models import Investment,Review
from sqlalchemy import or_
from huggingface_hub import AsyncInferenceClient
app = FastAPI(title="Investment Memory API")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)
OLLAMA_URL = "http://localhost:11434/api/generate"
LOCAL_MODEL_NAME = "gemma3:4b"

AI_MODE = os.getenv("AI_MODE", "local").lower()

if AI_MODE not in {"local", "hosted"}:
    raise RuntimeError("AI_MODE must be either 'local' or 'hosted'.")

HF_TOKEN = os.getenv("HF_TOKEN")

HF_TEXT_MODEL = os.getenv(
    "HF_TEXT_MODEL",
    "google/gemma-3-4b-it"
)

HF_ASR_MODEL = os.getenv(
    "HF_ASR_MODEL",
    "openai/whisper-large-v3"
)

hf_client = None

if AI_MODE == "hosted":
    if not HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN is required when AI_MODE=hosted."
        )

    hf_client = AsyncInferenceClient(
        token=HF_TOKEN
    )

class InvestmentNote(BaseModel):
    note: str = Field(min_length=3, max_length=2000)


class InvestmentDetails(BaseModel):
    stock: str | None = None
    quantity: int | None = None
    buy_price: float | None = None
    reason: str | None = None
    intent: str | None = None
    time_horizon: str | None = None
    review_price: float | None = None
    review_date: str | None = None

class ConfirmInvestmentRequest(InvestmentDetails):
    original_note: str = Field(min_length=3, max_length=2000)

class ReviewRequest(BaseModel):
    review_note: str | None = None
    next_review_date: str | None = None

class UpdateInvestmentRequest(InvestmentDetails):
    original_note: str | None = None
@app.get("/")
def home():
    return {"message": "Investment Memory API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/extract-investment", response_model=InvestmentDetails)
async def extract_investment(request: InvestmentNote):
    prompt = f"""
You extract investment details from a user's personal investment note.

Extract only information explicitly stated in the note.
Do not provide financial advice or invent missing details.
If a field is not stated, use null.
Return only one valid JSON object. Do not include markdown fences.

Required JSON fields:
{{
  "stock": string or null,
  "quantity": integer or null,
  "buy_price": number or null,
  "reason": string or null,
  "intent": string or null,
  "time_horizon": string or null,
  "review_price": number or null,
  "review_date": string or null
}}

Interpretation:
- "review_price" is a price at which the user said they want to review the investment.
- Do not interpret a review price as a buy or sell instruction.
- Keep the user's stated intent; do not invent one.

User note:
{request.note}
"""

    try:
        if AI_MODE == "local":
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    OLLAMA_URL,
                    json={
                        "model": LOCAL_MODEL_NAME,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                        "options": {"temperature": 0}
                    }
                )

            response.raise_for_status()

            result = response.json()
            extracted_text = result["response"]

        else:
            response = await hf_client.chat_completion(
                model=HF_TEXT_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=500
            )

            extracted_text = response.choices[0].message.content

        extracted_data = json.loads(extracted_text)

        validated = InvestmentDetails.model_validate(
            extracted_data
        )

        return validated

    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Could not communicate with Ollama: {str(error)}"
        )

    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail=f"Model returned invalid investment data: {str(error)}"
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Hosted AI extraction failed: {str(error)}"
        )

@app.post("/investments")
def save_investment(
    request: ConfirmInvestmentRequest,
    db: Session = Depends(get_db)
):
    if not request.stock or not request.stock.strip():
        raise HTTPException(
            status_code=400,
            detail="Stock name is required."
        )

    investment = Investment(
        stock=request.stock,
        quantity=request.quantity,
        buy_price=request.buy_price,
        reason=request.reason,
        intent=request.intent,
        time_horizon=request.time_horizon,
        review_price=request.review_price,
        review_date=request.review_date,
        original_note=request.original_note
    )

    try:
        db.add(investment)
        db.commit()
        db.refresh(investment)

        return {
            "message": "Investment saved successfully",
            "investment_id": investment.id,
            "stock": investment.stock
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save investment."
        )

# Load the local Whisper model only once.
# "small" is a reasonable starting point for CPU inference.
whisper_model = None

if AI_MODE == "local":
    from faster_whisper import WhisperModel

    whisper_model = WhisperModel(
        "small",
        device="cpu",
        compute_type="int8"
    )

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an audio file."
        )

    try:
        audio_bytes = await audio.read()

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="The uploaded audio file is empty."
            )

        if AI_MODE == "hosted":
            result = await hf_client.automatic_speech_recognition(
                audio=audio_bytes,
                model=HF_ASR_MODEL
            )

            transcription = result.text.strip()

        else:
            temp_path = None

            try:
                with tempfile.NamedTemporaryFile(
                    delete=False,
                    suffix=".audio"
                ) as temp_file:
                    temp_path = temp_file.name
                    temp_file.write(audio_bytes)

                segments, info = whisper_model.transcribe(
                    temp_path,
                    beam_size=5
                )

                transcription = " ".join(
                    segment.text.strip()
                    for segment in segments
                ).strip()

            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)

        if not transcription:
            raise HTTPException(
                status_code=422,
                detail="No speech was detected. Please try recording again."
            )

        return {
            "text": transcription,
            "language": "unknown" if AI_MODE == "hosted" else info.language
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Audio transcription failed: {str(error)}"
        )

    finally:
        await audio.close()

@app.get("/investments")
def get_investments(db: Session = Depends(get_db)):
    investments = (
        db.query(Investment)
        .order_by(Investment.created_at.desc())
        .all()
    )

    return investments

@app.get("/search")
def search_investments(q: str, db: Session = Depends(get_db)):
    query = q.strip()

    if not query:
        return []

    pattern = f"%{query}%"

    results = (
        db.query(Investment)
        .filter(
            or_(
                Investment.stock.ilike(pattern),
                Investment.reason.ilike(pattern),
                Investment.original_note.ilike(pattern),
                Investment.intent.ilike(pattern),
            )
        )
        .order_by(Investment.created_at.desc())
        .all()
    )

    return [
        {
            "id": item.id,
            "stock": item.stock,
            "quantity": item.quantity,
            "buy_price": item.buy_price,
            "reason": item.reason,
            "intent": item.intent,
            "time_horizon": item.time_horizon,
            "review_price": item.review_price,
            "review_date": item.review_date,
            "original_note": item.original_note,
            "created_at": item.created_at,
        }
        for item in results
    ]

@app.post("/investments/{investment_id}/reviews")
def mark_reviewed(
    investment_id: int,
    request: ReviewRequest,
    db: Session = Depends(get_db)
):
    investment = (
        db.query(Investment)
        .filter(Investment.id == investment_id)
        .first()
    )

    if not investment:
        raise HTTPException(
            status_code=404,
            detail="Investment not found."
        )

    review = Review(
        investment_id=investment.id,
        review_note=request.review_note,
        next_review_date=request.next_review_date
    )

    try:
        db.add(review)

        # Move the investment to its next review date.
        # If no next date is supplied, the investment will no longer
        # appear in the due/overdue reminder list.
        investment.review_date = request.next_review_date

        db.commit()
        db.refresh(review)

        return {
            "message": "Review recorded successfully",
            "investment_id": investment.id,
            "review_id": review.id,
            "next_review_date": investment.review_date
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not record review."
        )

@app.get("/investments/{investment_id}/reviews")
def get_review_history(
    investment_id: int,
    db: Session = Depends(get_db)
):
    investment = (
        db.query(Investment)
        .filter(Investment.id == investment_id)
        .first()
    )

    if not investment:
        raise HTTPException(
            status_code=404,
            detail="Investment not found."
        )

    reviews = (
        db.query(Review)
        .filter(Review.investment_id == investment_id)
        .order_by(Review.reviewed_at.desc())
        .all()
    )

    return [
        {
            "id": review.id,
            "investment_id": review.investment_id,
            "review_note": review.review_note,
            "reviewed_at": review.reviewed_at,
            "next_review_date": review.next_review_date,
        }
        for review in reviews
    ]

@app.put("/investments/{investment_id}")
def update_investment(
    investment_id: int,
    request: UpdateInvestmentRequest,
    db: Session = Depends(get_db)
):
    investment = (
        db.query(Investment)
        .filter(Investment.id == investment_id)
        .first()
    )

    if not investment:
        raise HTTPException(
            status_code=404,
            detail="Investment not found."
        )

    if not request.stock or not request.stock.strip():
        raise HTTPException(
            status_code=400,
            detail="Stock name is required."
        )

    investment.stock = request.stock.strip()
    investment.quantity = request.quantity
    investment.buy_price = request.buy_price
    investment.reason = request.reason
    investment.intent = request.intent
    investment.time_horizon = request.time_horizon
    investment.review_price = request.review_price
    investment.review_date = request.review_date

    if request.original_note is not None:
        investment.original_note = request.original_note

    try:
        db.commit()
        db.refresh(investment)

        return {
            "message": "Investment updated successfully",
            "investment_id": investment.id,
            "stock": investment.stock
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update investment."
        )
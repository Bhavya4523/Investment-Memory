import json
import httpx
import os
import shutil
import tempfile
from fastapi import UploadFile, File,FastAPI, HTTPException
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi import Depends
from sqlalchemy.orm import Session
from database import Base, engine, get_db
from models import Investment,Review
from sqlalchemy import or_
app = FastAPI(title="Investment Memory API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma3:4b"


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
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                OLLAMA_URL,
                json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0}
                }
            )

        response.raise_for_status()
        result = response.json()
        extracted_text = result["response"]

        extracted_data = json.loads(extracted_text)

        # Validate model output against our expected fields and types.
        validated = InvestmentDetails.model_validate(extracted_data)

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

    temp_path = None

    try:
        # Save uploaded audio temporarily so Whisper can process it.
        with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as temp_file:
            temp_path = temp_file.name
            shutil.copyfileobj(audio.file, temp_file)

        segments, info = whisper_model.transcribe(
            temp_path,
            beam_size=5
        )

        transcription = " ".join(segment.text.strip() for segment in segments).strip()

        return {
            "text": transcription,
            "language": info.language
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Audio transcription failed: {str(e)}"
        )

    finally:
        await audio.close()

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

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
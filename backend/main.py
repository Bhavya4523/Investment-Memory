import json
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi import Depends
from sqlalchemy.orm import Session
from database import Base, engine, get_db
from models import Investment

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

@app.get("/investments")
def get_investments(db: Session = Depends(get_db)):
    investments = (
        db.query(Investment)
        .order_by(Investment.created_at.desc())
        .all()
    )

    return investments
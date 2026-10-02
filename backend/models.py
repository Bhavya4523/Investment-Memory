from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, index=True)

    stock = Column(String(100), nullable=False)
    quantity = Column(Integer, nullable=True)
    buy_price = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    intent = Column(String(100), nullable=True)
    time_horizon = Column(String(100), nullable=True)
    review_price = Column(Float, nullable=True)
    review_date = Column(String(30), nullable=True)

    original_note = Column(Text, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    reviews = relationship(
        "Review",
        back_populates="investment",
        cascade="all, delete-orphan"
    )


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)

    investment_id = Column(
        Integer,
        ForeignKey("investments.id"),
        nullable=False
    )

    review_note = Column(Text, nullable=True)

    reviewed_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    next_review_date = Column(String(30), nullable=True)

    investment = relationship(
        "Investment",
        back_populates="reviews"
    )
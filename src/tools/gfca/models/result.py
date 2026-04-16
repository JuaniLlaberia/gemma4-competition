from pydantic import BaseModel, Field
from typing import List

from .claim import ClaimReview

class FactCheckResult(BaseModel):
    claim_text: str
    claimant: str
    claim_date: str
    similarity_score: float
    reviews: List[ClaimReview] = Field(default_factory=list)
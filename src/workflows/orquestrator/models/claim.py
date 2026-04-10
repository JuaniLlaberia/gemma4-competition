from pydantic import BaseModel, Field
from enum import Enum

class Claim(BaseModel):
    text: str = Field(..., description="Extracted verifiable sentence")
    relevance_score: float | None = Field(..., ge=0, le=1, description="Score from 0 to 1 based con how relevant is this claim")
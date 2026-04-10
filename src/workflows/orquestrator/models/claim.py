from pydantic import BaseModel, Field
from enum import Enum

class ClaimLabel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class Claim(BaseModel):
    text: str = Field(..., description="Extracted verifiable sentence")
    relevance_score: float | None = Field(..., ge=0, le=1, description="Score from 0 to 1 based con how relevant is this claim")
    label: ClaimLabel | None = Field(None, description="Type of claim after analysis")
    analysis: str | None = Field(None, description="Claim analysis based on retrieve information from GFCA or RAG")
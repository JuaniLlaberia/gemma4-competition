from pydantic import BaseModel, Field
from enum import Enum

class Claim(BaseModel):
    text: str = Field(..., description="Extracted verifiable sentence")
    search_query: str = Field(..., description="Optimized 2-4 word keyword query")
    relevance_score: float | None = Field(..., ge=0, le=1, description="Score from 0 to 1 based con how relevant is this claim")
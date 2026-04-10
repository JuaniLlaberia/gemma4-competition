from pydantic import BaseModel, Field
from typing import List

class ExtractorOutput(BaseModel):
    claims: List[str] = Field(..., description="List of extracted claims from given text. It can be empty if none are present")

class NormalizatorOutput(BaseModel):
    claims: List[str] = Field(..., description="List of normalized and syntactically well written claims extracted from the raw claims")
    
class RankedClaim(BaseModel):
    text: str = Field(..., description="Provided claim")
    relevance_score: float = Field(..., ge=0, le=1, description="Relevance score for provided claim based on how researchable is")
    reason: str = Field(..., description="Brief explanation of why this claim received its score, referencing specific elements like named actors, data points, or public impact")

class RankerOutput(BaseModel):
    claims: List[RankedClaim] = Field(..., description="List ranked claims each containing it's claim and relevance score")
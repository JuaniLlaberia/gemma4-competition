from pydantic import BaseModel, Field
from typing import List

class ExtractorOutput(BaseModel):
    claims: List[str] = Field(..., description="List of extracted claims from given text. It can be empty if none are present")

class NormalizedClaim(BaseModel):
    text: str = Field(..., description="Normalized claim text")
    search_query: str = Field(..., description="Optimized 2-4 word keyword query for Google Fact Check API")

class NormalizatorOutput(BaseModel):
    claims: List[NormalizedClaim] = Field(..., description="List of normalized and syntactically well written claims extracted from the raw claims")

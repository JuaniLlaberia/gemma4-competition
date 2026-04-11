from pydantic import BaseModel, Field
from typing import List

class ExtractorOutput(BaseModel):
    claims: List[str] = Field(..., description="List of extracted claims from given text. It can be empty if none are present")

class NormalizatorOutput(BaseModel):
    claims: List[str] = Field(..., description="List of normalized and syntactically well written claims extracted from the raw claims")
    

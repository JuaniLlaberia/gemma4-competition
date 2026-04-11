from pydantic import BaseModel
from typing import List, Optional
from src.workflows.orquestrator.models.claim import Claim

class AnalysisRequest(BaseModel):
    role: str
    text: Optional[str] = None
    image: Optional[str] = None

class ResumeRequest(BaseModel):
    thread_id: str
    claims: List[Claim]
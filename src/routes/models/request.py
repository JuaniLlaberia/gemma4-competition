from pydantic import BaseModel
from typing import List
from src.workflows.orquestrator.models.claim import Claim

class AnalysisRequest(BaseModel):
    text: str

class ResumeRequest(BaseModel):
    thread_id: str
    claims: List[Claim]
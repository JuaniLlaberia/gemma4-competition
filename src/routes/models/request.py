from pydantic import BaseModel
from typing import List

class AnalysisRequest(BaseModel):
    text: str

class ResumeRequest(BaseModel):
    thread_id: str
    claims: List[str]
from pydantic import BaseModel, Field
from typing import List, Optional
from src.workflows.analyzer.models.output import ClaimVeredict, AnalysisVerdict, EvidenceItem

class AnalyzedClaim(BaseModel):
    text: str = Field(..., description="Extracted verifiable sentence")
    relevance_score: float | None = Field(..., ge=0, le=1, description="Score from 0 to 1 based con how relevant is this claim")
    
    veredict: ClaimVeredict
    confidence: float
    reasoning: str
    analysis: AnalysisVerdict
    analysis_confidence: float
    evidence_used: List[EvidenceItem]
    limitations: str

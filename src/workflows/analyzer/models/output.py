from pydantic import BaseModel, Field
from enum import Enum
from typing import List

class ClaimVerifiability(Enum):
    LIKELY_VERIFIABLE = "likely_verifiable"
    LIKELY_UNVERIFIABLE = "likely_unverifiable"
    UNCERTAIN = "uncertain"

class ClaimVeredict(Enum):
    PLAUSIBLE = "plausible"
    IMPLAUSIBLE = "implausible"
    UNCERTAIN = "uncertain"

class VeredictOutput(BaseModel):
    verifiability: ClaimVerifiability = Field(..., description="Model-based assessment of the claim's verifiability using internal knowledge only (no external evidence)")
    veredict: ClaimVeredict = Field(..., description="Model-based assessment of the claim's plausibility using internal knowledge only (no external evidence)")
    confidence: float = Field(..., ge=0, le=1, description="How confident the llm is about the given veredict for this claim")
    reasoning: str = Field(..., description="One or two sentences justifying the choosen veredict for this claim")

class AnalysisVerdict(Enum):
    SUPPORT = "support"
    CONTRADICT = "contradict"
    NO_EVIDENCE = "no_evidence"

class EvidenceItem(BaseModel):
    excerpt: str = Field(..., description="Exact text snippet from the source used as evidence")
    source_url: str = Field(..., description="Source URL from where excerpt was extracted")
    relevance: float = Field(..., ge=0, le=1, description="Relevance score of this evidence to the claim.")

class AnalysisOutput(BaseModel):
    analysis: AnalysisVerdict
    confidence: float = Field(..., ge=0, le=1)
    evidence_used: List[EvidenceItem] = Field(..., description="List of evidence snippets used to support the analysis.")
    limitations: str = Field(..., description="Why the evidence may be insufficient, incomplete, or indirect")
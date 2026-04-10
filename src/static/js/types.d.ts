// Mirrors src/workflows/orquestrator/models/claim.py
export interface Claim {
  text: string;
  relevance_score: number | null;
}

// Enums from src/workflows/analyzer/models/output.py
export type ClaimVerifiability = 'likely_verifiable' | 'likely_unverifiable' | 'uncertain';
export type ClaimVeredict = 'plausible' | 'implausible' | 'uncertain';
export type AnalysisVerdict = 'support' | 'contradict' | 'no_evidence';

export interface EvidenceItem {
  excerpt: string;
  source_url: string;
  relevance: number;
}

// Mirrors src/workflows/orquestrator/models/analyzed_claim.py
export interface AnalyzedClaim {
  text: string;
  relevance_score: number | null;
  veredict: ClaimVeredict;
  confidence: number;
  reasoning: string;
  analysis: AnalysisVerdict;
  analysis_confidence: number;
  evidence_used: EvidenceItem[];
  limitations: string;
}

// From src/tools/gfca/models/
export interface ClaimReview {
  rating_raw: string;
  rating_normalized: string;
  reviewer_name: string;
  reviewer_site: string;
  review_url: string;
  review_date: string;
  language: string;
}

export interface FactCheckResult {
  claim_text: string;
  claimant: string;
  claim_date: string;
  similarity_score: number;
  reviews: ClaimReview[];
}

// SSE event shapes
export interface SSEProgressEvent {
  message: string;
  connection?: boolean;
  claims_amount?: number;
  results_amount?: number;
}

export interface SSEInterruptEvent {
  interrupt: true;
  thread_id: string;
  claims: Claim[];
}

export interface SSEClaimResultEvent {
  claim_result: AnalyzedClaim;
}

export interface SSEDoneEvent {
  done: true;
  analyzed_claims?: AnalyzedClaim[];
}

export type SSEEvent = SSEProgressEvent | SSEInterruptEvent | SSEClaimResultEvent | SSEDoneEvent;

// App state machine
export type AppState =
  | 'role_select'
  | 'input'
  | 'streaming_phase1'
  | 'claims_review'
  | 'streaming_phase2'
  | 'done';

// Message log
export type MessageType =
  | 'user_input'
  | 'progress'
  | 'progress_connection'
  | 'progress_claims_count'
  | 'interrupt'
  | 'claim_result'
  | 'stopped'
  | 'done'
  | 'error';

export interface LogMessage {
  type: MessageType;
  data: unknown;
}

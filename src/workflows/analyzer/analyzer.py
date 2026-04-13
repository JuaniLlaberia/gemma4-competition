import os
from langgraph.graph import StateGraph, START, END
from langchain_core.callbacks import adispatch_custom_event
from typing import TypedDict, Dict, Any, Literal, List

from src.llm.ollama import Ollama
from src.workflows.orquestrator.models.claim import Claim
from src.tools.gfca.models.result import FactCheckResult
from src.tools.gfca.gfca import GFCAClient
from src.utils.helper import detect_language
from src.tools.vector_db.db import vector_store_manager
from .models.output import AnalysisVerdict, ClaimVeredict, EvidenceItem, VeredictOutput, AnalysisOutput
from .utils.prompts import CLAIM_VEREDICT_PROMPT, CLAIM_ANALYSIS_PROMPT

class State(TypedDict):
    # Claim data
    claim: Claim
    role: str
    fgca_results: List[FactCheckResult]
    rag_results: List[Dict[str, Any]]
    has_connection: bool
    use_rag: bool
    # Veredict data
    veredict: ClaimVeredict
    confidence: float
    reasoning: str
    # Analysis data
    analysis: AnalysisVerdict
    analysis_confidence: float
    evidence_used: List[EvidenceItem]
    limitations: str


class Analyzer:
    """
    Workflow for claims analysis and source retrieval.

    Attributes:
        role (str): User role in current session.
        has_connection (bool): Whether the user has internet connection or not.
        use_rag (bool): Whether to retrieve documents from vector DB.
        fgca_client (GFCAClient): Instance of FGCA to call the api for fact checking results.
        gemma (Ollama): Instance of Ollama using gemma4 models family.
        graph (StateGraph): Workflow's graph.
    """ 
    def __init__(self, role: str, has_connection: bool = False, use_rag: bool = False):
        """
        Args:
            role (str): User role in current session.
            has_connection (bool): Boolean determining whether the user has internet connection or not.
            use_rag (bool): Boolean determining whether RAG documents are available to query.
        """
        self.role = role
        self.has_connection = has_connection
        self.use_rag = use_rag
        self.gfca_client = GFCAClient(api_key=os.getenv("GFCA_API_KEY")) if has_connection else None
        self.gemma = Ollama()
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """
        Builds langgraph workflow graph.

        Returns:
            StateGraph: Instance of langgraph graph.
        """
        graph = StateGraph(State)

        graph.add_node("gfca", self._gfca_node)
        graph.add_node("rag_router", lambda _state: {})
        graph.add_node("rag", self._rag_node)
        graph.add_node("claim_veredict", self._claim_veredict_node)
        graph.add_node("analysis_router", lambda _state: {})
        graph.add_node("claim_analysis", self._claim_analysis_node)

        graph.add_conditional_edges(
            START,
            self._connection_router,
            {
                "has_connection": "gfca",
                "no_connection": "rag_router"
            }
        )
        graph.add_edge("gfca", "rag_router")
        graph.add_conditional_edges(
            "rag_router",
            self._rag_router,
            {
                "has_context": "rag",
                "no_context": "claim_veredict"
            }
        )
        graph.add_edge("rag", "claim_veredict")
        graph.add_edge("claim_veredict", "analysis_router")
        graph.add_conditional_edges(
            "analysis_router",
            self._analysis_router,
            {
                "has_extra_information": "claim_analysis",
                "no_extra_information": END
            }
        )
        graph.add_edge("claim_analysis", END)

        return graph.compile()
    
    async def _connection_router(self, state: State) -> Literal["has_connection", "no_connection"]:
        """
        Routes the graph based on user internet connection availability.

        Args:
            state (State): Graph state.
        Returns:
            "has_connection" | "no_connection": Route to take based on internet connection.
        """
        return "has_connection" if state["has_connection"] else "no_connection"

    async def _gfca_node(self, state: State) -> Dict[str, Any]:
        """
        Performs claim evidence search using FGCA API.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        language = detect_language(text=state["claim"].text)
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "claim": state["claim"].text,
                "message": f"Retrieving evidence from Google Fact Check for keywords: '{state['claim'].search_query}'...",
            }
        )

        try:
            results = await self.gfca_client.search(
                query=state["claim"].search_query,
                language_code=language
            )

            await adispatch_custom_event(
                "progress", 
                {
                    "type": "SUCCESS",
                    "claim": state["claim"].text,
                    "message": f"{len(results)} results found",
                    "results_amount": len(results)
                }
            )
            return {
                "fgca_results": results,
            }
        except Exception as e:
            await adispatch_custom_event(
                "progress", 
                {
                    "type": "ERROR",
                    "claim": state["claim"].text,
                    "message": "Failed to retrieve evidence from Google Fact Check",
                    "error": e
                }
            )
            return {
                "fgca_results": [],
            }

    async def _rag_router(self, state: State) -> Literal["has_context", "no_context"]:
        """
        Routes graph based on RAG context present in system.

        Args:
            state (State): Graph state.
        Returns:
            "has_context" | "no_context": Route to take based on RAG context availability.
        """
        return "has_context" if state.get("use_rag") else "no_context"

    async def _rag_node(self, state: State) -> Dict[str, Any]:
        """
        Performs claim evidence search using RAG to retrieve context for LLM.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "claim": state["claim"].text,
                "message": "Retrieving evidence from documents...",
            }
        )

        try:
            results = vector_store_manager.similarity_search(state["claim"].text, k=5)
            rag_results = [{"content": doc.page_content, "metadata": doc.metadata} for doc in results]
            
            await adispatch_custom_event(
                "progress", 
                {
                    "type": "SUCCESS",
                    "claim": state["claim"].text,
                    "message": "Found context in documents",
                }
            )
            return {"rag_results": rag_results}
        except Exception as e:
            await adispatch_custom_event(
                "progress", 
                {
                    "type": "ERROR",
                    "claim": state["claim"].text,
                    "message": "Failed to retrieve context from documents",
                    "error": str(e)
                }
            )
            return {"rag_results": []}

    async def _claim_veredict_node(self, state: State) -> Dict[str, Any]:
        """
        Handles the pre-evidence analysis.
        
        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "claim": state["claim"].text,
                "message": "Running preliminary analysis..."
            }
        )

        response = await self.gemma.ainvoke_model(prompt=CLAIM_VEREDICT_PROMPT,
                                            output_schema=VeredictOutput,
                                            input={"claim": state["claim"],
                                                   "role": state["role"]})
        
        if isinstance(response, VeredictOutput):
            data = {
                "veredict": response.veredict,
                "confidence": response.confidence,
                "reasoning": response.reasoning
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {"veredict": "uncertain",
                    "confidence": 0.0,
                    "reasoning": "Fail to analyze claim"}
        else:
            response_data = response.model_dump()
            data = {
                "veredict": response_data.get("veredict", "uncertain"),
                "confidence": response_data.get("confidence", 0.0),
                "reasoning": response_data.get("reasoning", ""),
            }

        await adispatch_custom_event(
            "progress", 
            {
                "type": "SUCCESS",
                "claim": state["claim"].text,
                "message": "Preliminary analysis completed"
            }
        )

        return {**data}

    async def _analysis_router(self, state: State) -> Literal["has_extra_information", "no_extra_information"]:
        """
        Routes graph based on GFCA or RAG context availability.

        Args:
            state (State): Graph state.
        Returns:
            "has_extra_information" | "no_extra_information": Route to take based on GFCA or RAG context availability.
        """
        return "has_extra_information" if len(state["fgca_results"]) >= 1 or len(state["rag_results"]) >= 1 else "no_extra_information"

    async def _claim_analysis_node(self, state: State) -> Dict[str, Any]:
        """
        Handles post-evidence claim analysis based on either GFCA data and/or RAG context.
        
        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "claim": state["claim"].text,
                "message": "Running evidence-based analysis..."
            }
        )

        response = await self.gemma.ainvoke_model(prompt=CLAIM_ANALYSIS_PROMPT,
                                            output_schema=AnalysisOutput,
                                            input={"claim": state["claim"],
                                                   "role": state["role"],
                                                   "fgca_results": state["fgca_results"],
                                                   "rag_results": state["rag_results"]})
        
        if isinstance(response, AnalysisOutput):
            data = {
                "analysis": response.analysis,
                "analysis_confidence": response.confidence,
                "evidence_used": response.evidence_used,
                "limitations": response.limitations,
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {
                "analysis": "no_evidence",
                "analysis_confidence": 0.0,
                "evidence_used": [],
                "limitations": "Fail to analyze claim",
            }
        else:
            response_data = response.model_dump()
            data = {
                "analysis": response_data.get("analysis", "no_evidence"),
                "analysis_confidence": response_data.get("confidence", 0.0),
                "evidence_used": response_data.get("evidence_used", []),
                "limitations": response_data.get("limitations", ""),
            }

        await adispatch_custom_event(
            "progress", 
            {
                "type": "SUCCESS",
                "claim": state["claim"].text,
                "message": "Evidence-based analysis completed"
            }
        )

        return {**data}

    async def run(self, claim: Claim) -> Dict[str, Any]:
        """
        Runs claim analyzer workflow.

        Args:
            claim (Claim): Claim to analyze.
        Returns:
            Dict[str, Any]: A dictionary containing the analysis results with the following keys:
                - veredict (ClaimVeredict): The verdict of the claim.
                - confidence (float): Confidence score for the verdict.
                - reasoning (str): Reasoning behind the verdict.
                - analysis (AnalysisVerdict): Analysis verdict based on evidence.
                - analysis_confidence (float): Confidence score for the analysis.
                - evidence_used (List[EvidenceItem]): List of evidence items used.
                - limitations (str): Any limitations in the analysis.
        """
        initial_state = State(
            claim=claim,
            role=self.role,
            has_connection=self.has_connection,
            use_rag=self.use_rag,
            rag_results=[],
            fgca_results=[],
            veredict="uncertain",
            confidence=0.0,
            reasoning="",
            analysis="no_evidence",
            analysis_confidence=0.0,
            evidence_used=[],
            limitations="",
        )
        
        results = await self.graph.ainvoke(initial_state)

        return {
            "veredict": results["veredict"],
            "confidence": results["confidence"],
            "reasoning": results["reasoning"],
            "analysis": results["analysis"],
            "analysis_confidence": results["analysis_confidence"],
            "evidence_used": results["evidence_used"],
            "limitations": results["limitations"],  
        }
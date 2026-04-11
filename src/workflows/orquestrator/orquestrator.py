import asyncio
import operator
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt
from langchain_core.callbacks import adispatch_custom_event
from langgraph.checkpoint.memory import MemorySaver
from typing import TypedDict, Dict, Any, List, Annotated, Literal

from .models.claim import Claim
from .models.analyzed_claim import AnalyzedClaim
from src.workflows.extractor.extractor import Extractor
from src.workflows.analyzer.analyzer import Analyzer

class State(TypedDict):
    text: str
    role: str
    claims: List[Claim] = []
    has_connection: bool = False
    use_rag: bool = False
    analyzed_claims: Annotated[List[AnalyzedClaim], operator.add] = []

class Orquestrator:
    """
    Workflow for claims extraction and analysis. It has the regular (offline) and the enhanced version (connected to GFCA).

    Attributes:
        graph (StateGraph): Workflow's graph.
    """ 
    def __init__(self):
        """
        Initialices Orquestrator workflow class.
        """
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """
        Builds langgraph workflow graph.

        Returns:
            StateGraph: Instance of langgraph graph.
        """
        graph = StateGraph(State)

        graph.add_node("extractor", self._extractor_node)
        graph.add_node("manual_ranking", self._manual_ranking_node)
        graph.add_node("connection_check", self._check_connection_node)
        graph.add_node("analyzer", self._analyzer_node)

        graph.set_entry_point("extractor")
        graph.add_edge("extractor", "manual_ranking")
        graph.add_edge("manual_ranking", "connection_check")
        graph.add_edge("connection_check", "analyzer")
        
        graph.add_conditional_edges(
            "analyzer",
            self._check_remaining_claims_router,
            {
                "continue": "analyzer",
                "end": END
            }
        )

        return graph.compile(checkpointer=self.checkpointer)
    
    async def _extractor_node(self, state: State) -> Dict[str, Any]:
        """
        Handles execution of extractor sub-graph. The sub-graph internally performs claims extraction,
        normalization, decomposition and relevance ranking.
        
        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the global state.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "message": "Extracting claims from provided text...",
            }
        )

        extractor = Extractor(role=state["role"])
        results = await extractor.run(text=state["text"])

        return {"claims": results["claims"]}

    async def _manual_ranking_node(self, state: State) -> Dict[str, Any]:
        """
        Interruption node to allow the user to re-rank or remove claims.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the global state.
        """
        user_ranking = interrupt({"claims": state["claims"]})
        
        return {"claims": user_ranking}

    async def _check_connection_node(self, state: State) -> Dict[str, Any]:
        """
        Routes the graph based on user internet connection availability.

        Args:
            state (State): Graph state.
        Returns:
            "has_connection" | "no_connection": Route to take based on internet connection.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "message": "Validating your internet connection...",
            }
        )

        HOST = "8.8.8.8"
        PORT = 53

        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(HOST, PORT), timeout=3.0)
            writer.close()
            await writer.wait_closed()

            await adispatch_custom_event(
                "progress", 
                {
                    "type": "SUCCESS",
                    "message": "Internet connection validated. Using Google Fact Check to enhance analysis",
                    "connection": True
                }
            )
            return {
                "has_connection": True
            }
        except Exception:
            await adispatch_custom_event(
                "progress", 
                {
                    "type": "INFO",
                    "message": "Internet connection failed. Skipping Google Fact Check",
                    "connection": False
                }
            )
            return {
                "has_connection": False
            }

    async def _analyzer_node(self, state: State) -> Dict[str, Any]:
        """
        Handles execution of analyzer sub-graph. The sub-graph internally performs claim validation to
        label it based on research importance and if GFCA and/or RAG is enable, it also performs an
        analysis of the claim.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the global state.
        """
        analyzer = Analyzer(has_connection=state["has_connection"], use_rag=state.get("use_rag", False), role=state["role"])
        
        index = len(state.get("analyzed_claims", []))
        claims = state.get("claims", [])
        
        if index >= len(claims):
            return state
            
        claim = claims[index]
        
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "message": f"Initializing claim analysis: {claim.text}..."
            }
        )
        
        analyzer_result = await analyzer.run(claim=claim)
        
        analyzed_claim = AnalyzedClaim(
            text=claim.text,
            relevance_score=claim.relevance_score,
            veredict=analyzer_result["veredict"],
            confidence=analyzer_result["confidence"],
            reasoning=analyzer_result["reasoning"],
            analysis=analyzer_result["analysis"],
            analysis_confidence=analyzer_result["analysis_confidence"],
            evidence_used=analyzer_result["evidence_used"],
            limitations=analyzer_result["limitations"]
        )

        await adispatch_custom_event(
            "claim_result", 
            {
                "type": "SUCCESS",
                "claim": analyzed_claim.model_dump(),
                "message": f"Completed claim analysis"
            }
        )

        return {"analyzed_claims": [analyzed_claim]}

    async def _check_remaining_claims_router(self, state: State) -> Literal["continue", "end"]:
        """
        Routes the graph based on remaining claims to analyze.
        
        Args:
            state (State): Graph state.
        Returns:
            "continue" | "end": Route to take.
        """
        if len(state.get("analyzed_claims", [])) < len(state.get("claims", [])):
            return "continue"
        return "end"
from langgraph.graph import StateGraph
from langgraph.types import interrupt
from langgraph.checkpoint.memory import MemorySaver
from typing import TypedDict, Dict, Any, List

from .models.claim import Claim
from src.workflows.extractor.extractor import Extractor

class State(TypedDict):
    text: str
    claims: List[Claim]

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
        graph.add_node("analyzer", self._analyzer_node)

        graph.set_entry_point("extractor")
        graph.add_edge("extractor", "manual_ranking")
        graph.add_edge("manual_ranking", "analyzer")
        graph.set_finish_point("analyzer")

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
        extractor = Extractor()
        results = extractor.run(text=state["text"])

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
        
        return {"ranked_claims": user_ranking}

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
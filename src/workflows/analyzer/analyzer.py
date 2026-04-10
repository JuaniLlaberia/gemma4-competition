import os
from langgraph.graph import StateGraph, START, END
from langchain_core.callbacks import adispatch_custom_event
from typing import TypedDict, Dict, Any, Literal, List

from src.llm.ollama import Ollama
from src.workflows.orquestrator.models.claim import Claim
from src.tools.gfca.models.result import FactCheckResult
from src.tools.gfca.gfca import GFCAClient
from src.utils.helper import detect_language
from .models.output import VeredictOutput, AnalysisOutput
from .utils.prompts import CLAIM_VEREDICT_PROMPT, CLAIM_ANALYSIS_PROMPT

class State(TypedDict):
    claim: Claim
    fgca_results: List[FactCheckResult]
    rag_results: List[Dict[str, Any]]
    has_connection: bool

class Analyzer:
    """
    Workflow for claims analysis and source retrieval.

    Attributes:
        fgca_client (GFCAClient): Instance of FGCA to call the api for fact checking results.
        gemma (Ollama): Instance of Ollama using gemma4 models family.
        graph (StateGraph): Workflow's graph.
    """ 
    def __init__(self):
        """
        """
        self.gfca_client = GFCAClient(api_key=os.getenv("GFCA_API_KEY"))
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
        graph.add_node("rag_router", self._rag_router)
        graph.add_node("rag", self._rag_node)
        graph.add_node("claim_veredict", self._claim_veredict_node)
        graph.add_node("analysis_router", self._analysis_router)
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
                "type": "...",
                "message": "Retrieving evidence from Google Fact Check...",
            }
        )

        results = await self.gfca_client.search(
            query=state["claim"].text,
            language_code=language
        )

        await adispatch_custom_event(
            "progress", 
            {
                "type": "...",
                "message": f"{len(results)} results found",
                "results_amount": len(results)
            }
        )
        return {
            "fgca_results": results,
        }

    # TODO: Define rag context.
    async def _rag_router(self, state: State) -> Literal["has_context", "no_context"]:
        """
        Routes graph based on RAG context present in system.

        Args:
            state (State): Graph state.
        Returns:
            "has_context" | "no_context": Route to take based on RAG context availability.
        """
        return "has_context" if True else "no_context"

    # TODO: Implement RAG retrieval and ranking.
    async def _rag_node(self, state: State) -> Dict[str, Any]:
        """
        Performs claim evidence search using RAG to retrieve context for LLM.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        return state

    async def _claim_veredict_node(self, state: State) -> Dict[str, Any]:
        """

        
        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        response = self.gemma.ainvoke_model(prompt=CLAIM_VEREDICT_PROMPT,
                                            output_schema=VeredictOutput,
                                            input={"claim": state["claim"]})
        
        if isinstance(response, VeredictOutput):
            data = {
                "...": ...
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {"...": ...}
        else:
            response_data = response.model_dump()
            data = {
                "...": response_data.get("...", ...),
            }

        return state

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

        
        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the state.
        """
        response = self.gemma.ainvoke_model(prompt=CLAIM_ANALYSIS_PROMPT,
                                            output_schema=AnalysisOutput,
                                            input={"claim": state["claim"],
                                                   "fgca_results": state["fgca_results"],
                                                   "rag_results": state["rag_results"]})
        
        if isinstance(response, AnalysisOutput):
            data = {
                "...": ...
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {"...": ...}
        else:
            response_data = response.model_dump()
            data = {
                "...": response_data.get("...", ...),
            }

        return state

    async def run(self, claim: Claim, has_connection: bool) -> ...:
        """
        Runs claim analyzer workflow.

        Args:
            claim (Claim): Claim to analyze.
            has_connection (bool): Boolean determining whether the user has internet connection or not.
        Returns:
            ...
        """
        initial_state = State(claim=claim,
                              has_connection=has_connection,
                              rag_results=[],
                              fgca_results=[])
        
        results = await self.graph.ainvoke(initial_state)

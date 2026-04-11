from langgraph.graph import StateGraph, END
from langchain_core.callbacks import adispatch_custom_event
from typing import TypedDict, Dict, List, Any, Literal

from .models.output import ExtractorOutput, NormalizatorOutput, RankerOutput
from .utils.prompts import EXTRACTION_PROMPT, NORMALIZATION_PROMPT, RANKING_PROMPT
from src.workflows.orquestrator.models.claim import Claim
from src.llm.ollama import Ollama

class State(TypedDict):
    text: str
    role: str
    raw_claims: List[str]
    claims: List[Claim]

class Extractor:
    """
    Workflow for claims extraction.

    Attributes:
        role (str): User role in current session.
        gemma (Ollama): Instance of Ollama using gemma4 models family.
        graph (StateGraph): Workflow's graph.
    """ 
    def __init__(self, role: str):
        """
        Initialices Extractor workflow class.

        Args:
            role (str): User role in current session.
        """
        self.role = role
        self.gemma = Ollama()
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """
        Builds langgraph workflow graph.

        Returns:
            StateGraph: Instance of langgraph graph.
        """
        graph = StateGraph(State)

        graph.add_node("extraction", self._claims_extraction_node)
        graph.add_node("normalization", self._claims_normalization)
        graph.add_node("ranking", self._claims_ranking)

        graph.set_entry_point("extraction")
        graph.add_conditional_edges(
            "extraction",
            self._claims_amount_router,
            {
                "continue": "normalization",
                "end": END
            }
        )
        graph.add_edge("normalization", "ranking")
        graph.set_finish_point("ranking")

        return graph.compile()
    
    async def _claims_extraction_node(self, state: State) -> Dict[str, Any]:
        """
        Handles the claims extraction from given text.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the global state.
        """
        response = await self.gemma.ainvoke_model(prompt=EXTRACTION_PROMPT,
                                                  output_schema=ExtractorOutput,
                                                  input={"text": state["text"],
                                                         "role": state["role"]})
        
        if isinstance(response, ExtractorOutput):
            data = {
                "claims": response.claims
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {"claims": []}
        else:
            response_data = response.model_dump()
            data = {
                "claims": response_data.get("claims", []),
            }

        await adispatch_custom_event(
            "progress", 
            {
                "type": "SUCCESS",
                "message": f"{len(data['claims'])} claims have been extracted",
                "claims_amount": len(data["claims"])
            }
        )

        return {"raw_claims": data["claims"]}

    async def _claims_amount_router(self, state: State) -> Literal["continue", "end"]:
        """
        Router node to validate quantity of extracted claims.

        Args:
            state (State): Graph state.
        Returns:
            "continue" | "end": Route to take based on extracted claims amoun.
        """
        return "continue" if len(state["raw_claims"]) >= 1 else "end"

    async def _claims_normalization(self, state: State) -> Dict[str, Any]:
        """
        Handles claims normalization and decomposition.
        
        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the global state.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "message": "Normalizing claims...",
            }
        )

        response = await self.gemma.ainvoke_model(prompt=NORMALIZATION_PROMPT,
                                                  output_schema=NormalizatorOutput,
                                                  input={"raw_claims": state["raw_claims"]})
        
        if isinstance(response, NormalizatorOutput):
            data = {
                "claims": response.claims
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {"claims": []}
        else:
            response_data = response.model_dump()
            data = {
                "claims": response_data.get("claims", []),
            }

        await adispatch_custom_event(
            "progress", 
            {
                "type": "SUCCESS",
                "message": f"{len(data['claims'])} claims after normalization",
                "claims_amount": len(data["claims"])
            }
        )

        return {
            "raw_claims": data["claims"]
        }

    async def _claims_ranking(self, state: State) -> Dict[str, Any]:
        """
        Handles claims ranking by relevance and string preparation to be a 'Claim' object.

        Args:
            state (State): Graph state.
        Returns:
            dict[str, any]: Dictionary containing the properties to update in the global state.
        """
        await adispatch_custom_event(
            "progress", 
            {
                "type": "INFO",
                "message": "Ranking claims by relevance...",
            }
        )

        response = await self.gemma.ainvoke_model(prompt=RANKING_PROMPT,
                                                  output_schema=RankerOutput,
                                                  input={"claims": state["claims"]})
        
        if isinstance(response, RankerOutput):
            data = {
                "claims": response.claims
            }
        elif isinstance(response, dict) and response.get("error"):
            data = {"claims": []}
        else:
            response_data = response.model_dump()
            data = {
                "claims": response_data.get("claims", []),
            }

        sorted_claims = sorted(data["claims"], key=lambda x: x.relevance_score, reverse=True)

        await adispatch_custom_event(
            "progress", 
            {
                "type": "SUCCESS",
                "message": "Claims have been ranked and sorted",
            }
        )

        return {
            "claims": [Claim(text=claim.text, relevance_score=claim.relevance_score) for claim in sorted_claims]
        }

    async def run(self, text: str) -> List[Claim]:
        """
        Runs claims extractor graph.

        Args:
            text (str): Content to extract claims from.
        Returns:
            List[Claim]: List of claim objects containing text and relevance score, the rest None.
        """
        initial_state = State(
            text=text,
            role=self.role,
            raw_claims=[],
            claims=[]
        )

        results = await self.graph.ainvoke(initial_state)
        return results["claims"]
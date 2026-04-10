import json, uuid
from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from langgraph.types import Command

from .models.request import AnalysisRequest, ResumeRequest
from src.workflows.orquestrator.orquestrator import Orquestrator

router = APIRouter(prefix="/analyze", tags=["analysis"])
orquestrator = Orquestrator()

@router.post("/")
async def analyze_article(request: AnalysisRequest):
    """
    Endpoint to init claims extraction and analysis. It gets interrupted
    for user claims re-ranking.
    """
    if len(request.text) >= 10_000:
        return JSONResponse(content={"error": "Text is too long. Must be under 10,000 characters."}, status_code=400)

    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    async def stream():
        async for event in orquestrator.graph.astream_events({"text": request.text}, config=config, version="v2"):
            if event["event"] == "on_custom_event":
                match event["name"]:
                    case "progress":
                        yield f"data: {json.dumps(event['data'])}\n\n"

        state = orquestrator.graph.get_state(config)
        yield f"data: {json.dumps({'interrupt': True, 'thread_id': thread_id, 'claims': [c.model_dump() for c in state.values['claims']]})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

@router.post("/resume")
async def resume_analysis(request: ResumeRequest):
    """
    Endpoint to resume analysis after claims re-ranking.
    """
    config = {"configurable": {"thread_id": request.thread_id}}

    async def stream():
        async for event in orquestrator.graph.astream_events(Command(resume=request.claims), config=config, version="v2"):
            if event["event"] == "on_custom_event":
                match event["name"]:
                    case "progress":
                        yield f"data: {json.dumps(event['data'])}\n\n"

        state = orquestrator.graph.get_state(config)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
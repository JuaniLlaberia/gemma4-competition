from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
async def analyze_article():
    """
    Endpoint to check the health status of API server.
    """
    return JSONResponse(content={"ok": "ok"}, status_code=200)
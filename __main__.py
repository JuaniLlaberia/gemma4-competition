from fastapi import FastAPI
from dotenv import load_dotenv

from src.routes.analysis import router as analysis_router
from src.routes.health import router as health_router

load_dotenv()

app = FastAPI()
app.include_router(analysis_router)
app.include_router(health_router)
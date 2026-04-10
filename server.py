import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

from src.routes.analysis import router as analysis_router
from src.routes.health import router as health_router
from src.routes.frontend import router as frontend_router

load_dotenv()

save_dir = os.environ.get("SAVE_FILE_DIRECTORY")
if not save_dir:
    raise RuntimeError("SAVE_FILE_DIRECTORY environment variable is not set")
if not Path(save_dir).exists():
    raise RuntimeError(f"SAVE_FILE_DIRECTORY path does not exist: {save_dir}")

BASE_DIR = Path(__file__).parent

app = FastAPI()
app.mount("/static", StaticFiles(directory=BASE_DIR / "src" / "static"), name="static")
Jinja2Templates(directory=BASE_DIR / "src" / "templates")

app.include_router(analysis_router)
app.include_router(health_router)
app.include_router(frontend_router)

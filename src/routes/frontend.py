import os
import json
import signal
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from src.routes.models.role import RoleCreate
from src.routes.models.configuration import ConfigUpdate

BASE_DIR = Path(__file__).parent.parent.parent
templates = Jinja2Templates(directory=BASE_DIR / "src" / "templates")

router = APIRouter(tags=["frontend"])

def _save_dir() -> Path:
    return Path(os.environ["SAVE_FILE_DIRECTORY"])

# Page routes
@router.get("/", response_class=HTMLResponse)
async def role_select(request: Request):
    """
    Endpoint to generate the role selection page.
    """
    return templates.TemplateResponse(request, "pages/role_select.html")

@router.get("/chat", response_class=HTMLResponse)
async def chat(request: Request):
    """
    Endpoint to generate the analysis chat page.
    """
    return templates.TemplateResponse(request, "pages/chat.html")

# Role routes
@router.get("/roles")
async def list_roles():
    """
    Endpoint to list all available roles.
    """
    save_dir = _save_dir()
    roles = []
    for f in sorted(save_dir.glob("*.txt")):
        content = f.read_text(encoding="utf-8")
        preview = content[:120].replace("\n", " ").strip()
        if len(content) > 120:
            preview += "…"
        roles.append({"name": f.stem, "preview": preview})
    return roles

@router.post("/roles", status_code=201)
async def create_role(body: RoleCreate):
    """
    Endpoint to create a new role.
    """
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name cannot be empty")
    path = _save_dir() / f"{name}.txt"
    path.write_text(body.content, encoding="utf-8")
    return {"name": name}

@router.get("/roles/{name}")
async def get_role(name: str):
    """
    Endpoint to get a single role by name (full content).
    """
    path = _save_dir() / f"{name}.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Role not found")
    content = path.read_text(encoding="utf-8")
    return {"name": name, "content": content}

@router.delete("/roles/{name}", status_code=204)
async def delete_role(name: str):
    """
    Endpoint to delete a role.
    """
    path = _save_dir() / f"{name}.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Role not found")
    path.unlink()

# Configuration routes
def _config_path() -> Path:
    """
    Returns the path to the configuration file.
    """
    return _save_dir() / "config.json"

def _read_config() -> dict:
    """
    Reads the configuration file.
    """
    p = _config_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

@router.get("/config")
async def get_config():
    """
    Endpoint to get the current configuration.
    """
    cfg = _read_config()
    return {"gfca_api_key": cfg.get("gfca_api_key")}

@router.post("/config", status_code=204)
async def save_config(body: ConfigUpdate):
    """
    Endpoint to save the current configuration.
    """
    cfg = _read_config()
    cfg["gfca_api_key"] = body.gfca_api_key
    _config_path().write_text(json.dumps(cfg), encoding="utf-8")
    os.environ["GFCA_API_KEY"] = body.gfca_api_key

@router.delete("/config/gfca-key", status_code=204)
async def delete_gfca_key():
    """
    Endpoint to delete the GFCA API key.
    """
    cfg = _read_config()
    cfg.pop("gfca_api_key", None)
    _config_path().write_text(json.dumps(cfg), encoding="utf-8")
    os.environ.pop("GFCA_API_KEY", None)

# Shutdown route
@router.post("/shutdown", status_code=204)
async def shutdown():
    """
    Endpoint to shutdown the server.
    """
    os.kill(os.getpid(), signal.SIGKILL)

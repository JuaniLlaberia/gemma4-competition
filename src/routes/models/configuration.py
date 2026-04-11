from pydantic import BaseModel

class ConfigUpdate(BaseModel):
    gfca_api_key: str
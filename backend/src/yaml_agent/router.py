from fastapi import APIRouter, Depends

from .schema import ChatRequest, ChatResponse
from .service import YamlAgentService, get_service

router = APIRouter(tags=["yaml-agent"])


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, service: YamlAgentService = Depends(get_service)):
    return await service.chat(req)

"""
FastAPI Backend for Telegram Music Mini App
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

try:
    from backend.hitmo_parser_light import HitmoParser
except ImportError:
    from hitmo_parser_light import HitmoParser


# Pydantic модели
class Track(BaseModel):
    id: str
    title: str
    artist: str
    duration: int
    url: str
    image: str


class SearchResponse(BaseModel):
    results: List[Track]
    count: int


# Инициализация FastAPI
app = FastAPI(
    title="Telegram Music API",
    description="API для поиска и получения музыки через Hitmo парсер",
    version="1.0.0"
)

# CORS настройки для Telegram WebApp
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В production указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальный экземпляр парсера
parser = HitmoParser()


@app.get("/")
async def root():
    """Корневой endpoint"""
    return {
        "message": "Telegram Music API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Проверка работоспособности API"""
    return {
        "status": "healthy",
        "service": "telegram-music-api"
    }


@app.get("/api/search", response_model=SearchResponse)
async def search_tracks(
    q: str = Query(..., description="Поисковый запрос", min_length=1),
    limit: int = Query(20, description="Максимальное количество результатов", ge=1, le=50),
    page: int = Query(1, description="Номер страницы", ge=1)
):
    """
    Поиск треков по запросу
    
    Args:
        q: Поисковый запрос (название трека, исполнитель)
        limit: Максимальное количество результатов (1-50)
        
    Returns:
        Список найденных треков
    """
    try:
        # Выполняем поиск (синхронно, Selenium)
        tracks = parser.search(q, limit=limit, page=page)
        
        # Конвертируем в Pydantic модели и оборачиваем URL в прокси
        track_models = []
        base_url = "" # Используем относительный путь, чтобы работало через прокси
        
        for track in tracks:
            # Создаем прокси URL
            original_url = track['url']
            if original_url:
                # Кодируем URL
                from urllib.parse import quote
                encoded_url = quote(original_url)
                track['url'] = f"{base_url}/api/stream?url={encoded_url}"
            
            track_models.append(Track(**track))
        
        return SearchResponse(
            results=track_models,
            count=len(track_models)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при поиске: {str(e)}"
        )


@app.get("/api/track/{track_id}", response_model=Track)
async def get_track(track_id: str):
    """
    Получение информации о конкретном треке
    
    Args:
        track_id: ID трека
        
    Returns:
        Информация о треке
    """
    # Примечание: Hitmo не предоставляет прямой доступ к треку по ID
    # Этот endpoint можно расширить при необходимости
    raise HTTPException(
        status_code=501,
        detail="Получение трека по ID пока не реализовано. Используйте поиск."
    )


from fastapi.responses import StreamingResponse
import httpx

from fastapi import Request
from starlette.background import BackgroundTask

@app.get("/api/stream")
async def stream_audio(request: Request, url: str = Query(..., description="URL аудио файла")):
    """
    Проксирование аудио потока с поддержкой Range requests
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    client = httpx.AsyncClient(follow_redirects=True)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://rus.hitmotop.com/',
    }
    
    range_header = request.headers.get("range")
    if range_header:
        headers['Range'] = range_header
        
    async def close_client():
        await client.aclose()
        
    try:
        req = client.build_request("GET", url, headers=headers)
        r = await client.send(req, stream=True)
        
        response_headers = {
            "Accept-Ranges": "bytes",
        }
        
        if "content-length" in r.headers:
            response_headers["Content-Length"] = r.headers["content-length"]
        if "content-range" in r.headers:
            response_headers["Content-Range"] = r.headers["content-range"]
            
        return StreamingResponse(
            r.aiter_bytes(),
            status_code=r.status_code,
            headers=response_headers,
            media_type=r.headers.get("content-type"),
            background=BackgroundTask(close_client)
        )
    except Exception as e:
        await client.aclose()
        print(f"Error streaming audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("shutdown")
async def shutdown_event():
    """Закрытие ресурсов при остановке приложения"""
    parser.close()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

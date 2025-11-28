"""
FastAPI Backend for Telegram Music Mini App
"""

from fastapi import FastAPI, HTTPException, Query, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
from sqlalchemy.orm import Session
from datetime import datetime

try:
    from backend.hitmo_parser_light import HitmoParser
    from backend.database import User, get_db, init_db
    from backend.cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
except ImportError:
    from hitmo_parser_light import HitmoParser
    from database import User, get_db, init_db
    from cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache


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

class RadioStation(BaseModel):
    id: str
    name: str
    genre: str
    url: str
    image: str

class UserAuth(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class UserStats(BaseModel):
    total_users: int
    premium_users: int
    admin_users: int
    new_users_today: int

class GrantRequest(BaseModel):
    user_id: int
    is_admin: Optional[bool] = None
    is_premium: Optional[bool] = None

class CacheStats(BaseModel):
    total_entries: int
    cache_hits: int
    cache_misses: int
    hit_ratio: float
    ttl_seconds: int
    sample_keys: List[str]


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

@app.on_event("startup")
async def startup_event():
    """Инициализация БД при старте"""
    init_db()

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

# --- User & Admin Endpoints ---

@app.post("/api/user/auth")
async def auth_user(user_data: UserAuth, db: Session = Depends(get_db)):
    """Регистрация или обновление данных пользователя"""
    user = db.query(User).filter(User.id == user_data.id).first()
    if not user:
        user = User(
            id=user_data.id,
            username=user_data.username,
            first_name=user_data.first_name,
            last_name=user_data.last_name
        )
        db.add(user)
    else:
        # Обновляем данные если изменились
        user.username = user_data.username
        user.first_name = user_data.first_name
        user.last_name = user_data.last_name
    
    # Hardcode admin for owner
    if user.id == 414153884:
        user.is_admin = True
        user.is_premium = True
    
    db.commit()
    db.refresh(user)
    return {
        "status": "ok",
        "user": {
            "id": user.id,
            "is_admin": user.is_admin,
            "is_premium": user.is_premium
        }
    }

@app.get("/api/admin/stats", response_model=UserStats)
async def get_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Получение статистики (только для админов)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    total = db.query(User).count()
    premium = db.query(User).filter(User.is_premium == True).count()
    admins = db.query(User).filter(User.is_admin == True).count()
    
    today = datetime.utcnow().date()
    new_today = db.query(User).filter(User.joined_at >= today).count()
    
    return UserStats(
        total_users=total,
        premium_users=premium,
        admin_users=admins,
        new_users_today=new_today
    )

@app.post("/api/admin/grant")
async def grant_rights(
    request: GrantRequest, 
    admin_id: int = Query(..., description="ID администратора"),
    db: Session = Depends(get_db)
):
    """Выдача прав (только для админов)"""
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    target_user = db.query(User).filter(User.id == request.user_id).first()
    if not target_user:
        # Если пользователя нет, создаем заглушку (чтобы можно было выдать права заранее)
        target_user = User(id=request.user_id)
        db.add(target_user)
    
    if request.is_admin is not None:
        target_user.is_admin = request.is_admin
    
    if request.is_premium is not None:
        target_user.is_premium = request.is_premium
        
    db.commit()
    return {"status": "ok", "message": f"Rights updated for user {request.user_id}"}

# --- Cache Admin Endpoints ---

@app.get("/api/admin/cache/stats", response_model=CacheStats)
async def get_admin_cache_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Получение статистики кэша (только для админов)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return get_cache_stats()

@app.post("/api/admin/cache/reset")
async def reset_admin_cache(admin_id: int = Query(...), db: Session = Depends(get_db)):
    """Сброс кэша (только для админов)"""
    user = db.query(User).filter(User.id == admin_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    reset_cache()
    return {"status": "ok", "message": "Cache cleared"}


# --- Music Endpoints ---

@app.get("/api/search", response_model=SearchResponse)
async def search_tracks(
    q: str = Query(..., description="Поисковый запрос", min_length=1),
    limit: int = Query(20, description="Максимальное количество результатов", ge=1, le=50),
    page: int = Query(1, description="Номер страницы", ge=1),
    by_artist: bool = Query(False, description="Искать только по исполнителю")
):
    """
    Поиск треков по запросу (с кэшированием)
    """
    try:
        # 1. Проверяем кэш
        cache_key = make_cache_key("search", {
            "q": q, 
            "limit": limit, 
            "page": page, 
            "by_artist": by_artist
        })
        
        cached_data = get_from_cache(cache_key)
        if cached_data:
            # Возвращаем данные из кэша, но нужно преобразовать словари обратно в объекты Track
            # так как в кэше мы храним сериализованные данные (список словарей)
            track_models = [Track(**t) for t in cached_data["results"]]
            return SearchResponse(
                results=track_models,
                count=cached_data["count"]
            )

        # 2. Если нет в кэше, делаем запрос
        tracks = await parser.search(q, limit=limit, page=page)
        
        # Фильтрация по артисту если запрошено
        if by_artist:
            query_lower = q.lower()
            tracks = [
                track for track in tracks 
                if query_lower in track['artist'].lower()
            ]
        
        # Конвертируем в Pydantic модели и оборачиваем URL в прокси
        track_models = []
        base_url = "" 
        
        # Подготавливаем данные для кэша (чистые словари)
        cacheable_results = []
        
        for track in tracks:
            original_url = track['url']
            if original_url:
                from urllib.parse import quote
                encoded_url = quote(original_url)
                track['url'] = f"{base_url}/api/stream?url={encoded_url}"
            
            track_model = Track(**track)
            track_models.append(track_model)
            cacheable_results.append(track_model.dict())
        
        response_data = {
            "results": cacheable_results,
            "count": len(cacheable_results)
        }
        
        # 3. Сохраняем в кэш
        set_to_cache(cache_key, response_data)
        
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
    """
    raise HTTPException(
        status_code=501,
        detail="Получение трека по ID пока не реализовано. Используйте поиск."
    )


@app.get("/api/radio")
async def get_radio_stations():
    """
    Получение списка радиостанций (с кэшированием)
    """
    try:
        # 1. Проверяем кэш
        cache_key = make_cache_key("radio", {})
        cached_data = get_from_cache(cache_key)
        
        if cached_data:
            station_models = [RadioStation(**s) for s in cached_data["results"]]
            return {
                "results": station_models,
                "count": cached_data["count"]
            }

        # 2. Запрос
        stations = parser.get_radio_stations()
        
        # Конвертируем в Pydantic модели
        station_models = [RadioStation(**station) for station in stations]
        
        # 3. Сохраняем в кэш
        cacheable_data = {
            "results": [s.dict() for s in station_models],
            "count": len(station_models)
        }
        set_to_cache(cache_key, cacheable_data)
        
        return {
            "results": station_models,
            "count": len(station_models)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении радиостанций: {str(e)}"
        )


@app.get("/api/genre/{genre_id}")
async def get_genre_tracks(
    genre_id: int,
    limit: int = Query(20, description="Максимальное количество результатов", ge=1, le=50),
    page: int = Query(1, description="Номер страницы", ge=1)
):
    """
    Получение треков конкретного жанра (с кэшированием)
    """
    try:
        # 1. Проверяем кэш
        cache_key = make_cache_key("genre", {
            "genre_id": genre_id,
            "limit": limit,
            "page": page
        })
        
        cached_data = get_from_cache(cache_key)
        if cached_data:
            track_models = [Track(**t) for t in cached_data["results"]]
            return {
                "results": track_models,
                "count": cached_data["count"],
                "genre_id": genre_id
            }

        # 2. Запрос
        tracks = await parser.get_genre_tracks(genre_id, limit=limit, page=page)
        
        track_models = []
        base_url = ""
        cacheable_results = []
        
        for track in tracks:
            original_url = track['url']
            if original_url:
                from urllib.parse import quote
                encoded_url = quote(original_url)
                track['url'] = f"{base_url}/api/stream?url={encoded_url}"
            
            track_model = Track(**track)
            track_models.append(track_model)
            cacheable_results.append(track_model.dict())
        
        # 3. Сохраняем в кэш
        response_data = {
            "results": cacheable_results,
            "count": len(cacheable_results)
        }
        set_to_cache(cache_key, response_data)
        
        return {
            "results": track_models,
            "count": len(track_models),
            "genre_id": genre_id
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении треков жанра: {str(e)}"
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
    
    # Timeout configuration:
    # connect=10.0: wait max 10s to establish connection
    # read=None: wait indefinitely for data (important for streaming large files on slow connections)
    timeout = httpx.Timeout(10.0, read=None)
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://rus.hitmotop.com/',
        'Accept': '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://rus.hitmotop.com',
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

"""
FastAPI Backend for Telegram Music Mini App
"""

from fastapi import FastAPI, HTTPException, Query, Depends, Body, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
from sqlalchemy.orm import Session
from datetime import datetime

try:
    from backend.hitmo_parser_light import HitmoParser
    from backend.database import User, DownloadedMessage, Lyrics, get_db, init_db
    from backend.cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
    from backend.lyrics_service import LyricsService
except ImportError:
    from hitmo_parser_light import HitmoParser
    from database import User, DownloadedMessage, Lyrics, get_db, init_db
    from cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
    from lyrics_service import LyricsService

import os
from dotenv import load_dotenv

load_dotenv()


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
    is_premium_pro: Optional[bool] = None  # Эксклюзивный уровень
    is_blocked: Optional[bool] = None
    trial_days: Optional[int] = None  # Количество дней пробного периода
    premium_days: Optional[int] = None  # Количество дней премиум подписки

class CacheStats(BaseModel):
    total_entries: int
    cache_hits: int
    cache_misses: int
    hit_ratio: float
    ttl_seconds: int
    sample_keys: List[str]

class UserListItem(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_admin: bool
    is_premium: bool
    is_blocked: bool

class UserListResponse(BaseModel):
    users: List[UserListItem]


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

# Telegram Bot Token
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    print("WARNING: BOT_TOKEN not found in .env file")

# Genius API Token
GENIUS_API_TOKEN = os.getenv("GENIUS_API_TOKEN")
if not GENIUS_API_TOKEN:
    print("WARNING: GENIUS_API_TOKEN not found in .env file")

# Initialize Lyrics Service
lyrics_service = None
if GENIUS_API_TOKEN:
    try:
        lyrics_service = LyricsService(GENIUS_API_TOKEN)
        print("✅ Lyrics service initialized")
    except Exception as e:
        print(f"❌ Failed to initialize lyrics service: {e}")

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

# --- Access Control Helper ---

def has_access(user: User) -> tuple[bool, str, dict]:
    """
    Проверяет, имеет ли пользователь доступ к сервису.
    
    Returns:
        (has_access: bool, reason: str, details: dict)
    """
    if user.is_blocked:
        return False, "blocked", {}
    
    if user.is_admin:
        return True, "admin", {}
    
    if user.is_premium_pro:
        return True, "premium_pro", {}
    
    if user.is_premium:
        return True, "premium", {}
    
    # Проверка пробного периода
    if user.trial_expires_at:
        now = datetime.utcnow()
        if now < user.trial_expires_at:
            days_left = (user.trial_expires_at - now).days
            return True, "trial", {
                "trial_expires_at": user.trial_expires_at.isoformat(),
                "days_left": days_left
            }
    
    return False, "expired", {}

# --- User & Admin Endpoints ---

@app.post("/api/user/auth")
async def auth_user(user_data: UserAuth, db: Session = Depends(get_db)):
    """Регистрация или обновление данных пользователя"""
    from datetime import timedelta
    
    user = db.query(User).filter(User.id == user_data.id).first()
    is_new_user = False
    
    if not user:
        is_new_user = True
        # Новый пользователь - создаем с пробным периодом
        now = datetime.utcnow()
        trial_expires = now + timedelta(days=3)
        
        user = User(
            id=user_data.id,
            username=user_data.username,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            trial_started_at=now,
            trial_expires_at=trial_expires
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
    
    # Проверяем доступ
    has_access_result, reason, details = has_access(user)
    
    # Формируем ответ с информацией о подписке
    subscription_status = {
        "has_access": has_access_result,
        "reason": reason,
        **details
    }
    
    # Если пользователь заблокирован, возвращаем ошибку
    if user.is_blocked:
        raise HTTPException(
            status_code=403, 
            detail={
                "message": "Access denied: User is blocked",
                "subscription_status": subscription_status
            }
        )
    
    return {
        "status": "ok",
        "is_new_user": is_new_user,
        "user": {
            "id": user.id,
            "is_admin": user.is_admin,
            "is_premium": user.is_premium,
            "subscription_status": subscription_status
        }
    }

@app.get("/api/user/subscription-status")
async def get_subscription_status(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Получение детальной информации о статусе подписки"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    has_access_result, reason, details = has_access(user)
    
    return {
        "status": "ok",
        "subscription_status": {
            "has_access": has_access_result,
            "reason": reason,
            **details
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

@app.get("/api/admin/users", response_model=UserListResponse)
async def get_users(user_id: int = Query(...), filter_type: str = Query("all"), db: Session = Depends(get_db)):
    """
    Get list of users (only for admins)
    filter_type: 'all', 'premium', 'admin', 'blocked'
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = db.query(User)
    
    if filter_type == "premium":
        query = query.filter(User.is_premium == True)
    elif filter_type == "admin":
        query = query.filter(User.is_admin == True)
    elif filter_type == "blocked":
        query = query.filter(User.is_blocked == True)
    # filter_type == "all" - no additional filter
    
    # Sort by joined_at descending (newest first)
    users = query.order_by(User.joined_at.desc()).all()
    
    return UserListResponse(
        users=[UserListItem(
            id=u.id,
            username=u.username,
            first_name=u.first_name,
            last_name=u.last_name,
            is_admin=u.is_admin,
            is_premium=u.is_premium,
            is_blocked=u.is_blocked
        ) for u in users]
    )

@app.post("/api/admin/grant")
async def grant_rights(
    request: GrantRequest, 
    admin_id: int = Query(..., description="ID администратора"),
    db: Session = Depends(get_db)
):
    """Выдача прав (только для админов)"""
    from datetime import timedelta
    
    SUPER_ADMIN_ID = 414153884  # Super admin cannot be modified
    
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Protect super admin
    if request.user_id == SUPER_ADMIN_ID:
        raise HTTPException(status_code=403, detail="Cannot modify super admin")
    
    target_user = db.query(User).filter(User.id == request.user_id).first()
    if not target_user:
        # Если пользователя нет, создаем заглушку (чтобы можно было выдать права заранее)
        target_user = User(id=request.user_id)
        db.add(target_user)
    
    if request.is_admin is not None:
        target_user.is_admin = request.is_admin
    
    if request.is_blocked is not None:
        target_user.is_blocked = request.is_blocked
    
    # Check if premium is being revoked
    was_premium = target_user.is_premium or target_user.is_premium_pro
    
    if request.is_premium is not None:
        target_user.is_premium = request.is_premium
    
    if request.is_premium_pro is not None:
        target_user.is_premium_pro = request.is_premium_pro
    
    # Управление пробным периодом
    if request.trial_days is not None:
        if request.trial_days > 0:
            now = datetime.utcnow()
            target_user.trial_started_at = now
            target_user.trial_expires_at = now + timedelta(days=request.trial_days)
        else:
            # Отменить пробный период
            target_user.trial_started_at = None
            target_user.trial_expires_at = None
    
    # Управление премиум подпиской
    if request.premium_days is not None:
        if request.premium_days > 0:
            now = datetime.utcnow()
            target_user.premium_expires_at = now + timedelta(days=request.premium_days)
        else:
            # Отменить премиум подписку
            target_user.premium_expires_at = None
        
    db.commit()
    
    # If premium was revoked, delete all downloaded messages
    if was_premium and request.is_premium == False and BOT_TOKEN:
        try:
            messages = db.query(DownloadedMessage).filter(DownloadedMessage.user_id == request.user_id).all()
            
            if messages:
                telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/deleteMessage"
                deleted_count = 0
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    for msg in messages:
                        try:
                            response = await client.post(telegram_url, json={
                                'chat_id': msg.chat_id,
                                'message_id': msg.message_id
                            })
                            if response.status_code == 200:
                                deleted_count += 1
                        except Exception as e:
                            print(f"Failed to delete message {msg.message_id}: {e}")
                
                # Delete from database
                db.query(DownloadedMessage).filter(DownloadedMessage.user_id == request.user_id).delete()
                db.commit()
                
                print(f"Auto-deleted {deleted_count} messages for user {request.user_id}")
        except Exception as e:
            print(f"Error auto-deleting messages: {e}")
    
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
    by_artist: bool = Query(False, description="Искать только по исполнителю"),
    by_track: bool = Query(False, description="Искать только по названию трека")
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
            "by_artist": by_artist,
            "by_track": by_track
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
        
        # Если включена фильтрация, делаем глубокий поиск (скачиваем несколько страниц)
        if by_artist or by_track:
            print(f"DEBUG: Deep search enabled for query='{q}' (Artist={by_artist}, Track={by_track})")
            all_tracks = []
            # Скачиваем первые 3 страницы (Hitmo обычно отдает по 48 треков на страницу)
            # Это ~144 трека, что должно хватить для нахождения нужного артиста
            for p in range(1, 4):
                try:
                    print(f"DEBUG: Fetching page {p}...")
                    page_tracks = await parser.search(q, limit=48, page=p)
                    all_tracks.extend(page_tracks)
                    if len(page_tracks) < 20: # Если вернулось мало треков, значит страницы кончились
                        break
                except Exception as e:
                    print(f"DEBUG: Error fetching page {p}: {e}")
                    break
            
            print(f"DEBUG: Total tracks fetched: {len(all_tracks)}")
            tracks = all_tracks
        else:
            # Обычный поиск - одна страница
            tracks = await parser.search(q, limit=limit, page=page)
            print(f"DEBUG: Search query='{q}', limit={limit}, page={page}. Found {len(tracks)} tracks before filtering.")
        
        # Фильтрация по артисту или треку если запрошено
        query_lower = q.lower()
        
        if by_artist:
            print(f"DEBUG: Filtering by artist. Query='{query_lower}'")
            tracks = [
                track for track in tracks 
                if query_lower in track['artist'].lower()
            ]
            print(f"DEBUG: Found {len(tracks)} tracks after artist filtering.")
        elif by_track:
            print(f"DEBUG: Filtering by track. Query='{query_lower}'")
            tracks = [
                track for track in tracks 
                if query_lower in track['title'].lower()
            ]
            print(f"DEBUG: Found {len(tracks)} tracks after track filtering.")

        # Пагинация для отфильтрованных результатов (если был глубокий поиск)
        if by_artist or by_track:
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            tracks = tracks[start_idx:end_idx]
            print(f"DEBUG: Returning slice [{start_idx}:{end_idx}] (Count: {len(tracks)})")
        
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
        'Accept': '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    if "hitmotop.com" in url:
        headers['Referer'] = 'https://rus.hitmotop.com/'
        headers['Origin'] = 'https://rus.hitmotop.com'
    
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

# --- Download to Chat Endpoints ---

class DownloadToChatRequest(BaseModel):
    user_id: int
    track: Track

@app.post("/api/download/chat")
async def download_to_chat(request: DownloadToChatRequest, db: Session = Depends(get_db)):
    """
    Download track to user's Telegram chat via bot
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token not configured")
    
    try:
        # Проверить статус подписки пользователя
        user = db.query(User).filter(User.id == request.user_id).first()
        
        # Premium Pro может пересылать треки, обычные пользователи - нет
        protect_content = True
        if user and user.is_premium_pro:
            protect_content = False
        
        # 1. Download audio file from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            audio_response = await client.get(request.track.url)
            audio_response.raise_for_status()
            audio_data = audio_response.content
        
        # 2. Send to Telegram
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendAudio"
        
        files = {
            'audio': ('track.mp3', audio_data, 'audio/mpeg')
        }
        
        data = {
            'chat_id': request.user_id,
            'title': request.track.title,
            'performer': request.track.artist,
            'duration': request.track.duration,
            'protect_content': protect_content  # Premium Pro может пересылать
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(telegram_url, files=files, data=data)
            response.raise_for_status()
            result = response.json()
        
        if not result.get('ok'):
            raise HTTPException(status_code=500, detail=f"Telegram API error: {result}")
        
        message_id = result['result']['message_id']
        
        # 3. Save to database
        downloaded_msg = DownloadedMessage(
            user_id=request.user_id,
            chat_id=request.user_id,
            message_id=message_id,
            track_id=request.track.id
        )
        db.add(downloaded_msg)
        db.commit()
        
        return {
            "status": "ok",
            "message": "Track sent to chat",
            "message_id": message_id
        }
        
    except Exception as e:
        print(f"Error downloading to chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/debug/expire_downloads")
async def expire_downloads(user_id: int = Query(...), db: Session = Depends(get_db)):
    """
    Debug endpoint: Delete all downloaded messages for a user (simulate subscription expiry)
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token not configured")
    
    try:
        # 1. Get all messages for user
        messages = db.query(DownloadedMessage).filter(DownloadedMessage.user_id == user_id).all()
        
        if not messages:
            return {"status": "ok", "message": "No messages to delete", "deleted_count": 0}
        
        # 2. Delete from Telegram
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/deleteMessage"
        deleted_count = 0
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for msg in messages:
                try:
                    response = await client.post(telegram_url, json={
                        'chat_id': msg.chat_id,
                        'message_id': msg.message_id
                    })
                    if response.status_code == 200:
                        deleted_count += 1
                except Exception as e:
                    print(f"Failed to delete message {msg.message_id}: {e}")
        
        # 3. Delete from database
        db.query(DownloadedMessage).filter(DownloadedMessage.user_id == user_id).delete()
        db.commit()
        
        return {
            "status": "ok",
            "message": f"Deleted {deleted_count} messages",
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        print(f"Error expiring downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- YouTube Endpoints ---

class YouTubeRequest(BaseModel):
    url: str

@app.post("/api/youtube/info", response_model=Track)
async def get_youtube_info(request: YouTubeRequest):
    """
    Get track info from YouTube URL using yt-dlp
    """
    try:
        import yt_dlp
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(request.url, download=False)
            
            # Extract relevant info
            video_id = info.get('id')
            title = info.get('title', 'Unknown Title')
            uploader = info.get('uploader', 'Unknown Artist')
            duration = info.get('duration', 0)
            thumbnail = info.get('thumbnail', '')
            url = info.get('url') # Direct audio URL
            
            # Clean up title
            clean_title = title.replace('(Official Video)', '').replace('[Official Video]', '').strip()
            
            # Try to parse Artist - Title
            if '-' in clean_title:
                parts = clean_title.split('-', 1)
                artist = parts[0].strip()
                track_title = parts[1].strip()
            else:
                artist = uploader
                track_title = clean_title
                
            return Track(
                id=f"yt_{video_id}",
                title=track_title,
                artist=artist,
                duration=duration,
                url=url, 
                image=thumbnail
            )
            
    except Exception as e:
        print(f"Error extracting YouTube info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process YouTube link: {str(e)}")

@app.get("/api/youtube/download_file")
async def get_youtube_file(url: str, background_tasks: BackgroundTasks):
    """
    Download YouTube audio to server temp file and stream it to client
    """
    import yt_dlp
    import os
    import tempfile
    
    try:
        print(f"📥 Starting download for: {url}")
        
        # Create temp directory
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, 'audio')
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': temp_path,
            'quiet': False,
            'no_warnings': False,
            'ffmpeg_location': r'C:\ffmpeg-2025-11-27-git-61b034a47c-essentials_build\bin',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            print(f"✅ Download complete. Info: {info.get('ext', 'unknown')}")
            
        # Find the downloaded file (extension may vary)
        downloaded_file = None
        
        # First check if file exists without extension (yt-dlp sometimes does this)
        if os.path.exists(temp_path):
            downloaded_file = temp_path
            print(f"📁 Found file without extension: {downloaded_file}")
        else:
            # Try with common extensions
            for ext in ['.webm', '.m4a', '.opus', '.mp3', '.mp4']:
                test_path = temp_path + ext
                if os.path.exists(test_path):
                    downloaded_file = test_path
                    print(f"📁 Found file with extension: {downloaded_file}")
                    break
        
        if not downloaded_file:
            # List what's actually in the temp directory for debugging
            files_in_dir = os.listdir(temp_dir) if os.path.exists(temp_dir) else []
            print(f"🔍 Files in temp dir: {files_in_dir}")
            raise Exception(f"Downloaded file not found. Checked: {temp_path}, Dir contents: {files_in_dir}")
        
        # Determine media type based on actual file or info
        if os.path.splitext(downloaded_file)[1]:
            ext = os.path.splitext(downloaded_file)[1].lower()
        else:
            # No extension, use info from yt-dlp
            ext = '.' + info.get('ext', 'webm')
            
        media_types = {
            '.webm': 'audio/webm',
            '.m4a': 'audio/mp4',
            '.opus': 'audio/opus',
            '.mp3': 'audio/mpeg',
            '.mp4': 'audio/mp4'
        }
        media_type = media_types.get(ext, 'audio/webm')
        
        def cleanup():
            try:
                import shutil
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
                    print(f"🗑️ Cleaned up: {temp_dir}")
            except Exception as e:
                print(f"Error cleaning up temp dir: {e}")

        background_tasks.add_task(cleanup)
        
        print(f"📤 Sending file: {downloaded_file} as {media_type}")
        return FileResponse(
            downloaded_file, 
            media_type=media_type, 
            filename=f'track{ext}'
        )

    except Exception as e:
        print(f"❌ Error downloading file: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

# --- Lyrics Endpoints ---

class LyricsResponse(BaseModel):
    track_id: str
    title: str
    artist: str
    lyrics_text: str
    source: str

@app.get("/api/lyrics/{track_id}", response_model=LyricsResponse)
async def get_lyrics(
    track_id: str,
    title: str = Query(..., description="Song title"),
    artist: str = Query(..., description="Artist name"),
    db: Session = Depends(get_db)
):
    """
    Get lyrics for a track
    First checks cache (database), then fetches from Genius API if not found
    """
    try:
        # 1. Check cache (database)
        cached_lyrics = db.query(Lyrics).filter(Lyrics.track_id == track_id).first()
        
        if cached_lyrics:
            print(f"Lyrics found in cache for: {artist} - {title}")
            return LyricsResponse(
                track_id=cached_lyrics.track_id,
                title=cached_lyrics.title,
                artist=cached_lyrics.artist,
                lyrics_text=cached_lyrics.lyrics_text,
                source=cached_lyrics.source
            )
        
        # 2. Fetch from Genius API
        if not lyrics_service:
            raise HTTPException(
                status_code=503,
                detail="Lyrics service not available. GENIUS_API_TOKEN not configured."
            )
        
        lyrics_text = lyrics_service.get_lyrics(title, artist)
        
        if not lyrics_text:
            raise HTTPException(
                status_code=404,
                detail=f"Lyrics not found for: {artist} - {title}"
            )
        
        # 3. Save to cache
        new_lyrics = Lyrics(
            track_id=track_id,
            title=title,
            artist=artist,
            lyrics_text=lyrics_text,
            source="genius"
        )
        db.add(new_lyrics)
        db.commit()
        db.refresh(new_lyrics)
        
        print(f"Lyrics cached for: {artist} - {title}")
        
        return LyricsResponse(
            track_id=new_lyrics.track_id,
            title=new_lyrics.title,
            artist=new_lyrics.artist,
            lyrics_text=new_lyrics.lyrics_text,
            source=new_lyrics.source
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting lyrics: {e}")
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

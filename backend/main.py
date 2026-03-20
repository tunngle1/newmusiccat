"""
FastAPI Backend for Telegram Music Mini App
"""

from dotenv import load_dotenv
load_dotenv()  # Загружаем переменные из .env файла

from fastapi import FastAPI, HTTPException, Query, Depends, Body, BackgroundTasks, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
import random
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from starlette.background import BackgroundTask
import json

try:
    from backend.hitmo_parser_light import HitmoParser
    from backend.database import User, DownloadedMessage, Lyrics, Payment, Referral, PromoCode, get_db, init_db, SessionLocal
    from backend.cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
    from backend.lyrics_service import LyricsService
    from backend.payments import (
        grant_premium_after_payment,
        get_stars_product,
        build_stars_payload,
        parse_stars_payload,
        create_pending_stars_payment,
        mark_stars_payment_completed,
        activate_premium_for_payment,
        STARS_PRODUCTS,
    )
    from backend.recommendations.models import UserTrackEvent
    from backend.recommendations.routes import router as recommendations_router, set_parser as set_rec_parser
except ImportError:
    from hitmo_parser_light import HitmoParser
    from database import User, DownloadedMessage, Lyrics, Payment, Referral, PromoCode, get_db, init_db, SessionLocal
    from cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
    from lyrics_service import LyricsService
    from payments import (
        grant_premium_after_payment,
        get_stars_product,
        build_stars_payload,
        parse_stars_payload,
        create_pending_stars_payment,
        mark_stars_payment_completed,
        activate_premium_for_payment,
        STARS_PRODUCTS,
    )
    from recommendations.models import UserTrackEvent
    from recommendations.routes import router as recommendations_router, set_parser as set_rec_parser

import os
from dotenv import load_dotenv
import httpx

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
    auth_date: Optional[int] = 0
    hash: Optional[str] = ""
    referrer_id: Optional[int] = None  # ID пригласившего пользователя

class UserStats(BaseModel):
    total_users: int
    premium_users: int
    admin_users: int
    new_users_today: int
    total_revenue_ton: float
    total_revenue_stars: int
    total_revenue_rub: float

class Transaction(BaseModel):
    id: int
    user_id: int
    amount: str
    currency: str
    plan: str
    status: str
    created_at: datetime

class TrackInput(BaseModel):
    id: str
    title: str
    artist: str
    duration: int
    audioUrl: str
    coverUrl: str

class DownloadToChatRequest(BaseModel):
    user_id: int
    track: TrackInput

class TransactionListResponse(BaseModel):
    transactions: List[Transaction]
    total: int

class PromoCodeCreate(BaseModel):
    code: str
    discount_type: str # 'percent', 'fixed', 'trial'
    value: int
    max_uses: int = 0
    expires_at: Optional[datetime] = None

class PromoCodeResponse(BaseModel):
    id: int
    code: str
    discount_type: str
    value: int
    used_count: int
    max_uses: int
    expires_at: Optional[datetime]

class PromoCodeCheck(BaseModel):
    code: str

class PromoCodeCheckResponse(BaseModel):
    valid: bool
    message: str
    discount_type: Optional[str] = None
    value: Optional[int] = None

class BroadcastRequest(BaseModel):
    message: str

class ActivityStat(BaseModel):
    date: str
    count: int

class TopUser(BaseModel):
    id: int
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    download_count: int
    is_premium: bool

class CreateInvoiceRequest(BaseModel):
    user_id: int
    plan: str  # 'month' or 'year'

class TonVerificationRequest(BaseModel):
    user_id: int
    plan: str
    boc: str # Bag of Cells (транзакция)

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


class StarsProductResponse(BaseModel):
    id: str
    title: str
    description: str
    amount: int
    currency: str
    duration_days: int


def apply_promo_to_amount(base_amount: int, promo: Optional[PromoCode]) -> int:
    final_amount = base_amount
    if promo:
        if promo.discount_type == 'percent':
            final_amount = int(base_amount * (1 - promo.value / 100))
        elif promo.discount_type == 'fixed':
            final_amount = max(0, int(base_amount - promo.value))
    return max(1, final_amount)


def complete_stars_payment_record(db: Session, payment: Payment, raw_payment_data: Dict[str, Any]):
    if payment.status == "completed":
        return payment

    activated = activate_premium_for_payment(db, payment, "telegram_stars")
    if not activated:
        raise HTTPException(status_code=500, detail="Failed to activate premium after payment")

    telegram_charge_id = raw_payment_data.get("telegram_payment_charge_id")
    provider_charge_id = raw_payment_data.get("provider_payment_charge_id")
    if payment.raw_data:
        try:
            raw_meta = json.loads(payment.raw_data)
            promo_code = raw_meta.get("promo_code")
            if promo_code:
                promo = db.query(PromoCode).filter(PromoCode.code == promo_code).first()
                if promo:
                    promo.used_count += 1
                    db.commit()
        except Exception as promo_error:
            print(f"Failed to update promo usage for payment {payment.id}: {promo_error}")

    return mark_stars_payment_completed(
        db,
        payment,
        telegram_charge_id,
        provider_charge_id,
        raw_payment_data,
    )

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Глобальный экземпляр парсера
parser = HitmoParser()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    set_rec_parser(parser)
    yield
    parser.close()

# Инициализация FastAPI
app = FastAPI(
    title="Telegram Music API",
    description="API для поиска и получения музыки через Hitmo парсер",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(recommendations_router)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"❌ Validation error: {exc}")
    try:
        body = await request.json()
        print(f"❌ Request body: {body}")
    except:
        pass
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

allowed_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
    "https://localhost:5174",
    "https://127.0.0.1:5174"
}
webapp_url = os.getenv("WEBAPP_URL", "").strip()
if webapp_url:
    allowed_origins.add(webapp_url.rstrip("/"))
extra_cors_origins = os.getenv("CORS_ORIGINS", "").strip()
if extra_cors_origins:
    allowed_origins.update(origin.strip().rstrip("/") for origin in extra_cors_origins.split(",") if origin.strip())

# CORS настройки для Telegram WebApp
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=r"https://.*\.(vercel\.app|trycloudflare\.com|ngrok-free\.app|ngrok-free\.dev|ngrok\.io)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Telegram Bot Token
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    print("WARNING: BOT_TOKEN not found in .env file")

# Initialize Lyrics Service (no API tokens required)
lyrics_service = None
try:
    lyrics_service = LyricsService()
    print("✅ Lyrics service initialized (lyrics.ovh + DuckDuckGo)")
except Exception as e:
    print(f"❌ Failed to initialize lyrics service: {e}")

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
    
    return True, "active", {}

def can_download_to_app(user: User) -> bool:
    """
    Проверяет, может ли пользователь скачивать треки в приложение.
    Доступно для Premium и выше.
    """
    return not user.is_blocked

def can_download_to_chat(user: User) -> bool:
    """
    Проверяет, может ли пользователь скачивать треки в чат.
    Доступно для всех пользователей.
    """
    return True  # Все могут скачивать в чат

def can_forward_from_chat(user: User) -> bool:
    """
    Проверяет, может ли пользователь пересылать сообщения из чата.
    Доступно только для Premium Pro и админов.
    """
    return not user.is_blocked

async def notify_referrer_about_signup(referrer: User, referred_user: User):
    if not BOT_TOKEN:
        print(f"ℹ️ Referral signup notification skipped: BOT_TOKEN is not set for referrer={referrer.id}, referred={referred_user.id}")
        return

    try:
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        username = referred_user.username or referred_user.first_name or "пользователь"
        message_text = f"👥 Новый реферал!\n\n✅ @{username} присоединился по вашей ссылке\n🎁 Если он впервые купит подписку, вы получите Premium на такой же срок."

        async with httpx.AsyncClient() as client:
            response = await client.post(telegram_url, json={
                'chat_id': referrer.id,
                'text': message_text
            })
            if response.status_code >= 400:
                print(f"❌ Failed to send referral notification: status={response.status_code}, body={response.text}, referrer={referrer.id}, referred={referred_user.id}")
            else:
                print(f"✅ Referral signup notification sent to referrer={referrer.id} for referred={referred_user.id}")
    except Exception as e:
        print(f"❌ Failed to send referral notification: {e}")

async def register_referral_relationship(db: Session, user: User, referrer: User) -> bool:
    if referrer.id == user.id:
        print(f"ℹ️ Referral skipped: self-referral attempt user={user.id}")
        return False

    existing_referral = db.query(Referral).filter(
        Referral.referred_id == user.id
    ).first()

    if existing_referral:
        if not user.referred_by:
            user.referred_by = referrer.id
            db.commit()
        print(f"ℹ️ Referral already exists for referred={user.id}, existing_referrer={existing_referral.referrer_id}")
        return False

    user.referred_by = referrer.id
    referral = Referral(
        referrer_id=referrer.id,
        referred_id=user.id,
        status='pending',
        reward_given=False
    )
    db.add(referral)
    db.commit()
    print(f"✅ Referral relationship stored: referrer={referrer.id}, referred={user.id}")

    await notify_referrer_about_signup(referrer, user)
    return True

# --- User & Admin Endpoints ---

@app.post("/api/user/auth")
async def auth_user(user_data: UserAuth, db: Session = Depends(get_db)):
    """Регистрация или обновление данных пользователя"""
    from datetime import timedelta
    print(f"ℹ️ auth_user called for user_id={user_data.id}, referrer_id={user_data.referrer_id}")
    
    user = db.query(User).filter(User.id == user_data.id).first()
    is_new_user = False
    
    if not user:
        is_new_user = True
        # Новый пользователь - создаем с пробным периодом
        now = datetime.utcnow()
        trial_expires = now + timedelta(days=7)
        
        user = User(
            id=user_data.id,
            username=user_data.username,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            trial_started_at=now,
            trial_expires_at=trial_expires
        )
        db.add(user)
        db.commit()
        print(f"✅ New user created user_id={user.id}")
        
        # РЕФЕРАЛЬНАЯ СИСТЕМА: Обработка реферальной ссылки
        if hasattr(user_data, 'referrer_id') and user_data.referrer_id:
            try:
                referrer = db.query(User).filter(User.id == user_data.referrer_id).first()
                if referrer:
                    created = await register_referral_relationship(db, user, referrer)
                    if created:
                        print(f"✅ Referral created: {referrer.id} invited {user.id}")
                else:
                    print(f"ℹ️ Referrer not found for referrer_id={user_data.referrer_id}, user_id={user.id}")
            except Exception as e:
                print(f"❌ Error processing referral: {e}")
    
    # Обновляем данные если изменились
    if user.username != user_data.username or \
       user.first_name != user_data.first_name or \
       user.last_name != user_data.last_name:
        user.username = user_data.username
        user.first_name = user_data.first_name
        user.last_name = user_data.last_name
        db.commit()
    
    # Проверяем доступ
    has_access_result, reason, details = has_access(user)
    
    subscription_status = {
        "has_access": has_access_result,
        "reason": reason,
        **details
    }
        
    return {
        "status": "ok",
        "is_new_user": is_new_user,
        "user": {
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "is_admin": user.is_admin,
            "is_premium": user.is_premium,
            "is_premium_pro": user.is_premium_pro,
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
    from database import Payment
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    total = db.query(User).count()
    premium = db.query(User).filter(User.is_premium == True).count()
    admins = db.query(User).filter(User.is_admin == True).count()
    
    today = datetime.utcnow().date()
    new_today = db.query(User).filter(User.joined_at >= today).count()
    
    # Считаем выручку
    payments = db.query(Payment).filter(Payment.status == 'completed').all()
    ton_revenue = sum(float(p.amount) for p in payments if p.currency == 'TON')
    stars_revenue = sum(float(p.amount) for p in payments if p.currency == 'XTR')
    rub_revenue = sum(float(p.amount) for p in payments if p.currency == 'RUB')
    
    return UserStats(
        total_users=total,
        premium_users=premium,
        admin_users=admins,
        new_users_today=new_today,
        total_revenue_ton=ton_revenue,
        total_revenue_stars=stars_revenue,
        total_revenue_rub=rub_revenue
    )

@app.get("/api/admin/transactions", response_model=TransactionListResponse)
async def get_transactions(
    user_id: int = Query(...), 
    limit: int = 20, 
    offset: int = 0, 
    db: Session = Depends(get_db)
):
    """Получение истории транзакций"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    total = db.query(Payment).count()
    payments = db.query(Payment).order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    
    return TransactionListResponse(
        transactions=[Transaction(
            id=p.id,
            user_id=p.user_id,
            amount=p.amount,
            currency=p.currency,
            plan=p.plan,
            status=p.status,
            created_at=p.created_at
        ) for p in payments],
        total=total
    )

# --- Admin Phase 2 Endpoints ---

@app.post("/api/admin/broadcast")
async def broadcast_message(
    request: BroadcastRequest,
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Рассылка сообщения всем пользователям"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN not configured")
        
    users = db.query(User).filter(User.is_blocked == False).all()
    count = 0
    
    telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    
    # В реальном проекте это нужно делать через очередь задач (Celery/Redis)
    # Здесь делаем просто в цикле с задержкой, чтобы не заблокировать event loop надолго
    # используем asyncio.create_task для фона
    
    async def send_broadcast():
        sent = 0
        async with httpx.AsyncClient() as client:
            for u in users:
                try:
                    await client.post(telegram_url, json={
                        'chat_id': u.id,
                        'text': request.message,
                        'parse_mode': 'HTML'
                    })
                    sent += 1
                    # Rate limit protection
                    await asyncio.sleep(0.05) 
                except Exception as e:
                    print(f"Failed to send to {u.id}: {e}")
        print(f"📢 Broadcast completed. Sent to {sent} users.")

    asyncio.create_task(send_broadcast())
    
    return {"status": "ok", "message": f"Рассылка запущена для {len(users)} пользователей"}

@app.get("/api/admin/top-users", response_model=List[TopUser])
async def get_top_users(
    user_id: int = Query(...),
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Топ пользователей по скачиваниям"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    users = db.query(User).order_by(User.download_count.desc()).limit(limit).all()
    
    return [TopUser(
        id=u.id,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
        download_count=u.download_count,
        is_premium=u.is_premium
    ) for u in users]

@app.get("/api/admin/activity-stats", response_model=List[ActivityStat])
async def get_activity_stats(
    user_id: int = Query(...),
    days: int = 7,
    db: Session = Depends(get_db)
):
    """Статистика новых пользователей по дням"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    days = max(1, min(days, 30))
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)

    stats = db.query(
        func.date(User.joined_at).label('date'),
        func.count(User.id).label('count')
    ).filter(
        User.joined_at >= datetime.combine(start_date, datetime.min.time())
    ).group_by('date').order_by('date').all()

    counts_by_date = {str(s.date): s.count for s in stats}

    return [
        ActivityStat(
            date=current_date.isoformat(),
            count=counts_by_date.get(current_date.isoformat(), 0)
        )
        for current_date in [start_date + timedelta(days=offset) for offset in range(days)]
    ]

@app.get("/api/search", response_model=SearchResponse)
async def search_tracks(
    request: Request,
    q: str = Query(..., description="Поисковый запрос"),
    limit: int = Query(20, description="Максимальное количество результатов", ge=1, le=50),
    page: int = Query(1, description="Номер страницы", ge=1),
    by_artist: bool = Query(False, description="Фильтровать только по артисту"),
    by_track: bool = Query(False, description="Фильтровать только по названию трека")
):
    try:
        cache_key = make_cache_key("search", {
            "q": q,
            "limit": limit,
            "page": page,
            "by_artist": by_artist,
            "by_track": by_track
        })

        cached_data = get_from_cache(cache_key)
        if cached_data:
            track_models = [Track(**t) for t in cached_data["results"]]
            return SearchResponse(
                results=track_models,
                count=cached_data["count"]
            )

        user_agent = request.headers.get('user-agent')
        if by_artist or by_track:
            all_tracks = []
            for p in range(1, 4):
                try:
                    page_tracks = await parser.search(q, limit=48, page=p, user_agent=user_agent)
                    all_tracks.extend(page_tracks)
                    if len(page_tracks) < 20:
                        break
                except Exception:
                    break
            tracks = all_tracks
        else:
            tracks = await parser.search(q, limit=limit, page=page, user_agent=user_agent)

        query_lower = q.lower()
        if by_artist:
            tracks = [track for track in tracks if query_lower in track['artist'].lower()]
        elif by_track:
            tracks = [track for track in tracks if query_lower in track['title'].lower()]

        if by_artist or by_track:
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            tracks = tracks[start_idx:end_idx]

        track_models = []
        cacheable_results = []

        for track in tracks:
            original_url = track['url']
            if original_url:
                from urllib.parse import quote
                encoded_url = quote(original_url)
                track['url'] = f"/api/stream?url={encoded_url}"
            track_model = Track(**track)
            track_models.append(track_model)
            cacheable_results.append(track_model.dict())

        response_data = {
            "results": cacheable_results,
            "count": len(cacheable_results)
        }
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
    raise HTTPException(
        status_code=501,
        detail="Получение трека по ID пока не реализовано. Используйте поиск."
    )

@app.get("/api/radio")
async def get_radio_stations():
    try:
        cache_key = make_cache_key("radio", {})
        cached_data = get_from_cache(cache_key)
        if cached_data:
            station_models = [RadioStation(**s) for s in cached_data["results"]]
            return {
                "results": station_models,
                "count": cached_data["count"]
            }

        stations = parser.get_radio_stations()
        station_models = [RadioStation(**station) for station in stations]

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
    request: Request,
    genre_id: int,
    limit: int = Query(20, description="Максимальное количество результатов", ge=1, le=50),
    page: int = Query(1, description="Номер страницы", ge=1)
):
    try:
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

        user_agent = request.headers.get('user-agent')
        tracks = await parser.get_genre_tracks(genre_id, limit=limit, page=page, user_agent=user_agent)
        track_models = []
        cacheable_results = []

        for track in tracks:
            original_url = track['url']
            if original_url:
                from urllib.parse import quote
                encoded_url = quote(original_url)
                track['url'] = f"/api/stream?url={encoded_url}"
            track_model = Track(**track)
            track_models.append(track_model)
            cacheable_results.append(track_model.dict())

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

@app.get("/api/stream")
async def stream_audio_proxy(request: Request, url: str = Query(..., description="URL аудио файла")):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    proxy_list_str = os.getenv("PROXY_URLS", "") or os.getenv("PROXY_LIST", "")
    proxy_list = [p.strip() for p in proxy_list_str.split(",") if p.strip()]

    proxies = None
    if proxy_list:
        proxy = random.choice(proxy_list)
        proxies = {"http://": proxy, "https://": proxy}
        print(f"Using proxy for stream: {proxy}")

    timeout = httpx.Timeout(30.0, read=120.0)
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout, proxies=proxies, verify=False)

    user_agent = request.headers.get('user-agent')
    if not user_agent:
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

    headers = {
        'User-Agent': user_agent,
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
        response = await client.send(req, stream=True)

        if response.status_code >= 400:
            await client.aclose()
            if response.status_code == 404 and "hitmotop.com" in url:
                raise HTTPException(status_code=404, detail="Hitmo source URL expired")
            if response.status_code in [403, 429]:
                raise HTTPException(status_code=503, detail="Source blocked request")
            raise HTTPException(status_code=response.status_code, detail="Upstream error")

        response_headers = {
            "Accept-Ranges": "bytes",
        }

        if "content-length" in response.headers:
            response_headers["Content-Length"] = response.headers["content-length"]
        if "content-range" in response.headers:
            response_headers["Content-Range"] = response.headers["content-range"]
        if "content-type" in response.headers:
            response_headers["Content-Type"] = response.headers["content-type"]

        download_param = request.query_params.get("download")
        if download_param and download_param.lower() == "true":
            filename = url.split("/")[-1] or "track.mp3"
            if "?" in filename:
                filename = filename.split("?")[0]
            response_headers["Content-Disposition"] = f'attachment; filename="{filename}"'

        return StreamingResponse(
            response.aiter_bytes(),
            status_code=response.status_code,
            headers=response_headers,
            media_type=response.headers.get("content-type"),
            background=BackgroundTask(close_client)
        )
    except HTTPException:
        raise
    except Exception as e:
        await client.aclose()
        print(f"Error streaming audio: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Stream error: {str(e)}")

@app.get("/api/admin/users", response_model=UserListResponse)
async def get_users(user_id: int = Query(...), filter_type: str = Query("all"), db: Session = Depends(get_db)):
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

@app.post("/api/download/chat")
async def download_to_chat(request: DownloadToChatRequest, db: Session = Depends(get_db)):
    """
    Download track to users Telegram chat via bot
    """
    print(f"[DOWNLOAD_TO_CHAT] Received request for user {request.user_id}, track: {request.track.title}")
    
    if not BOT_TOKEN:
        print("[DOWNLOAD_TO_CHAT] ERROR: Bot token not configured")
        raise HTTPException(status_code=500, detail="Bot token not configured")
    
    try:
        # Проверить статус подписки пользователя
        user = db.query(User).filter(User.id == request.user_id).first()

        print(f"[DOWNLOAD_TO_CHAT] User found: {user is not None}, protect_content: False")
        
        # Обработка URL: если относительный, преобразуем в абсолютный
        audio_url = request.track.audioUrl
        if audio_url:
            audio_url = audio_url.strip().replace('\n', '').replace('\r', '')
            
        if audio_url.startswith('/api/'):
            # Относительный URL - используем локальный прокси
            audio_url = f"http://localhost:8000{audio_url}"
            print(f"[DOWNLOAD_TO_CHAT] Converted relative URL to: {audio_url[:100]}...")
        
        print(f"[DOWNLOAD_TO_CHAT] Downloading audio from: {audio_url[:100]}...")
        
        # Подготовка заголовков для скачивания
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        }
        
        # Для Hitmo добавляем специальные заголовки
        if "hitmotop.com" in audio_url:
            headers['Referer'] = 'https://rus.hitmotop.com/'
            headers['Origin'] = 'https://rus.hitmotop.com'
            print(f"[DOWNLOAD_TO_CHAT] Added Hitmo headers")
        
        # 1. Download audio file from URL (увеличен timeout для больших файлов)
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, verify=False) as client:
            audio_response = await client.get(audio_url, headers=headers)
            audio_response.raise_for_status()
            audio_data = audio_response.content
        
        print(f"[DOWNLOAD_TO_CHAT] Audio downloaded: {len(audio_data)} bytes")
        
        # 2. Send to Telegram
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendAudio"
        
        files = {
            'audio': ('track.mp3', audio_data, 'audio/mpeg')
        }
        
        # Скачиваем обложку, если есть
        thumbnail_data = None
        if request.track.coverUrl:
            try:
                # Обработка относительных URL для обложки
                cover_url = request.track.coverUrl
                if cover_url.startswith('/api/'):
                    cover_url = f"http://localhost:8000{cover_url}"
                
                # Подготовка заголовков для обложки
                cover_headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                }
                
                # Для Hitmo добавляем специальные заголовки
                if "hitmotop.com" in cover_url:
                    cover_headers['Referer'] = 'https://rus.hitmotop.com/'
                    cover_headers['Origin'] = 'https://rus.hitmotop.com'
                
                print(f"[DOWNLOAD_TO_CHAT] Downloading thumbnail from: {cover_url[:100]}...")
                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, verify=False) as thumb_client:
                    thumb_response = await thumb_client.get(cover_url, headers=cover_headers)
                    if thumb_response.status_code == 200:
                        thumbnail_data = thumb_response.content
                        files['thumbnail'] = ('thumb.jpg', thumbnail_data, 'image/jpeg')
                        print(f"[DOWNLOAD_TO_CHAT] Thumbnail downloaded: {len(thumbnail_data)} bytes")
            except Exception as e:
                print(f"[DOWNLOAD_TO_CHAT] Failed to download thumbnail: {e}")
        
        data = {
            'chat_id': request.user_id,
            'title': request.track.title,
            'performer': request.track.artist,
            'duration': request.track.duration if request.track.duration > 0 else None,
            'caption': 'Отправлено из приложения Zvukly',
            'protect_content': False
        }
        
        print(f"[DOWNLOAD_TO_CHAT] Sending to Telegram API...")
        
        # 2. Send to Telegram (увеличен timeout для загрузки больших файлов)
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(telegram_url, files=files, data=data)
            response.raise_for_status()
            result = response.json()
        
        message_id = result['result']['message_id']
        print(f"[DOWNLOAD_TO_CHAT] Successfully sent to Telegram, message_id: {message_id}")
        
        # 3. Save to database
        downloaded_msg = DownloadedMessage(
            user_id=request.user_id,
            chat_id=request.user_id,
            message_id=message_id,
            track_id=request.track.id
        )
        db.add(downloaded_msg)
        
        # 4. Increment download count
        if user:
            user.download_count = (user.download_count or 0) + 1
        
        db.commit()
        
        return {
            "status": "ok",
            "message": "Track sent to chat",
            "message_id": message_id
        }
        
    except Exception as e:
        print(f"Error downloading to chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/youtube/download-to-chat")
async def youtube_download_to_chat(request: dict, db: Session = Depends(get_db)):
    """
    Download YouTube audio and send to user's Telegram chat
    """
    import yt_dlp
    import os
    import tempfile
    
    try:
        user_id = request.get('user_id')
        youtube_url = request.get('url')
        track_title = request.get('title', 'YouTube Track')
        track_artist = request.get('artist', 'Unknown Artist')
        
        if not user_id or not youtube_url:
            raise HTTPException(status_code=400, detail="user_id and url are required")
        
        print(f"📥 YouTube to chat: {youtube_url} for user {user_id}")
        
        # Получаем зарубежные прокси для YouTube (для обхода блокировки в РФ)
        youtube_proxy_str = os.getenv("YOUTUBE_PROXY_LIST", "")
        youtube_proxies = [p.strip() for p in youtube_proxy_str.split(",") if p.strip()]
        
        # Create temp directory
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, 'audio')
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': temp_path,
            'quiet': False,
            'no_warnings': False,
            'socket_timeout': 300,  # 5 minutes timeout
            'ffmpeg_location': r'C:\ffmpeg-2025-11-27-git-61b034a47c-essentials_build\bin',
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'web'],
                    'skip': ['dash', 'hls']
                }
            },
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            # Ускорение загрузки
            'concurrent_fragment_downloads': 4,
            'retries': 3,
            'fragment_retries': 3,
            # Скачать обложку
            'writethumbnail': True,
        }
        
        # Добавляем прокси если есть
        if youtube_proxies:
            proxy = random.choice(youtube_proxies)
            ydl_opts['proxy'] = proxy
            print(f"Using YouTube proxy: {proxy}")
        
        # Download the audio
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            print(f"✅ YouTube download complete")
        
        # Find the downloaded MP3 file and thumbnail
        downloaded_file = None
        thumbnail_file = None
        
        for ext in ['.mp3', '.webm', '.m4a', '.opus', '.mp4']:
            test_path = temp_path + ext
            if os.path.exists(test_path):
                downloaded_file = test_path
                print(f"📁 Found file: {downloaded_file}")
                break
        
        # Find thumbnail file
        for thumb_ext in ['.jpg', '.jpeg', '.png', '.webp']:
            thumb_path = temp_path + thumb_ext
            if os.path.exists(thumb_path):
                thumbnail_file = thumb_path
                print(f"🎨 Found thumbnail: {thumbnail_file}")
                break
        
        if not downloaded_file:
            files_in_dir = os.listdir(temp_dir) if os.path.exists(temp_dir) else []
            raise Exception(f"Downloaded file not found. Dir contents: {files_in_dir}")
        
        # Send to Telegram
        BOT_TOKEN = os.getenv("BOT_TOKEN")
        if not BOT_TOKEN:
            raise Exception("BOT_TOKEN not configured")
        
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendAudio"

        # Подготовить thumbnail для отправки (если есть локальный файл)
        with open(downloaded_file, 'rb') as audio_file:
            files = {'audio': audio_file}
            
            # Добавить thumbnail если есть локальный файл
            if thumbnail_file:
                with open(thumbnail_file, 'rb') as thumb_file:
                    thumbnail_data = thumb_file.read()
                    files['thumbnail'] = ('thumb.jpg', thumbnail_data, 'image/jpeg')
                    print(f"📸 Adding thumbnail from local file")
            
            data = {
                'chat_id': user_id,
                'title': track_title,
                'performer': track_artist,
                'caption': 'Отправлено из приложения Zvukly',
                'protect_content': False
            }
            
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(telegram_url, files=files, data=data)
                
                if response.status_code != 200:
                    raise Exception(f"Telegram API error: {response.text}")
        
        print(f"✅ Sent to Telegram chat {user_id}")
        
        # Track download in database
        try:
            download_msg = DownloadedMessage(
                user_id=user_id,
                chat_id=user_id,
                message_id=0,  # We don't have message_id yet
                track_id=f"yt_{info.get('id', 'unknown')}"
            )
            db.add(download_msg)
            db.commit()
        except Exception as e:
            print(f"Warning: Failed to track download: {e}")
        
        # Cleanup
        try:
            import shutil
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                print(f"🗑️ Cleaned up: {temp_dir}")
        except Exception as e:
            print(f"Error cleaning up: {e}")
        
        return {"status": "ok", "message": "Track sent to chat"}
        
    except Exception as e:
        print(f"❌ Error in YouTube to chat: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to send to chat: {str(e)}")

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

# --- Referral System Endpoints ---

@app.get("/api/referral/code")
async def get_referral_code(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get user's referral code and link"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate referral code if doesn't exist
    if not user.referral_code:
        user.referral_code = f"REF{user_id}"
        db.commit()
    
    bot_username = os.getenv("BOT_USERNAME", "muzikavtgbot")
    
    return {
        "code": user.referral_code,
        "link": f"https://t.me/{bot_username}/app?startapp={user.referral_code}",
        "referrals_count": db.query(Referral).filter(Referral.referrer_id == user_id).count(),
        "completed_referrals": db.query(Referral).filter(
            Referral.referrer_id == user_id,
            Referral.status == 'completed'
        ).count()
    }

@app.post("/api/referral/register")
async def register_referral(
    user_id: int = Query(...),
    referral_code: str = Query(...),
    db: Session = Depends(get_db)
):
    """Register a new user as referred by someone"""
    normalized_referral_code = referral_code.strip()
    referrer = None
    print(f"ℹ️ register_referral called for user_id={user_id}, referral_code={normalized_referral_code}")

    if normalized_referral_code.startswith('ref_'):
        try:
            referrer_id = int(normalized_referral_code.replace('ref_', ''))
            referrer = db.query(User).filter(User.id == referrer_id).first()
        except ValueError:
            referrer = None
    elif normalized_referral_code.startswith('REF'):
        try:
            referrer_id = int(normalized_referral_code.replace('REF', ''))
            referrer = db.query(User).filter(User.id == referrer_id).first()
        except ValueError:
            referrer = None

    if not referrer:
        referrer = db.query(User).filter(User.referral_code == normalized_referral_code).first()
    
    if not referrer:
        print(f"ℹ️ register_referral failed: invalid code={normalized_referral_code} for user_id={user_id}")
        raise HTTPException(status_code=400, detail="Invalid referral code")
    
    if referrer.id == user_id:
        print(f"ℹ️ register_referral failed: self-referral user_id={user_id}")
        raise HTTPException(status_code=400, detail="Cannot refer yourself")
    
    # Get or create user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        print(f"ℹ️ register_referral failed: user not found user_id={user_id}")
        raise HTTPException(status_code=404, detail="User not found")
    
    created = await register_referral_relationship(db, user, referrer)
    if not created:
        print(f"ℹ️ register_referral skipped: already registered user_id={user_id}, referrer_id={referrer.id}")
        raise HTTPException(status_code=400, detail="Referral already registered")
    
    return {
        "status": "ok",
        "referrer_id": referrer.id,
        "message": "Referral registered successfully"
    }

@app.get("/api/referral/stats")
async def get_referral_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get referral statistics for a user"""
    total = db.query(Referral).filter(Referral.referrer_id == user_id).count()
    completed = db.query(Referral).filter(
        Referral.referrer_id == user_id,
        Referral.status == 'completed'
    ).count()
    pending = total - completed
    
    # Get list of referrals with details
    referrals = db.query(Referral).filter(Referral.referrer_id == user_id).all()
    referral_list = []
    
    for ref in referrals:
        referred_user = db.query(User).filter(User.id == ref.referred_id).first()
        if referred_user:
            referral_list.append({
                "id": ref.id,
                "user_id": referred_user.id,
                "username": referred_user.username,
                "first_name": referred_user.first_name,
                "status": ref.status,
                "reward_given": ref.reward_given,
                "created_at": ref.created_at.isoformat() if ref.created_at else None,
                "completed_at": ref.completed_at.isoformat() if ref.completed_at else None
            })
    
    return {
        "total_referrals": total,
        "completed_referrals": completed,
        "pending_referrals": pending,
        "referrals": referral_list
    }

def extend_premium(user: User, days: int, db: Session):
    """Extend user's premium subscription by specified days"""
    from datetime import timedelta
    now = datetime.utcnow()
    
    # If user has active premium, extend from expiration date
    # Otherwise, extend from now
    if user.premium_expires_at and user.premium_expires_at > now:
        user.premium_expires_at += timedelta(days=days)
    else:
        user.premium_expires_at = now + timedelta(days=days)
    
    # Set premium flag
    user.is_premium = True
    db.commit()
    
    return user.premium_expires_at

@app.post("/api/payment/complete")
async def complete_payment(
    user_id: int = Query(...),
    plan: str = Query(...),  # 'month' or 'year'
    db: Session = Depends(get_db)
):
    """Mark payment as complete and grant premium.
    This should be called from Tribute webhook or payment verification.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Determine premium duration
    days = 30 if plan == 'month' else 365
    
    # Extend premium
    expires_at = extend_premium(user, days, db)
    
    # Send premium activation notification
    if BOT_TOKEN:
        try:
            import httpx
            telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
            async with httpx.AsyncClient() as client:
                await client.post(telegram_url, json={
                    'chat_id': user_id,
                    'text': f"✨ <b>Premium активирован!</b>\n\n"
                            f"Ваша подписка активна до {expires_at.strftime('%d.%m.%Y')}\n"
                            f"Осталось дней: {(expires_at - datetime.utcnow()).days}",
                    'parse_mode': 'HTML'
                })
        except Exception as e:
            print(f"Failed to send premium activation notification: {e}")
    
    # Check if this user was referred and reward referrer
    if user.referred_by:
        referral = db.query(Referral).filter(
            Referral.referred_id == user_id,
            Referral.status == 'pending'
        ).first()
        
        if referral and not referral.reward_given:
            # Get referrer
            referrer = db.query(User).filter(User.id == referral.referrer_id).first()
            
            if referrer:
                # Give the referrer the same duration as the invited user's first purchased subscription
                referrer_expires = extend_premium(referrer, days, db)
                
                # Update referral status
                referral.status = 'completed'
                referral.reward_given = True
                referral.completed_at = datetime.utcnow()
                db.commit()
                
                # Send notification to referrer
                if BOT_TOKEN:
                    try:
                        import httpx
                        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
                        
                        # Get referred user name
                        referred_name = user.first_name or user.username or f"User {user.id}"
                        
                        async with httpx.AsyncClient() as client:
                            await client.post(telegram_url, json={
                                'chat_id': referrer.id,
                                'text': f"💎 <b>Бонус получен!</b>\n\n"
                                        f"{referred_name} оформил подписку!\n"
                                        f"Вы получили Premium до {referrer_expires.strftime('%d.%m.%Y')} на такой же срок, как и его подписка!",
                                'parse_mode': 'HTML'
                            })
                    except Exception as e:
                        print(f"Failed to send referral notification: {e}")
    
    return {
        "status": "ok",
        "premium_expires_at": expires_at.isoformat(),
        "is_premium": True
    }

@app.post("/api/admin/promocodes")
async def create_promo_code(request: PromoCodeCreate, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Создание промокода (только для админов)"""
    # Проверка прав администратора
    admin = db.query(User).filter(User.id == user_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Проверка на существование промокода
    existing = db.query(PromoCode).filter(PromoCode.code == request.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Promo code already exists")
    
    # Создание промокода
    promo = PromoCode(
        code=request.code.upper(),
        discount_type=request.discount_type,
        value=request.value,
        max_uses=request.max_uses if request.max_uses else 0,
        is_active=True
    )
    
    db.add(promo)
    db.commit()
    db.refresh(promo)
    
    return {"status": "ok", "promo_code": promo.code}

@app.get("/api/admin/promocodes")
async def get_promo_codes(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Получение списка промокодов (только для админов)"""
    # Проверка прав администратора
    admin = db.query(User).filter(User.id == user_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    promos = db.query(PromoCode).order_by(PromoCode.created_at.desc()).all()
    return promos

@app.delete("/api/admin/promocodes/{promo_id}")
async def delete_promo_code(promo_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Удаление промокода (только для админов)"""
    # Проверка прав администратора
    admin = db.query(User).filter(User.id == user_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    promo = db.query(PromoCode).filter(PromoCode.id == promo_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found")
    
    db.delete(promo)
    db.commit()
    
    return {"status": "ok"}

@app.delete("/api/admin/user/{user_id}")
async def delete_user(user_id: int, admin_id: int = Query(...), db: Session = Depends(get_db)):
    """Удаление пользователя из БД (для тестирования)"""
    # Проверка прав администратора
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Находим пользователя
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Удаляем связанные данные
    db.query(Payment).filter(Payment.user_id == user_id).delete()
    db.query(DownloadedMessage).filter(DownloadedMessage.user_id == user_id).delete()
    db.query(Referral).filter(
        (Referral.referrer_id == user_id) | (Referral.referred_id == user_id)
    ).delete()
    
    # Удаляем пользователя
    db.delete(user)
    db.commit()
    
    return {"status": "ok", "message": f"User {user_id} deleted"}

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

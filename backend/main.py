"""
FastAPI Backend for Telegram Music Mini App
"""

from dotenv import load_dotenv
load_dotenv()  # Загружаем переменные из .env файла

from fastapi import FastAPI, HTTPException, Query, Depends, Body, BackgroundTasks, Request
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
import random
from sqlalchemy.orm import Session
from datetime import datetime
from contextlib import asynccontextmanager
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
    
    if user.is_admin:
        return True, "admin", {
            "is_premium": True,
            "premium_expires_at": user.premium_expires_at.isoformat() if user.premium_expires_at else None
        }
    
    if user.is_premium_pro:
        return True, "premium_pro", {
            "is_premium": True,
            "premium_expires_at": user.premium_expires_at.isoformat() if user.premium_expires_at else None
        }
    
    if user.is_premium:
        return True, "premium", {
            "is_premium": True,
            "premium_expires_at": user.premium_expires_at.isoformat() if user.premium_expires_at else None
        }
    
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

def can_download_to_app(user: User) -> bool:
    """
    Проверяет, может ли пользователь скачивать треки в приложение.
    Доступно для Premium и выше.
    """
    has_access_result, _, _ = has_access(user)
    return has_access_result

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
    return user.is_admin or user.is_premium_pro

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

# Genres endpoint
    
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
        
    from sqlalchemy import func
    
    # Group by date
    # SQLite specific date function
    stats = db.query(
        func.date(User.joined_at).label('date'),
        func.count(User.id).label('count')
    ).group_by('date').order_by('date').limit(days).all()
    
    return [ActivityStat(date=str(s.date), count=s.count) for s in stats]

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
    
    # Если премиум был отозван, запланировать удаление треков через 24 часа
    if was_premium and (request.is_premium == False or request.is_premium_pro == False):
        # Установить таймер на удаление через 24 часа
        now = datetime.utcnow()
        target_user.subscription_expired_at = now
        target_user.tracks_deletion_scheduled_at = now + timedelta(hours=24)
        db.commit()
        
        print(f"⚠️ Premium revoked for user {request.user_id}, tracks will be deleted in 24 hours")
        
        # Отправить уведомление пользователю
        if BOT_TOKEN:
            try:
                message = (
                    "⚠️ <b>Ваша подписка истекла</b>\n\n"
                    "Все скачанные треки будут удалены через 24 часа.\n"
                    "Оформите подписку, чтобы сохранить их!\n\n"
                    "💎 <b>Premium</b> - треки защищены от пересылки"
                )
                
                print(f"📤 Sending notification to user {request.user_id}...")
                
                telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(telegram_url, json={
                        'chat_id': request.user_id,
                        'text': message,
                        'parse_mode': 'HTML'
                    })
                    
                    if response.status_code == 200:
                        print(f"✅ Notification sent successfully to user {request.user_id}")
                    else:
                        print(f"❌ Failed to send notification: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"❌ Exception while sending notification to user {request.user_id}: {e}")
        else:
            print(f"⚠️ BOT_TOKEN not configured, skipping notification")
    
    return {"status": "ok", "message": f"Rights updated for user {request.user_id}"}

# --- Background Tasks ---

import asyncio

async def background_deletion_task():
    """Фоновая задача для удаления треков"""
    print("🔄 Background deletion task started")
    while True:
        try:
            # Создаем новую сессию БД
            db = SessionLocal()
            now = datetime.utcnow()
            
            # Ищем пользователей, у которых подошло время удаления треков
            users_to_clean = db.query(User).filter(
                User.tracks_deletion_scheduled_at <= now
            ).all()
            
            for user in users_to_clean:
                print(f"🗑️ Deleting tracks for user {user.id} (Scheduled: {user.tracks_deletion_scheduled_at})")
                
                if BOT_TOKEN:
                    # Получаем все скачанные сообщения
                    messages = db.query(DownloadedMessage).filter(DownloadedMessage.user_id == user.id).all()
                    
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
                        
                        # Удаляем записи из БД
                        db.query(DownloadedMessage).filter(DownloadedMessage.user_id == user.id).delete()
                        print(f"✅ Deleted {deleted_count} messages for user {user.id}")
                
                # Сбрасываем время удаления
                user.tracks_deletion_scheduled_at = None
                db.commit()
            
            db.close()
            
        except Exception as e:
            print(f"❌ Error in background deletion task: {e}")
        
        # Проверяем каждые 10 секунд (для теста)
        await asyncio.sleep(10)

# --- Payment Endpoints ---

class CreateStarsInvoiceRequest(BaseModel):
    user_id: int
    plan_id: str
    promo_code: Optional[str] = None
    amount: Optional[int] = None

@app.get("/api/payment/stars-products", response_model=List[StarsProductResponse])
async def get_stars_products():
    return [
        StarsProductResponse(
            id=plan_id,
            title=product["title"],
            description=product["description"],
            amount=product["amount"],
            currency="XTR",
            duration_days=product["days"],
        )
        for plan_id, product in STARS_PRODUCTS.items()
    ]

@app.post("/api/payment/create-stars-invoice")
async def create_stars_invoice_with_promo(request: CreateStarsInvoiceRequest, db: Session = Depends(get_db)):
    """Создание invoice для оплаты Telegram Stars с поддержкой промокодов"""
    try:
        user = db.query(User).filter(User.id == request.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        product = get_stars_product(request.plan_id)
        if not product:
            raise HTTPException(status_code=400, detail="Unsupported plan")

        promo = None
        if request.promo_code:
            promo = db.query(PromoCode).filter(
                PromoCode.code == request.promo_code.upper(),
                PromoCode.is_active == True
            ).first()
            if not promo:
                raise HTTPException(status_code=400, detail="Промокод не найден")
            if promo.expires_at and promo.expires_at < datetime.utcnow():
                raise HTTPException(status_code=400, detail="Промокод истёк")
            if promo.max_uses > 0 and promo.used_count >= promo.max_uses:
                raise HTTPException(status_code=400, detail="Промокод исчерпан")

        base_amount = product["amount"]
        final_amount = apply_promo_to_amount(base_amount, promo)

        if request.amount is not None and int(request.amount) != base_amount:
            print(f"Stars invoice amount mismatch from client ignored: client={request.amount}, expected={base_amount}")

        existing_pending = db.query(Payment).filter(
            Payment.user_id == request.user_id,
            Payment.plan == request.plan_id,
            Payment.status == "pending",
            Payment.provider == "telegram_stars"
        ).order_by(Payment.created_at.desc()).first()

        reuse_existing_pending = False
        if existing_pending:
            try:
                existing_meta = json.loads(existing_pending.raw_data) if existing_pending.raw_data else {}
            except Exception:
                existing_meta = {}

            existing_promo = existing_meta.get("promo_code")
            requested_promo = request.promo_code.upper() if request.promo_code else None
            existing_amount = int(float(existing_pending.amount or 0))

            if existing_promo == requested_promo and existing_amount == final_amount:
                reuse_existing_pending = True

        if reuse_existing_pending:
            payload_value = existing_pending.payload
        else:
            payload_value = build_stars_payload(request.user_id, request.plan_id, request.promo_code.upper() if request.promo_code else None)
            create_pending_stars_payment(
                db,
                request.user_id,
                request.plan_id,
                final_amount,
                payload_value,
                request.promo_code.upper() if request.promo_code else None,
            )

        if not BOT_TOKEN:
            raise HTTPException(status_code=500, detail="BOT_TOKEN is not configured")

        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink"
        title = product["title"]
        description = product["description"]

        payload = {
            "title": title,
            "description": description,
            "payload": payload_value,
            "currency": "XTR",
            "prices": [{"label": "Premium", "amount": final_amount}]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(telegram_url, json=payload)
            data = response.json()

            if not data.get("ok"):
                raise HTTPException(status_code=500, detail=data.get("description", "Failed to create invoice"))

            print(f"Telegram Stars invoice created user={request.user_id} plan={request.plan_id} amount={final_amount} payload={payload_value}")
            return {
                "status": "ok",
                "invoice_link": data["result"],
                "product_id": request.plan_id,
                "amount": final_amount,
                "currency": "XTR"
            }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/payment/check-promo")
async def check_promo_code(request: PromoCodeCheck, db: Session = Depends(get_db)):
    """Проверка промокода"""
    try:
        promo = db.query(PromoCode).filter(
            PromoCode.code == request.code.upper(),
            PromoCode.is_active == True
        ).first()
        
        if not promo:
            return {
                "valid": False,
                "message": "Промокод не найден"
            }
        
        # Проверка на истечение срока
        if promo.expires_at and promo.expires_at < datetime.utcnow():
            return {
                "valid": False,
                "message": "Промокод истёк"
            }
        
        # Проверка на количество использований
        if promo.max_uses > 0 and promo.used_count >= promo.max_uses:
            return {
                "valid": False,
                "message": "Промокод исчерпан"
            }
        
        return {
            "valid": True,
            "discount_type": promo.discount_type,
            "value": promo.value,
            "message": f"Промокод применён! Скидка: {promo.value}{'%' if promo.discount_type == 'percent' else '₽'}"
        }
    except Exception as e:
        print(f"Error checking promo code: {e}")
        return {
            "valid": False,
            "message": "Ошибка проверки промокода"
        }

# --- Debug Endpoints (для тестирования) ---

@app.post("/api/webhook/telegram")
async def telegram_webhook(update: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Webhook от Bot API для приёма успешных платежей Telegram Stars.
    Ожидает pre_checkout_query или successful_payment с payload, созданным backend.
    """
    try:
        pre_checkout_query = update.get("pre_checkout_query")
        if pre_checkout_query:
            if not BOT_TOKEN:
                return {"status": "ignored"}

            parsed_payload = parse_stars_payload(pre_checkout_query.get("invoice_payload", ""))
            ok = False
            error_message = "Платёж не найден"

            if parsed_payload:
                payment = db.query(Payment).filter(Payment.payload == pre_checkout_query.get("invoice_payload", "")).first()
                if payment and payment.status == "pending":
                    ok = True
                    error_message = ""

            async with httpx.AsyncClient() as client:
                await client.post(
                    f"https://api.telegram.org/bot{BOT_TOKEN}/answerPreCheckoutQuery",
                    json={
                        "pre_checkout_query_id": pre_checkout_query.get("id"),
                        "ok": ok,
                        **({"error_message": error_message} if not ok else {}),
                    },
                )

            return {"status": "ok" if ok else "rejected"}

        message = update.get("message") or {}
        successful_payment = message.get("successful_payment")
        if not successful_payment:
            return {"status": "ignored"}

        payload = successful_payment.get("invoice_payload", "") or ""
        payment = db.query(Payment).filter(Payment.payload == payload).first()
        if not payment:
            print(f"Telegram Stars: payment not found for payload={payload}")
            return {"status": "ignored"}

        if payment.status == "completed":
            return {"status": "duplicate"}

        amount = successful_payment.get("total_amount", 0) or 0
        currency = (successful_payment.get("currency") or "").upper()
        if currency != "XTR":
            print(f"Telegram Stars: unexpected currency={currency} payload={payload}")

        complete_stars_payment_record(db, payment, successful_payment)
        print(f"Telegram Stars: premium выдан user={payment.user_id} plan={payment.plan} amount={amount} currency={currency}")

        return {"status": "ok"}
    except Exception as e:
        print(f"Telegram webhook error: {e}")
        return {"status": "ok"}

@app.post("/api/debug/grant-premium")
async def debug_grant_premium(
    user_id: int = Query(...),
    plan: str = Query(..., description="month или year"),
    admin_id: int = Query(..., description="ID администратора"),
    db: Session = Depends(get_db)
):
    """
    Debug endpoint для ручной выдачи премиума после TON перевода.
    Используется для тестирования, когда платеж был сделан вручную.
    """
    # Проверяем, что запрос от админа
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    amount = 100 if plan == 'month' else 1000
    
    # Выдаем премиум
    success = grant_premium_after_payment(db, user_id, plan, "telegram_stars", amount)
    
    if success:
        return {
            "status": "ok",
            "message": f"Premium granted to user {user_id} for {plan}",
            "amount": amount
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to grant premium")

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
    request: Request,
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
        # Get user agent
        user_agent = request.headers.get('user-agent')
        
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
                    page_tracks = await parser.search(q, limit=48, page=p, user_agent=user_agent)
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
            tracks = await parser.search(q, limit=limit, page=page, user_agent=user_agent)
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
    request: Request,
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
        user_agent = request.headers.get('user-agent')
        tracks = await parser.get_genre_tracks(genre_id, limit=limit, page=page, user_agent=user_agent)
        
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
async def stream_audio_proxy(request: Request, url: str = Query(..., description="URL аудио файла")):
    """
    Проксирование аудио потока с поддержкой Range requests
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Load proxies
    import os
    import random
    proxy_list_str = os.getenv("PROXY_URLS", "") or os.getenv("PROXY_LIST", "")
    proxy_list = [p.strip() for p in proxy_list_str.split(",") if p.strip()]
    
    proxies = None
    if proxy_list:
        proxy = random.choice(proxy_list)
        proxies = {"http://": proxy, "https://": proxy}
        print(f"Using proxy for stream: {proxy}")
    
    # Timeout configuration - увеличен для больших файлов
    timeout = httpx.Timeout(30.0, read=120.0)  # 30s connect, 120s read
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout, proxies=proxies)
    
    # Forward User-Agent from request or use default
    user_agent = request.headers.get('user-agent')
    if not user_agent:
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    
    headers = {
        'User-Agent': user_agent,
        'Accept': '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    print(f"[STREAM] Checking URL for Hitmo: {url}")
    if "hitmotop.com" in url:
        headers['Referer'] = 'https://rus.hitmotop.com/'
        headers['Origin'] = 'https://rus.hitmotop.com'
        print(f"[STREAM] ✓ Added Hitmo headers (Referer, Origin)")
    else:
        print(f"[STREAM] ✗ URL is not from Hitmo, skipping special headers")
    
    range_header = request.headers.get("range")
    if range_header:
        headers['Range'] = range_header
        print(f"[STREAM] Range request: {range_header}")
        
    async def close_client():
        await client.aclose()
        
    try:
        print(f"[STREAM] Sending request to: {url[:100]}...")
        req = client.build_request("GET", url, headers=headers)
        r = await client.send(req, stream=True)
        
        print(f"[STREAM] Response status: {r.status_code}, Content-Type: {r.headers.get('content-type')}, Content-Length: {r.headers.get('content-length')}")
        
        if r.status_code >= 400:
            print(f"Stream error status: {r.status_code} for {url}")
            await client.aclose()
            if r.status_code == 404 and "hitmotop.com" in url:
                raise HTTPException(status_code=404, detail="Hitmo source URL expired")
            # If 403/429, it might be blocking.
            if r.status_code in [403, 429]:
                 raise HTTPException(status_code=503, detail="Source blocked request")
            raise HTTPException(status_code=r.status_code, detail="Upstream error")

        response_headers = {
            "Accept-Ranges": "bytes",
        }
        
        if "content-length" in r.headers:
            response_headers["Content-Length"] = r.headers["content-length"]
        if "content-range" in r.headers:
            response_headers["Content-Range"] = r.headers["content-range"]
        if "content-type" in r.headers:
            response_headers["Content-Type"] = r.headers["content-type"]
            
        # Если запрошено скачивание, добавляем заголовок Content-Disposition
        download_param = request.query_params.get("download")
        if download_param and download_param.lower() == "true":
            filename = url.split("/")[-1] or "track.mp3"
            # Очистка имени файла от параметров URL
            if "?" in filename:
                filename = filename.split("?")[0]
            response_headers["Content-Disposition"] = f'attachment; filename="{filename}"'
            print(f"[STREAM] Force download mode: {filename}")
            
        return StreamingResponse(
            r.aiter_bytes(),
            status_code=r.status_code,
            headers=response_headers,
            media_type=r.headers.get("content-type"),
            background=BackgroundTask(close_client)
        )
    except HTTPException:
        raise
    except Exception as e:
        await client.aclose()
        print(f"Error streaming audio: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Stream error: {str(e)}")

# --- Download to Chat Endpoints ---

class SendMessageRequest(BaseModel):
    user_id: int
    message: str

@app.post("/api/send-message")
async def send_message_to_chat(request: SendMessageRequest, db: Session = Depends(get_db)):
    """
    Send text message to user's Telegram chat via bot
    Used for playlist headers and other notifications
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token not configured")
    
    try:
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(telegram_url, json={
                'chat_id': request.user_id,
                'text': request.message,
                'parse_mode': 'HTML'
            })
            
            if response.status_code != 200:
                print(f"[SEND_MESSAGE] Telegram API error: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail="Failed to send message")
        
        return {"status": "ok"}
    except Exception as e:
        print(f"[SEND_MESSAGE] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class DownloadToChatRequest(BaseModel):
    user_id: int
    track: TrackInput

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
        
        # Premium Pro может пересылать треки, обычные пользователи - нет
        protect_content = True
        if user and (user.is_admin or user.is_premium_pro):
            protect_content = False
        
        print(f"[DOWNLOAD_TO_CHAT] User found: {user is not None}, protect_content: {protect_content}")
        
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
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
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
                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as thumb_client:
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
            'protect_content': protect_content  # Premium Pro может пересылать
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

@app.get("/api/admin/stats")
async def get_admin_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get admin dashboard stats"""
    # Verify admin
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
        
    # Calculate stats
    total_users = db.query(User).count()
    premium_users = db.query(User).filter(User.is_premium == True).count()
    admin_users = db.query(User).filter(User.is_admin == True).count()
    
    today = datetime.utcnow().date()
    new_users_today = db.query(User).filter(User.joined_at >= today).count()
    
    # Calculate revenue (mock for now or sum from payments)
    total_revenue_ton = 0.0
    total_revenue_stars = 0
    total_revenue_rub = 0.0
    
    payments = db.query(Payment).filter(Payment.status == 'completed').all()
    for p in payments:
        if p.currency == 'TON':
            try:
                total_revenue_ton += float(p.amount)
            except:
                pass
        elif p.currency == 'XTR':
            try:
                total_revenue_stars += int(p.amount)
            except:
                pass
                
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "admin_users": admin_users,
        "new_users_today": new_users_today,
        "total_revenue_ton": total_revenue_ton,
        "total_revenue_stars": total_revenue_stars,
        "total_revenue_rub": total_revenue_rub
    }

@app.get("/api/admin/cache/stats")
async def get_admin_cache_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get cache statistics"""
    # Verify admin
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
        
    return get_cache_stats()

@app.get("/api/admin/users-lite")
async def get_admin_users_lite(
    user_id: int = Query(...), 
    filter_type: str = Query("all"),
    db: Session = Depends(get_db)
):
    """Get users list with filtering"""
    # Verify admin
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
 
    query = db.query(User)
     
    if filter_type == 'premium':
        query = query.filter(User.is_premium == True)
    elif filter_type == 'admin':
        query = query.filter(User.is_admin == True)
 
    users = query.limit(100).all()
     
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "is_admin": u.is_admin,
                "is_premium": u.is_premium,
                "is_blocked": u.is_blocked
            }
            for u in users
        ]
    }

@app.post("/api/youtube/info", response_model=Track)
async def get_youtube_info(request: YouTubeRequest):
    """
    Get track info from YouTube URL using yt-dlp
    """
    try:
        import yt_dlp
        
        # Получаем зарубежные прокси для YouTube (для обхода блокировки в РФ)
        youtube_proxy_str = os.getenv("YOUTUBE_PROXY_LIST", "")
        youtube_proxies = [p.strip() for p in youtube_proxy_str.split(",") if p.strip()]
        
        # Путь к файлу куки (если есть)
        cookies_file = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        
        base_ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            # Используем разные клиенты для обхода ограничений
            'extractor_args': {
                'youtube': {
                    'player_client': ['android_creator', 'android', 'web'],
                    'skip': ['dash', 'hls']
                }
            },
            'socket_timeout': 30,
            # Имитация реального браузера
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
            },
        }
        
        # Добавляем куки если файл существует
        if os.path.exists(cookies_file):
            base_ydl_opts['cookiefile'] = cookies_file
            print(f"Using cookies from: {cookies_file}")

        extraction_errors = []
        proxy_candidates = []
        if youtube_proxies:
            proxy_candidates.append(random.choice(youtube_proxies))
        proxy_candidates.append(None)

        info = None
        for proxy in proxy_candidates:
            ydl_opts = dict(base_ydl_opts)
            if proxy:
                ydl_opts['proxy'] = proxy
                print(f"Using YouTube proxy: {proxy}")
            else:
                print("Using YouTube direct connection without proxy")

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(request.url, download=False)
                break
            except Exception as extraction_error:
                extraction_errors.append(str(extraction_error))
                print(f"YouTube extraction failed with {'proxy' if proxy else 'direct connection'}: {extraction_error}")

        if not info:
            raise Exception(" | ".join(extraction_errors) if extraction_errors else "Failed to extract YouTube info")

        # Extract relevant info
        video_id = info.get('id')
        title = info.get('title', 'Unknown Title')
        uploader = info.get('uploader', 'Unknown Artist')
        duration = info.get('duration', 0)
        thumbnail = info.get('thumbnail', '')
        # Для YouTube НЕ используем прямую ссылку (она истекает)
        # Вместо этого сохраняем оригинальную YouTube ссылку
        original_url = request.url

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

        print(f"YouTube track created: id={video_id}, url={original_url}")

        return Track(
            id=f"yt_{video_id}",
            title=track_title,
            artist=artist,
            duration=duration,
            url=original_url,
            image=thumbnail
        )
            
    except Exception as e:
        print(f"Error extracting YouTube info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process YouTube link: {str(e)}")

@app.get("/api/youtube/download_file")
async def get_youtube_file(url: str, background_tasks: BackgroundTasks, user_id: int = Query(...), db: Session = Depends(get_db)):
    """
    Download YouTube audio to server temp file and stream it to client
    Requires Premium Pro access
    """
    # Check Premium Pro access
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not can_download_to_app(user):
        raise HTTPException(
            status_code=403, 
            detail="Premium required. Subscribe to download tracks to your device."
        )
    
    import yt_dlp
    import os
    import tempfile
    
    try:
        print(f"📥 Starting download for: {url}")
        
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
            'ffmpeg_location': r'C:\ffmpeg-2025-11-27-git-61b034a47c-essentials_build\bin',
            # Современный user-agent для обхода блокировок
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            # Используем Android и Web клиенты для обхода ограничений
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
            'concurrent_fragment_downloads': 4,  # Параллельная загрузка фрагментов
            'retries': 3,  # Меньше попыток при ошибке
            'fragment_retries': 3,
            # Скачать обложку (thumbnail)
            'writethumbnail': True,
        }
        
        # Добавляем прокси если есть
        if youtube_proxies:
            proxy = random.choice(youtube_proxies)
            ydl_opts['proxy'] = proxy
            print(f"Using YouTube proxy: {proxy}")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            print(f"✅ Download complete. Info: {info.get('ext', 'unknown')}")
            
        # Find the downloaded file (extension may vary)
        downloaded_file = None
        thumbnail_file = None
        
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
        
        # Find thumbnail file
        for thumb_ext in ['.jpg', '.jpeg', '.png', '.webp']:
            thumb_path = temp_path + thumb_ext
            if os.path.exists(thumb_path):
                thumbnail_file = thumb_path
                print(f"🎨 Found thumbnail: {thumbnail_file}")
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
        
        # Встраивание обложки в MP3 отключено для скачивания в приложение
        # Браузер не умеет читать ID3 теги из Blob, обложка скачивается отдельно
        # if ext == '.mp3' and thumbnail_file:
        #     try:
        #         from mutagen.mp3 import MP3
        #         from mutagen.id3 import ID3, APIC
        #         
        #         print(f"🎨 Embedding cover art from local thumbnail: {thumbnail_file}")
        #         
        #         # Читаем thumbnail с диска
        #         with open(thumbnail_file, 'rb') as thumb_file:
        #             cover_data = thumb_file.read()
        #         
        #         # Определяем MIME тип по расширению
        #         thumb_ext = os.path.splitext(thumbnail_file)[1].lower()
        #         mime_types = {
        #             '.jpg': 'image/jpeg',
        #             '.jpeg': 'image/jpeg',
        #             '.png': 'image/png',
        #             '.webp': 'image/webp'
        #         }
        #         mime_type = mime_types.get(thumb_ext, 'image/jpeg')
        #         
        #         # Открыть MP3 и добавить обложку
        #         audio = MP3(downloaded_file, ID3=ID3)
        #         
        #         # Добавить или создать ID3 теги
        #         try:
        #             audio.add_tags()
        #         except Exception:
        #             pass  # Теги уже есть
        #         
        #         # Добавить обложку
        #         audio.tags.add(
        #             APIC(
        #                 encoding=3,  # UTF-8
        #                 mime=mime_type,
        #                 type=3,  # Cover (front)
        #                 desc='Cover',
        #                 data=cover_data
        #             )
        #         )
        #         
        #         audio.save()
        #         print(f"✅ Cover art embedded successfully")
        #     except Exception as e:
        #         print(f"⚠️ Failed to embed cover art: {e}")
        
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
        
        # Increment download count if user_id is provided (via query param usually, but here we might need to extract it)
        # For simplicity, we'll skip tracking for direct file downloads unless we pass user_id
        # But wait, this endpoint is used by the frontend player?
        # Actually, let's try to get user_id from query params if possible, but the signature doesn't have it.
        # Adding user_id to signature might break frontend if not sent.
        # Let's leave it for now, primarily tracking "Download to Chat" is more important for "Top Users".
        
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
        
        # Check if user can forward messages (Premium Pro or Admin)
        user = db.query(User).filter(User.id == user_id).first()
        can_forward = user and (user.is_admin or user.is_premium_pro)
        
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
                'protect_content': not can_forward  # True if cannot forward
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

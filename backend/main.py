"""
FastAPI Backend for Telegram Music Mini App
"""

from fastapi import FastAPI, HTTPException, Query, Depends, Body, BackgroundTasks, Request
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
from sqlalchemy.orm import Session
from datetime import datetime

try:
    from backend.hitmo_parser_light import HitmoParser
    from backend.database import User, DownloadedMessage, Lyrics, Payment, Referral, get_db, init_db, SessionLocal
    from backend.cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
    from backend.lyrics_service import LyricsService
    from backend.payments import create_stars_invoice, verify_ton_transaction, grant_premium_after_payment
    from backend.tribute import verify_tribute_signature
except ImportError:
    from hitmo_parser_light import HitmoParser
    from database import User, DownloadedMessage, Lyrics, Payment, Referral, get_db, init_db, SessionLocal
    from cache import make_cache_key, get_from_cache, set_to_cache, get_cache_stats, reset_cache
    from lyrics_service import LyricsService
    from payments import create_stars_invoice, verify_ton_transaction, grant_premium_after_payment
    from tribute import verify_tribute_signature

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
    tribute_link_month: Optional[str] = None
    tribute_link_year: Optional[str] = None
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
    tribute_link_month: Optional[str]
    tribute_link_year: Optional[str]

class PromoCodeCheck(BaseModel):
    code: str

class PromoCodeCheckResponse(BaseModel):
    valid: bool
    message: str
    discount_type: Optional[str] = None
    value: Optional[int] = None
    tribute_link_month: Optional[str] = None
    tribute_link_year: Optional[str] = None

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


from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Инициализация FastAPI
app = FastAPI(
    title="Telegram Music API",
    description="API для поиска и получения музыки через Hitmo парсер",
    version="1.0.0"
)

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
        db.commit()
    
    # Обновляем данные если изменились
    if user.username != user_data.username or \
       user.first_name != user_data.first_name or \
       user.last_name != user_data.last_name:
        user.username = user_data.username
        user.first_name = user_data.first_name
        user.last_name = user_data.last_name
        db.commit()
        
    return {"status": "ok", "user": user}

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
    
    return [ActivityStat(date=s.date, count=s.count) for s in stats]
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

@app.on_event("startup")
async def startup_event():
    init_db()
    # Фоновая задача удаления треков временно отключена
    # asyncio.create_task(background_deletion_task())

# --- Payment Endpoints ---

@app.get("/api/payment/config")
async def get_payment_config():
    """Получение конфигурации платежей (адрес кошелька TON и т.д.)"""
    from payments import TON_WALLET_ADDRESS, TON_PRICE_MONTH, TON_PRICE_YEAR
    return {
        "ton_wallet_address": TON_WALLET_ADDRESS,
        "ton_price_month": TON_PRICE_MONTH,
        "ton_price_year": TON_PRICE_YEAR,
        "tribute_link_month": os.getenv("TRIBUTE_LINK_MONTH"),
        "tribute_link_year": os.getenv("TRIBUTE_LINK_YEAR")
    }

@app.post("/api/payment/stars/create")
async def create_stars_invoice_endpoint(request: CreateInvoiceRequest):
    """Создание инвойса для Telegram Stars"""
    try:
        result = await create_stars_invoice(request.user_id, request.plan)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/payment/ton/verify")
async def verify_ton_payment(request: TonVerificationRequest, db: Session = Depends(get_db)):
    """Проверка оплаты TON"""
    try:
        # Определяем сумму по плану
        from backend.payments import TON_PRICE_MONTH, TON_PRICE_YEAR
        amount = TON_PRICE_MONTH if request.plan == 'month' else TON_PRICE_YEAR
        
        is_valid = await verify_ton_transaction(request.boc, request.user_id, request.plan)
        
        if is_valid:
            grant_premium_after_payment(db, request.user_id, request.plan, "ton", amount)
            return {"status": "ok", "message": "Payment verified and premium granted"}
        else:
            raise HTTPException(status_code=400, detail="Invalid transaction")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/webhook/telegram")
async def telegram_webhook(update: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Вебхук для обработки обновлений от Telegram (включая оплату Stars)"""
    try:
        # Обработка PreCheckoutQuery (проверка перед оплатой)
        if "pre_checkout_query" in update:
            query = update["pre_checkout_query"]
            query_id = query["id"]
            
            # Всегда подтверждаем
            telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/answerPreCheckoutQuery"
            async with httpx.AsyncClient() as client:
                await client.post(telegram_url, json={
                    "pre_checkout_query_id": query_id,
                    "ok": True
                })
            return {"status": "ok"}
            
        # Обработка SuccessfulPayment (успешная оплата)
        if "message" in update and "successful_payment" in update["message"]:
            payment = update["message"]["successful_payment"]
            user_id = update["message"]["from"]["id"]
            payload = payment["invoice_payload"] # stars_month_12345_timestamp
            amount = payment["total_amount"] # В звездах
            
            # Парсим payload
            parts = payload.split("_")
            if len(parts) >= 2:
                plan = parts[1] # month или year
                grant_premium_after_payment(db, user_id, plan, "stars", amount)
                print(f"✅ Premium granted to user {user_id} via Stars ({plan})")
                
            return {"status": "ok"}
            
        return {"status": "ok", "message": "Update ignored"}
        
    except Exception as e:
        print(f"Webhook error: {e}")
        # Не возвращаем ошибку Telegram, чтобы он не слал повторы бесконечно
        return {"status": "ok"}

@app.post("/api/webhook/tribute")
async def tribute_webhook(request: Request, db: Session = Depends(get_db)):
    """Webhook for Tribute.tg payments"""
    try:
        # 1. Verify signature
        api_key = os.getenv("TRIBUTE_API_KEY")
        signature = request.headers.get("trbt-signature")
        body = await request.body()
        
        if not verify_tribute_signature(api_key, body, signature):
            print("Invalid Tribute signature")
            # Return 200 to prevent retries if it's just a config issue, but log error
            # Actually, return 401 if signature is wrong so we know
            # But for stability, let's just log and return 200 if we are unsure
            # Better to raise 401 to see it in logs
            raise HTTPException(status_code=401, detail="Invalid signature")
            
        # 2. Parse payload
        payload = await request.json()
        event_type = payload.get("name")
        data = payload.get("payload", {})
        
        print(f"Tribute Webhook: {event_type}")
        
        # 3. Handle successful payment
        if event_type in ["order_paid", "subscription_active", "payment_succeeded"]:
            # Extract user ID
            telegram_id = None
            if "customer" in data:
                telegram_id = data["customer"].get("telegram_id")
            
            if telegram_id:
                # Determine plan based on amount or product
                # 1 TON ~ 1 Month, 10 TON ~ 1 Year
                # Or check product IDs if we configured them
                amount = data.get("amount", {}).get("value", 0)
                currency = data.get("amount", {}).get("currency", "TON")
                
                plan = "month"
                # Simple logic: if amount > 5 TON, it's a year
                if float(amount) > 5:
                    plan = "year"
                
                print(f"Processing payment for user {telegram_id}, amount {amount} {currency}, plan {plan}")
                
                # Grant premium
                # Note: telegram_id in Tribute is the user's Telegram ID
                # We need to ensure we have this user in our DB
                # Our User.id IS the telegram_id
                
                success = grant_premium_after_payment(db, int(telegram_id), plan, "tribute", float(amount))
                if success:
                    print(f"Successfully granted premium to {telegram_id}")
                else:
                    print(f"Failed to grant premium to {telegram_id}")
            else:
                print("Could not find telegram_id in webhook payload")
                    
        return {"status": "ok"}
        
    except Exception as e:
        print(f"Tribute webhook error: {e}")
        # Return 200 to acknowledge receipt even if processing failed, to stop retries
        return {"status": "ok"}

# --- Debug Endpoints (для тестирования) ---

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
    
    # Определяем сумму
    from backend.payments import TON_PRICE_MONTH, TON_PRICE_YEAR
    amount = TON_PRICE_MONTH if plan == 'month' else TON_PRICE_YEAR
    
    # Выдаем премиум
    success = grant_premium_after_payment(db, user_id, plan, "ton_manual", amount)
    
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


@app.get("/api/stream")
async def stream_audio(url: str = Query(..., description="URL аудио файла для стриминга")):
    """
    Прокси-эндпоинт для стриминга аудио файлов
    Перенаправляет запросы к оригинальным URL hitmo
    """
    try:
        from urllib.parse import unquote
        decoded_url = unquote(url)
        
        print(f"[STREAM] Proxying audio from: {decoded_url}")
        
        # Используем httpx для получения аудио
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            response = await client.get(decoded_url)
            response.raise_for_status()
            
            # Возвращаем аудио с правильными заголовками
            return Response(
                content=response.content,
                media_type=response.headers.get('content-type', 'audio/mpeg'),
                headers={
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(len(response.content)),
                    'Cache-Control': 'public, max-age=3600'
                }
            )
    except Exception as e:
        print(f"[STREAM] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stream audio: {str(e)}")


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
async def stream_audio(request: Request, url: str = Query(..., description="URL аудио файла")):
    """
    Проксирование аудио потока с поддержкой Range requests
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Load proxies
    import os
    import random
    proxy_list_str = os.getenv("PROXY_LIST", "")
    proxy_list = [p.strip() for p in proxy_list_str.split(",") if p.strip()]
    
    proxies = None
    if proxy_list:
        proxy = random.choice(proxy_list)
        proxies = {"http://": proxy, "https://": proxy}
        print(f"Using proxy for stream: {proxy}")
    
    # Timeout configuration
    timeout = httpx.Timeout(15.0, read=None)
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
        
        if r.status_code >= 400:
            print(f"Stream error status: {r.status_code} for {url}")
            await client.aclose()
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
        if user and user.is_premium_pro:
            protect_content = False
        
        print(f"[DOWNLOAD_TO_CHAT] User found: {user is not None}, protect_content: {protect_content}")
        
        # Обработка URL: если относительный, преобразуем в абсолютный
        audio_url = request.track.audioUrl
        if audio_url.startswith('/api/'):
            # Относительный URL - используем локальный прокси
            audio_url = f"http://localhost:8000{audio_url}"
            print(f"[DOWNLOAD_TO_CHAT] Converted relative URL to: {audio_url[:100]}...")
        
        print(f"[DOWNLOAD_TO_CHAT] Downloading audio from: {audio_url[:100]}...")
        
        # Подготовка заголовков для скачивания
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

@app.get("/api/admin/users")
async def get_admin_users(
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
                url=original_url,  # Оригинальная YouTube ссылка
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
    
    # Use muzikavtgbot as bot username
    bot_username = "muzikavtgbot"
    
    return {
        "code": user.referral_code,
        "link": f"https://t.me/{bot_username}?start={user.referral_code}",
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
    # Find referrer by code
    referrer = db.query(User).filter(User.referral_code == referral_code).first()
    
    if not referrer:
        raise HTTPException(status_code=400, detail="Invalid referral code")
    
    if referrer.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot refer yourself")
    
    # Get or create user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already referred
    if user.referred_by:
        raise HTTPException(status_code=400, detail="User already has a referrer")
    
    # Check if referral already exists
    existing = db.query(Referral).filter(
        Referral.referred_id == user_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Referral already registered")
    
    # Create referral record
    user.referred_by = referrer.id
    
    referral = Referral(
        referrer_id=referrer.id,
        referred_id=user_id,
        status='pending',
        reward_given=False
    )
    db.add(referral)
    db.commit()
    
    # Send notification to referrer via Telegram
    if BOT_TOKEN:
        try:
            import httpx
            telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
            
            # Get new user name
            new_user_name = user.first_name or user.username or f"Пользователь {user.id}"
            
            async with httpx.AsyncClient() as client:
                await client.post(telegram_url, json={
                    'chat_id': referrer.id,
                    'text': f"🎉 <b>Новый реферал!</b>\n\n"
                            f"{new_user_name} зарегистрировался по вашей ссылке.\n"
                            f"Когда он оформит подписку, вы получите +30 дней Premium!",
                    'parse_mode': 'HTML'
                })
        except Exception as e:
            print(f"Failed to send referral joined notification: {e}")
    
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
    """
    Mark payment as complete and grant premium.
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
                # Give 30 days premium to referrer
                referrer_expires = extend_premium(referrer, 30, db)
                
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
                                        f"Вы получили +30 дней Premium до {referrer_expires.strftime('%d.%m.%Y')}!",
                                'parse_mode': 'HTML'
                            })
                    except Exception as e:
                        print(f"Failed to send referral notification: {e}")
    
    return {
        "status": "ok",
        "premium_expires_at": expires_at.isoformat(),
        "is_premium": True
    }


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

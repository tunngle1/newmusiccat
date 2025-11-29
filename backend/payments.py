import os
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

try:
    from backend.database import User
except ImportError:
    from database import User

# Константы для оплаты
STARS_PRICE_MONTH = 100  # Цена в звездах за месяц (пример)
STARS_PRICE_YEAR = 1000  # Цена в звездах за год (пример)

TON_PRICE_MONTH = 1.0    # Цена в TON за месяц
TON_PRICE_YEAR = 10.0    # Цена в TON за год

BOT_TOKEN = os.getenv("BOT_TOKEN")
TON_WALLET_ADDRESS = os.getenv("TON_WALLET_ADDRESS", "UQBtZ_...") # Заглушка, если не задан

async def create_stars_invoice(user_id: int, plan: str) -> Dict[str, Any]:
    """
    Создает ссылку на инвойс для оплаты Telegram Stars.
    plan: 'month' или 'year'
    """
    if not BOT_TOKEN:
        raise Exception("BOT_TOKEN not configured")

    amount = STARS_PRICE_MONTH if plan == 'month' else STARS_PRICE_YEAR
    title = f"Premium Subscription ({'1 Month' if plan == 'month' else '1 Year'})"
    description = "Access to exclusive features and unlimited downloads"
    payload = f"stars_{plan}_{user_id}_{int(datetime.utcnow().timestamp())}"
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink"
    
    data = {
        "title": title,
        "description": description,
        "payload": payload,
        "provider_token": "", # Пусто для Stars
        "currency": "XTR",    # Валюта для Stars
        "prices": [{"label": "Premium", "amount": amount}],
        "photo_url": "https://example.com/premium_image.jpg" # Можно добавить ссылку на картинку
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=data)
        result = response.json()
        
        if not result.get("ok"):
            raise Exception(f"Failed to create invoice: {result.get('description')}")
            
        return {"invoice_link": result["result"]}

async def verify_ton_transaction(boc: str, user_id: int, plan: str) -> bool:
    """
    Проверяет транзакцию TON.
    В реальном приложении нужно декодировать BOC и проверять транзакцию в блокчейне.
    Здесь пока заглушка.
    """
    # TODO: Реализовать проверку через toncenter API или другой индексатор
    # Нужно проверить:
    # 1. Получатель == TON_WALLET_ADDRESS
    # 2. Сумма соответствует плану
    # 3. Комментарий (memo) содержит ID пользователя (если используется)
    
    print(f"Verifying TON transaction for user {user_id}, plan {plan}")
    
    # Временная заглушка: всегда возвращаем True для теста
    return True

def grant_premium_after_payment(db: Session, user_id: int, plan: str, payment_method: str):
    """
    Выдает премиум после успешной оплаты.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
        
    now = datetime.utcnow()
    days = 30 if plan == 'month' else 365
    
    # Если уже есть премиум, продлеваем
    if user.premium_expires_at and user.premium_expires_at > now:
        user.premium_expires_at += timedelta(days=days)
    else:
        user.premium_expires_at = now + timedelta(days=days)
        
    user.is_premium = True
    # Можно добавить логирование платежа в БД
    
    db.commit()
    return True

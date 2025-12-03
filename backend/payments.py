import os
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

try:
    from backend.database import User, Payment
except ImportError:
    from database import User, Payment

# Константы для оплаты
STARS_PRICE_MONTH = 100  # Цена в звездах за месяц
STARS_PRICE_YEAR = 1000  # Цена в звездах за год

RUB_PRICE_MONTH = 199    # Цена в рублях за месяц
RUB_PRICE_YEAR = 1990    # Цена в рублях за год

BOT_TOKEN = os.getenv("BOT_TOKEN")
PAYMENT_PROVIDER_TOKEN = os.getenv("PAYMENT_PROVIDER_TOKEN", "")
YOOMONEY_WALLET = os.getenv("YOOMONEY_WALLET")
YOOMONEY_SECRET = os.getenv("YOOMONEY_SECRET")

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


def create_yoomoney_link(user_id: int, plan: str, amount: float) -> str:
    """
    Создает ссылку на оплату через ЮMoney (QuickPay).
    
    Args:
        user_id: ID пользователя
        plan: План подписки ('month' или 'year')
        amount: Сумма в рублях
    
    Returns:
        URL для оплаты
    """
    if not YOOMONEY_WALLET:
        raise Exception("YOOMONEY_WALLET not configured")
    
    # Формируем label для идентификации платежа
    label = f"{user_id}:{plan}"
    
    # Параметры для QuickPay
    params = {
        'receiver': YOOMONEY_WALLET,
        'quickpay-form': 'shop',
        'targets': f'Premium подписка ({plan})',
        'paymentType': 'AC',  # Оплата с карты
        'sum': amount,
        'label': label
    }
    
    # Формируем URL
    from urllib.parse import urlencode
    base_url = "https://yoomoney.ru/quickpay/confirm.xml"
    payment_url = f"{base_url}?{urlencode(params)}"
    
    return payment_url


def verify_yoomoney_notification(data: dict) -> bool:
    """
    Проверяет подпись уведомления от ЮMoney.
    
    Args:
        data: Данные из POST-запроса от ЮMoney
    
    Returns:
        True если подпись верна, False в противном случае
    """
    if not YOOMONEY_SECRET:
        print("❌ YOOMONEY_SECRET not configured")
        return False
    
    try:
        secret = YOOMONEY_SECRET
        
        # Параметры для проверки подписи (в строгом порядке)
        params = [
            data.get('notification_type', ''),
            data.get('operation_id', ''),
            data.get('amount', ''),
            data.get('currency', ''),
            data.get('datetime', ''),
            data.get('sender', ''),
            data.get('codepro', ''),
            secret,
            data.get('label', '')
        ]
        
        # Собираем строку для хеширования
        string_to_hash = '&'.join(str(x) for x in params)
        
        import hashlib
        # Вычисляем SHA-1 хеш
        calculated_hash = hashlib.sha1(string_to_hash.encode('utf-8')).hexdigest()
        
        # Сравниваем с присланным хешем
        received_hash = data.get('sha1_hash', '')
        
        if calculated_hash == received_hash:
            return True
        
        print(f"❌ Hash mismatch: calculated {calculated_hash} != received {received_hash}")
        print(f"   String to hash: {string_to_hash}")
    except Exception as e:
        print(f"❌ Error verifying YooMoney notification: {e}")
    return False


def grant_premium_after_payment(db: Session, user_id: int, plan: str, payment_method: str, amount: float = 0):
    """
    Выдает премиум и сохраняет запись о платеже.
    """
    try:
        print(f"DEBUG: Starting grant_premium_after_payment for {user_id}")
        print(f"DEBUG: User model: {User}")
        print(f"DEBUG: Payment model: {Payment}")
        
        user = db.query(User).filter(User.id == user_id).first()
        print(f"DEBUG: User query result: {user}")
        
        if not user:
            print("DEBUG: User not found")
            return False
            
        now = datetime.utcnow()
        days = 30 if plan == 'month' else 365
        
        # Если уже есть премиум, продлеваем
        if user.premium_expires_at and user.premium_expires_at > now:
            user.premium_expires_at += timedelta(days=days)
        else:
            user.premium_expires_at = now + timedelta(days=days)
            
        user.is_premium = True
        print("DEBUG: User updated")
        
        # Определяем валюту
        if payment_method == "yoomoney_p2p":
            currency = "RUB"
        elif payment_method in ["stars", "telegram_stars"]:
            currency = "XTR"
        else:
            currency = "XTR"
        
        # Сохраняем платеж
        payment = Payment(
            user_id=user_id,
            amount=str(amount),
            currency=currency,
            plan=plan,
            status="completed",
            created_at=now
        )
        print("DEBUG: Payment object created")
        db.add(payment)
        print("DEBUG: Payment added to session")
        
        db.commit()
        print(f"✅ Premium granted to {user_id} ({plan}) via {payment_method}")
        return True
    except Exception as e:
        print(f"❌ Error granting premium: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False

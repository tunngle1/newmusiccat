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
    Проверяет транзакцию TON через tonapi.io (Testnet).
    
    Args:
        boc: Base64-encoded Bag of Cells (транзакция)
        user_id: ID пользователя
        plan: План подписки ('month' или 'year')
    
    Returns:
        True если транзакция валидна, False в противном случае
    """
    try:
        from pytoniq_core import Cell
        import base64
        
        print(f"🔍 [TON] Verifying transaction for user {user_id}, plan {plan}")
        print(f"📦 BOC length: {len(boc)} characters")
        
        # 1. Декодируем BOC
        try:
            # BOC может быть в base64, декодируем
            boc_bytes = base64.b64decode(boc)
            cell = Cell.one_from_boc(boc_bytes)
            
            # Получаем хэш транзакции
            tx_hash = cell.hash.hex()
            print(f"🔑 Transaction hash: {tx_hash}")
            
        except Exception as e:
            print(f"❌ Failed to decode BOC: {e}")
            return False
        
        # 2. Проверяем транзакцию через TON API
        ton_api_url = os.getenv("TON_API_URL", "https://testnet.tonapi.io")
        api_key = os.getenv("TON_API_KEY", "")
        
        headers = {
            "Accept": "application/json"
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        # Запрашиваем информацию о транзакции
        api_endpoint = f"{ton_api_url}/v2/blockchain/transactions/{tx_hash}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(api_endpoint, headers=headers)
                
                if response.status_code == 404:
                    print(f"❌ Transaction not found in blockchain: {tx_hash}")
                    return False
                
                if response.status_code != 200:
                    print(f"❌ API error: {response.status_code} - {response.text}")
                    return False
                
                tx_data = response.json()
                print(f"✅ Transaction found in blockchain")
                
            except Exception as e:
                print(f"❌ API request failed: {e}")
                return False
        
        # 3. Валидация транзакции
        
        # 3.1 Проверяем успешность транзакции
        if not tx_data.get("success", False):
            print(f"❌ Transaction failed (success=False)")
            return False
        
        # 3.2 Проверяем получателя
        out_msgs = tx_data.get("out_msgs", [])
        if not out_msgs:
            print(f"❌ No outgoing messages in transaction")
            return False
        
        # Ищем сообщение с переводом на наш кошелек
        expected_wallet = TON_WALLET_ADDRESS.lower()
        found_payment = False
        received_amount = 0
        
        for msg in out_msgs:
            destination = msg.get("destination", {})
            dest_address = destination.get("address", "").lower()
            
            # Сумма в нано-тонах
            value = int(msg.get("value", 0))
            
            if expected_wallet in dest_address or dest_address in expected_wallet:
                found_payment = True
                received_amount = value / 1_000_000_000  # Конвертируем в TON
                print(f"💰 Payment found: {received_amount} TON to {dest_address}")
                break
        
        if not found_payment:
            print(f"❌ Payment to {expected_wallet} not found in transaction")
            return False
        
        # 3.3 Проверяем сумму
        expected_amount = TON_PRICE_MONTH if plan == 'month' else TON_PRICE_YEAR
        
        # Допускаем небольшую погрешность (0.01 TON) из-за комиссий
        if abs(received_amount - expected_amount) > 0.01:
            print(f"❌ Amount mismatch: expected {expected_amount} TON, got {received_amount} TON")
            return False
        
        # 3.4 Проверяем время транзакции (не старше 10 минут)
        tx_timestamp = tx_data.get("utime", 0)
        current_timestamp = int(datetime.utcnow().timestamp())
        
        if current_timestamp - tx_timestamp > 600:  # 10 минут
            print(f"❌ Transaction too old: {current_timestamp - tx_timestamp} seconds")
            return False
        
        print(f"✅ Transaction verified successfully!")
        print(f"   Hash: {tx_hash}")
        print(f"   Amount: {received_amount} TON")
        print(f"   Recipient: {dest_address}")
        print(f"   Time: {tx_timestamp}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error verifying TON transaction: {e}")
        import traceback
        traceback.print_exc()
        return False

def grant_premium_after_payment(db: Session, user_id: int, plan: str, payment_method: str, amount: float = 0):
    """
    Выдает премиум и сохраняет запись о платеже.
    """
    try:
        from backend.database import Payment
        
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
        
        # Сохраняем платеж
        payment = Payment(
            user_id=user_id,
            amount=str(amount),
            currency="TON" if payment_method == "ton" else "XTR",
            plan=plan,
            status="completed",
            created_at=now
        )
        db.add(payment)
        
        db.commit()
        print(f"✅ Premium granted to {user_id} ({plan}) via {payment_method}")
        return True
    except Exception as e:
        print(f"❌ Error granting premium: {e}")
        db.rollback()
        return False

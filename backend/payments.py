from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import json
import secrets

try:
    from backend.database import User, Payment
except ImportError:
    from database import User, Payment

STARS_PRODUCTS = {
    "month": {
        "title": "Premium подписка (1 месяц)",
        "description": "Безлимитное скачивание музыки и доступ к эксклюзивным функциям на 30 дней",
        "amount": 100,
        "days": 30,
    },
    "year": {
        "title": "Premium подписка (1 год)",
        "description": "Безлимитное скачивание музыки и доступ к эксклюзивным функциям на 365 дней",
        "amount": 1000,
        "days": 365,
    },
}


def get_stars_product(plan: str):
    return STARS_PRODUCTS.get(plan)


def build_stars_payload(user_id: int, plan: str, promo_code: str | None = None) -> str:
    token = secrets.token_hex(8)
    promo_part = promo_code or "none"
    return f"stars:{user_id}:{plan}:{promo_part}:{token}"


def parse_stars_payload(payload: str) -> dict | None:
    try:
        parts = (payload or "").split(":")
        if len(parts) < 5 or parts[0] != "stars":
            return None
        return {
            "user_id": int(parts[1]),
            "plan": parts[2],
            "promo_code": None if parts[3] == "none" else parts[3],
            "token": parts[4],
        }
    except Exception:
        return None


def create_pending_stars_payment(db: Session, user_id: int, plan: str, amount: int, payload: str, promo_code: str | None = None):
    payment = Payment(
        user_id=user_id,
        amount=str(amount),
        currency="XTR",
        plan=plan,
        status="pending",
        provider="telegram_stars",
        payload=payload,
        raw_data=json.dumps({"promo_code": promo_code} if promo_code else {}, ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def mark_stars_payment_completed(
    db: Session,
    payment: Payment,
    telegram_payment_charge_id: str | None,
    provider_payment_charge_id: str | None,
    raw_data: dict | None = None,
):
    payment.status = "completed"
    payment.telegram_payment_charge_id = telegram_payment_charge_id
    payment.provider_payment_charge_id = provider_payment_charge_id
    payment.completed_at = datetime.utcnow()
    if raw_data is not None:
        payment.raw_data = json.dumps(raw_data, ensure_ascii=False)
    db.commit()
    db.refresh(payment)
    return payment


def activate_premium_for_payment(db: Session, payment: Payment, payment_method: str = "telegram_stars"):
    user = db.query(User).filter(User.id == payment.user_id).first()
    if not user:
        return False

    now = datetime.utcnow()
    days = 30 if payment.plan == 'month' else 365

    if user.premium_expires_at and user.premium_expires_at > now:
        user.premium_expires_at += timedelta(days=days)
    else:
        user.premium_expires_at = now + timedelta(days=days)

    user.is_premium = True
    db.commit()

    try:
        from database import Referral
    except ImportError:
        from backend.database import Referral

    referral = db.query(Referral).filter(
        Referral.referred_id == payment.user_id,
        Referral.reward_given == False
    ).first()

    if referral:
        referrer = db.query(User).filter(User.id == referral.referrer_id).first()
        if referrer:
            if referrer.premium_expires_at and referrer.premium_expires_at > now:
                referrer.premium_expires_at += timedelta(days=days)
            else:
                referrer.premium_expires_at = now + timedelta(days=days)

            referrer.is_premium = True
            referral.status = 'completed'
            referral.reward_given = True
            referral.completed_at = now
            db.commit()

    return True

def grant_premium_after_payment(db: Session, user_id: int, plan: str, payment_method: str, amount: float = 0):
    """
    Выдает премиум и сохраняет запись о платеже.
    Также выдает премиум пригласившему при первой оплате реферала.
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
        
        currency = "XTR"
        
        # Сохраняем платеж
        payment = Payment(
            user_id=user_id,
            amount=str(amount),
            currency=currency,
            plan=plan,
            status="completed",
            provider=payment_method,
            created_at=now,
            completed_at=now
        )
        print("DEBUG: Payment object created")
        db.add(payment)
        print("DEBUG: Payment added to session")
        
        db.commit()
        print(f"✅ Premium granted to {user_id} ({plan}) via {payment_method}")
        
        # РЕФЕРАЛЬНАЯ СИСТЕМА: Проверяем, есть ли реферал
        try:
            from database import Referral
        except ImportError:
            from backend.database import Referral
            
        referral = db.query(Referral).filter(
            Referral.referred_id == user_id,
            Referral.reward_given == False
        ).first()
        
        if referral:
            print(f"🎁 Found referral: {referral.referrer_id} invited {user_id}")
            
            # Выдаем премиум пригласившему
            referrer = db.query(User).filter(User.id == referral.referrer_id).first()
            
            if referrer:
                # Суммируем премиум
                if referrer.premium_expires_at and referrer.premium_expires_at > now:
                    referrer.premium_expires_at += timedelta(days=days)
                else:
                    referrer.premium_expires_at = now + timedelta(days=days)
                
                referrer.is_premium = True
                
                # Обновляем статус реферала
                referral.status = 'completed'
                referral.reward_given = True
                referral.completed_at = now
                
                db.commit()
                print(f"✅ Referral reward granted to {referral.referrer_id} ({plan})")
                
                # Возвращаем данные для отправки уведомления
                return {
                    'success': True,
                    'referrer_id': referral.referrer_id,
                    'referrer_username': referrer.username,
                    'plan': plan
                }
        
        return True
    except Exception as e:
        print(f"❌ Error granting premium: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False

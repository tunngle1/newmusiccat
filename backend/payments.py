import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

try:
    from backend.database import User, Payment
except ImportError:
    from database import User, Payment

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
            created_at=now
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

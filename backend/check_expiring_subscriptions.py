"""
Скрипт для отправки уведомлений об истекающих подписках
Запускается ежедневно через cron/планировщик задач
"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
import httpx

# Добавляем путь к backend для импорта модулей
sys.path.insert(0, os.path.dirname(__file__))

load_dotenv()

try:
    from database import SessionLocal, User
except ImportError:
    from backend.database import SessionLocal, User

BOT_TOKEN = os.getenv("BOT_TOKEN")

async def send_expiry_notifications():
    """
    Отправляет уведомления пользователям, у которых подписка истекает через 3 дня
    """
    if not BOT_TOKEN:
        print("❌ BOT_TOKEN not configured")
        return
    
    db = SessionLocal()
    try:
        # Вычисляем дату через 3 дня
        three_days_from_now = datetime.utcnow() + timedelta(days=3)
        four_days_from_now = datetime.utcnow() + timedelta(days=4)
        
        print(f"🔍 Checking for subscriptions expiring between {three_days_from_now.date()} and {four_days_from_now.date()}")
        
        # Находим пользователей с истекающей подпиской
        users = db.query(User).filter(
            User.premium_expires_at.isnot(None),
            User.premium_expires_at >= three_days_from_now,
            User.premium_expires_at < four_days_from_now,
            User.is_blocked == False
        ).all()
        
        print(f"📊 Found {len(users)} users with expiring subscriptions")
        
        telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        
        for user in users:
            try:
                # Форматируем дату истечения
                expiry_date = user.premium_expires_at.strftime('%d.%m.%Y')
                
                message_text = (
                    f"⏰ Напоминание о подписке\n\n"
                    f"Ваша Premium подписка истекает через 3 дня - {expiry_date}\n\n"
                    f"💎 Продлите подписку, чтобы не потерять доступ к:\n"
                    f"• Безлимитным скачиваниям\n"
                    f"• Отправке треков в чат\n"
                    f"• Высокому качеству аудио\n\n"
                    f"Продлить можно в разделе \"Подписка\" в приложении"
                )
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(telegram_url, json={
                        'chat_id': user.id,
                        'text': message_text
                    })
                    
                    if response.status_code == 200:
                        print(f"✅ Notification sent to user {user.id} ({user.username or user.first_name})")
                    else:
                        print(f"❌ Failed to send to user {user.id}: {response.text}")
                        
            except Exception as e:
                print(f"❌ Error sending to user {user.id}: {e}")
                
    except Exception as e:
        print(f"❌ Database error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    print("🚀 Starting subscription expiry notification check...")
    asyncio.run(send_expiry_notifications())
    print("✅ Notification check complete")

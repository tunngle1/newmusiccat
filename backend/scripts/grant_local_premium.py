"""
Скрипт для локальной выдачи премиум подписки
Запустите: python grant_local_premium.py
"""

import sqlite3
from datetime import datetime, timedelta

# Путь к базе данных
DB_PATH = "./users.db"

# Ваш Telegram ID (замените на свой)
USER_ID = 414153884  # ID супер-админа из предыдущих сессий

# Длительность подписки (в днях)
PREMIUM_DAYS = 365  # 1 год

def grant_premium(user_id: int, days: int):
    """Выдать премиум подписку пользователю"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем существует ли пользователь
        cursor.execute("SELECT id, premium_expires_at FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            print(f"❌ Пользователь {user_id} не найден в базе данных")
            print("Создаём нового пользователя...")
            
            # Создаём пользователя
            expires_at = datetime.utcnow() + timedelta(days=days)
            cursor.execute("""
                INSERT INTO users (id, is_premium, premium_expires_at, is_admin)
                VALUES (?, ?, ?, ?)
            """, (user_id, True, expires_at.isoformat(), True))
            
            print(f"✅ Создан новый пользователь {user_id} с премиум до {expires_at.strftime('%d.%m.%Y')}")
        else:
            # Обновляем существующего пользователя
            current_expires = user[1]
            
            if current_expires:
                # Если есть активная подписка, продлеваем от даты окончания
                current_date = datetime.fromisoformat(current_expires)
                if current_date > datetime.utcnow():
                    expires_at = current_date + timedelta(days=days)
                else:
                    expires_at = datetime.utcnow() + timedelta(days=days)
            else:
                # Если подписки нет, выдаём от текущей даты
                expires_at = datetime.utcnow() + timedelta(days=days)
            
            cursor.execute("""
                UPDATE users 
                SET is_premium = ?, premium_expires_at = ?
                WHERE id = ?
            """, (True, expires_at.isoformat(), user_id))
            
            print(f"✅ Премиум выдан пользователю {user_id} до {expires_at.strftime('%d.%m.%Y %H:%M')}")
        
        conn.commit()
        print(f"🎉 Подписка успешно активирована на {days} дней!")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 50)
    print("🎵 ЗВУКЛИ - Выдача локального премиума")
    print("=" * 50)
    print(f"User ID: {USER_ID}")
    print(f"Длительность: {PREMIUM_DAYS} дней")
    print("=" * 50)
    
    grant_premium(USER_ID, PREMIUM_DAYS)
    
    print("\n💡 Перезапустите приложение чтобы увидеть изменения")

"""
Telegram Bot для музыкального приложения
Обрабатывает реферальные ссылки и отправляет уведомления
"""

import os
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
from dotenv import load_dotenv
import httpx

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://your-webapp-url.com")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка команды /start с реферальным кодом"""
    user = update.effective_user
    user_id = user.id
    
    # Проверяем, есть ли start параметр (реферальный код)
    referral_code = None
    if context.args and len(context.args) > 0:
        referral_code = context.args[0]
        
        # Регистрируем реферала через API
        if referral_code.startswith('REF'):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{API_BASE_URL}/api/referral/register",
                        params={
                            "user_id": user_id,
                            "referral_code": referral_code
                        }
                    )
                    
                    if response.status_code == 200:
                        # Уведомляем реферера
                        referrer_id = response.json().get('referrer_id')
                        if referrer_id:
                            await context.bot.send_message(
                                chat_id=referrer_id,
                                text=f"🎉 <b>Новый реферал!</b>\n\n"
                                     f"{user.first_name} зарегистрировался по вашей ссылке.\n"
                                     f"Когда он оформит подписку, вы получите +30 дней Premium!",
                                parse_mode='HTML'
                            )
                        
                        welcome_text = (
                            f"🎉 Добро пожаловать, {user.first_name}!\n\n"
                            f"Вы зарегистрированы по реферальной ссылке.\n"
                            f"Оформите подписку, и ваш друг получит бонус!"
                        )
                    else:
                        welcome_text = f"👋 Добро пожаловать, {user.first_name}!"
            except Exception as e:
                print(f"Error registering referral: {e}")
                welcome_text = f"👋 Добро пожаловать, {user.first_name}!"
        else:
            welcome_text = f"👋 Добро пожаловать, {user.first_name}!"
    else:
        welcome_text = f"👋 Добро пожаловать, {user.first_name}!"
    
    # Отправляем кнопку для открытия Mini App
    keyboard = [[
        InlineKeyboardButton(
            "🎵 Открыть приложение",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    ]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        f"{welcome_text}\n\n"
        f"🎵 Нажмите кнопку ниже, чтобы открыть музыкальное приложение:",
        reply_markup=reply_markup
    )


async def premium_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать статус премиума"""
    user_id = update.effective_user.id
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE_URL}/api/subscription/status?user_id={user_id}"
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('has_access'):
                    reason = data.get('reason')
                    
                    if reason == 'admin':
                        status_text = "👑 <b>Статус: Администратор</b>\n\nУ вас полный доступ ко всем функциям."
                    elif reason == 'premium_pro':
                        expires = data.get('premium_expires_at')
                        if expires:
                            from datetime import datetime
                            exp_date = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                            days_left = (exp_date - datetime.now()).days
                            status_text = (
                                f"💎 <b>Статус: Premium Pro</b>\n\n"
                                f"Активен до: {exp_date.strftime('%d.%m.%Y')}\n"
                                f"Осталось дней: {days_left}"
                            )
                        else:
                            status_text = "💎 <b>Статус: Premium Pro</b>\n\nПодписка активна."
                    elif reason == 'premium':
                        expires = data.get('premium_expires_at')
                        if expires:
                            from datetime import datetime
                            exp_date = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                            days_left = (exp_date - datetime.now()).days
                            status_text = (
                                f"⭐ <b>Статус: Premium</b>\n\n"
                                f"Активен до: {exp_date.strftime('%d.%m.%Y')}\n"
                                f"Осталось дней: {days_left}"
                            )
                        else:
                            status_text = "⭐ <b>Статус: Premium</b>\n\nПодписка активна."
                    elif reason == 'trial':
                        expires = data.get('trial_expires_at')
                        if expires:
                            from datetime import datetime
                            exp_date = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                            days_left = (exp_date - datetime.now()).days
                            status_text = (
                                f"🎁 <b>Статус: Пробный период</b>\n\n"
                                f"Активен до: {exp_date.strftime('%d.%m.%Y')}\n"
                                f"Осталось дней: {days_left}"
                            )
                        else:
                            status_text = "🎁 <b>Статус: Пробный период</b>"
                    else:
                        status_text = "✅ <b>Доступ активен</b>"
                else:
                    status_text = (
                        "❌ <b>Нет активной подписки</b>\n\n"
                        "Оформите Premium для полного доступа к функциям!"
                    )
                
                await update.message.reply_text(status_text, parse_mode='HTML')
            else:
                await update.message.reply_text("Ошибка при получении статуса подписки.")
    except Exception as e:
        print(f"Error getting premium status: {e}")
        await update.message.reply_text("Ошибка при получении статуса подписки.")


async def referral_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать статистику рефералов"""
    user_id = update.effective_user.id
    
    try:
        async with httpx.AsyncClient() as client:
            # Получаем реферальный код
            code_response = await client.get(
                f"{API_BASE_URL}/api/referral/code?user_id={user_id}"
            )
            
            # Получаем статистику
            stats_response = await client.get(
                f"{API_BASE_URL}/api/referral/stats?user_id={user_id}"
            )
            
            if code_response.status_code == 200 and stats_response.status_code == 200:
                code_data = code_response.json()
                stats_data = stats_response.json()
                
                referral_link = code_data.get('link')
                total = stats_data.get('total_referrals', 0)
                completed = stats_data.get('completed_referrals', 0)
                pending = stats_data.get('pending_referrals', 0)
                
                stats_text = (
                    f"🎁 <b>Реферальная программа</b>\n\n"
                    f"Ваша ссылка:\n<code>{referral_link}</code>\n\n"
                    f"📊 Статистика:\n"
                    f"• Всего рефералов: {total}\n"
                    f"• Активных: {completed} 💎\n"
                    f"• Ожидают: {pending} ⏳\n\n"
                    f"За каждого друга, оформившего подписку, вы получаете +30 дней Premium!"
                )
                
                # Кнопка для шаринга
                keyboard = [[
                    InlineKeyboardButton(
                        "📤 Поделиться ссылкой",
                        url=f"https://t.me/share/url?url={referral_link}&text=🎵 Присоединяйся к лучшему музыкальному боту!"
                    )
                ]]
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                await update.message.reply_text(
                    stats_text,
                    parse_mode='HTML',
                    reply_markup=reply_markup
                )
            else:
                await update.message.reply_text("Ошибка при получении статистики.")
    except Exception as e:
        print(f"Error getting referral stats: {e}")
        await update.message.reply_text("Ошибка при получении статистики.")


async def send_notification(user_id: int, message: str):
    """Вспомогательная функция для отправки уведомлений"""
    try:
        app = Application.builder().token(BOT_TOKEN).build()
        await app.bot.send_message(
            chat_id=user_id,
            text=message,
            parse_mode='HTML'
        )
    except Exception as e:
        print(f"Error sending notification to {user_id}: {e}")


def main():
    """Запуск бота"""
    if not BOT_TOKEN:
        print("❌ BOT_TOKEN not found in environment variables!")
        return
    
    print("🤖 Starting Telegram Bot...")
    
    # Создаем приложение
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Регистрируем обработчики команд
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("premium", premium_status))
    application.add_handler(CommandHandler("referral", referral_stats))
    
    # Запускаем бота
    print("✅ Bot is running!")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

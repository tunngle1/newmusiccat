"""
Telegram Bot для музыкального приложения
Обрабатывает реферальные ссылки и отправляет уведомления
"""

import os
import asyncio
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, PreCheckoutQueryHandler, MessageHandler, filters
from dotenv import load_dotenv
import httpx

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://your-webapp-url.com")
MAIN_ADMIN_ID = int(os.getenv("MAIN_ADMIN_ID", "414153884"))

def is_main_admin(user_id: int | None) -> bool:
    return bool(user_id) and user_id == MAIN_ADMIN_ID

def _format_star_transaction(transaction: dict) -> str:
    amount = None
    source = transaction.get("source") or transaction.get("partner") or {}
    if isinstance(source, dict):
        amount = source.get("amount")
    if amount is None:
        amount = transaction.get("amount")

    transaction_id = transaction.get("id", "—")
    description = transaction.get("description") or transaction.get("title") or "Без описания"
    date_value = transaction.get("date") or transaction.get("created_at")
    date_text = "—"
    if date_value is not None:
        try:
            date_text = datetime.utcfromtimestamp(int(date_value)).strftime("%d.%m.%Y %H:%M UTC")
        except Exception:
            date_text = str(date_value)

    peer_text = "—"
    if isinstance(source, dict):
        if source.get("user") and isinstance(source.get("user"), dict):
            user = source.get("user")
            username = user.get("username")
            full_name = " ".join(filter(None, [user.get("first_name"), user.get("last_name")])).strip()
            peer_text = f"@{username}" if username else (full_name or str(user.get("id", "—")))
        elif source.get("invoice_payload"):
            peer_text = source.get("invoice_payload")

    return (
        f"⭐ {amount if amount is not None else '—'}\n"
        f"🧾 {description}\n"
        f"👤 {peer_text}\n"
        f"🕒 {date_text}\n"
        f"🆔 <code>{transaction_id}</code>"
    )

async def stars_transactions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id if update.effective_user else None
    if not is_main_admin(user_id):
        return

    limit = 10
    if context.args:
        try:
            requested_limit = int(context.args[0])
            if requested_limit > 0:
                limit = min(requested_limit, 20)
        except ValueError:
            pass

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"https://api.telegram.org/bot{BOT_TOKEN}/getStarTransactions",
                params={"limit": limit},
            )
            response.raise_for_status()
            payload = response.json()

        if not payload.get("ok"):
            await update.message.reply_text("Ошибка получения Stars-транзакций от Telegram.")
            return

        result = payload.get("result") or {}
        transactions = result.get("transactions") or []

        if not transactions:
            await update.message.reply_text("Пока нет Stars-транзакций.")
            return

        lines = ["⭐ <b>Последние Stars-транзакции</b>"]
        for index, transaction in enumerate(transactions[:limit], start=1):
            lines.append(f"\n<b>{index}.</b> {_format_star_transaction(transaction)}")

        await update.message.reply_text("\n".join(lines), parse_mode="HTML")
    except Exception as e:
        print(f"Error getting Stars transactions: {e}")
        await update.message.reply_text("Не удалось получить Stars-транзакции.")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка команды /start с реферальным кодом"""
    user = update.effective_user
    
    # Проверяем, есть ли start параметр (реферальный код)
    referral_code = None
    if context.args and len(context.args) > 0:
        referral_code = context.args[0]
        
        if referral_code.startswith('REF') or referral_code.startswith('ref_'):
            welcome_text = (
                f"🎉 Добро пожаловать, {user.first_name}!\n\n"
                f"Вы перешли по реферальной ссылке.\n"
                f"Откройте приложение, чтобы завершить регистрацию и активировать бонусы."
            )
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
                f"{API_BASE_URL}/api/user/subscription-status?user_id={user_id}"
            )
            
            if response.status_code == 200:
                payload = response.json()
                data = payload.get('subscription_status', {})
                
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
                    f"Приглашённый получает 7 дней доступа, а вы — Premium на срок его первой оплаченной подписки."
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


async def handle_pre_checkout_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.pre_checkout_query
    if not query:
        return

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE_URL}/api/webhook/telegram",
                json={
                    "pre_checkout_query": {
                        "id": query.id,
                        "from": {"id": query.from_user.id},
                        "currency": query.currency,
                        "total_amount": query.total_amount,
                        "invoice_payload": query.invoice_payload,
                    }
                },
            )

        if response.status_code != 200:
            print(f"Pre-checkout backend returned non-200: {response.status_code}")
    except Exception as e:
        print(f"Error handling pre_checkout_query: {e}")


async def handle_successful_payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.effective_message
    if not message or not message.successful_payment:
        return

    payment = message.successful_payment

    try:
        payload = {
            "message": {
                "from": {"id": update.effective_user.id if update.effective_user else None},
                "chat": {"id": update.effective_chat.id if update.effective_chat else None},
                "successful_payment": {
                    "currency": payment.currency,
                    "total_amount": payment.total_amount,
                    "invoice_payload": payment.invoice_payload,
                    "telegram_payment_charge_id": payment.telegram_payment_charge_id,
                    "provider_payment_charge_id": payment.provider_payment_charge_id,
                },
            }
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(f"{API_BASE_URL}/api/webhook/telegram", json=payload)
            response.raise_for_status()

        await message.reply_text("⭐ Оплата прошла успешно! Premium активирован.")
    except Exception as e:
        print(f"Error handling successful payment: {e}")
        await message.reply_text("Оплата получена, но возникла ошибка при активации. Напишите в поддержку.")


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
    application.add_handler(CommandHandler("stars", stars_transactions))
    application.add_handler(PreCheckoutQueryHandler(handle_pre_checkout_query))
    application.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, handle_successful_payment))
    
    # Запускаем бота
    print("✅ Bot is running!")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

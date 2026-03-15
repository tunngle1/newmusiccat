---
description: Внедрение Telegram Stars как метода оплаты в текущий Mini App проект
---
# Цель

Добавить в проект оплату через Telegram Stars для покупки premium-подписки внутри Telegram Mini App.

Итоговый результат:
- пользователь может нажать кнопку покупки premium в Mini App;
- frontend запрашивает у backend инвойс на оплату в Telegram Stars;
- Telegram открывает оплату в звёздах;
- backend надёжно подтверждает успешную оплату через Telegram updates;
- после успешной оплаты пользователю активируется premium;
- frontend корректно показывает новый premium-статус.

# Важные ограничения

- Не использовать внешних платёжных провайдеров (`ЮKassa`, `Robokassa`, `Stripe` и т.д.) для этого флоу.
- Использовать Telegram Bot Payments с валютой `XTR`.
- Не выдавать premium только по клиентскому callback после открытия invoice.
- Источник истины для успешной оплаты — только Telegram update с `successful_payment`.
- Цены и список продуктов хранить на backend, а не только на frontend.
- Не хардкодить токены и секреты во frontend.

# Текущий контекст проекта

Проект — Telegram Mini App музыкального сервиса.
Технологии:
- frontend: React + TypeScript + Vite;
- backend: FastAPI;
- есть backend `.env`;
- есть логика user auth через Telegram;
- есть логика premium/подписок или связанные сущности, которые нужно переиспользовать, если они уже существуют.

Рабочая серверная копия проекта ранее использовалась из `/opt/tg-music/newmusiccat`, но реализацию нужно делать в текущем репозитории, без привязки к серверному пути в коде.

# Что нужно продать

Основной продукт для первой итерации:
- premium на 1 месяц за Telegram Stars.

Опционально предусмотреть архитектуру для расширения:
- premium на 3 месяца;
- premium на 12 месяцев;
- одноразовая поддержка проекта.

# Целевая архитектура

Нужно реализовать 4 части:

1. Backend products API
- endpoint получения списка доступных продуктов;
- backend определяет `product_id`, `title`, `description`, `amount`, `currency`, `duration_days`.

2. Backend invoice creation API
- endpoint создания invoice/link для конкретного продукта;
- backend валидирует пользователя;
- backend формирует уникальный `payload`;
- backend создаёт запись платежа со статусом `pending`;
- backend вызывает Telegram Bot API `createInvoiceLink` с валютой `XTR`;
- backend возвращает `invoice_link` на frontend.

3. Telegram payment updates handling
- обработка `pre_checkout_query`;
- обработка `successful_payment`;
- на `pre_checkout_query` нужно подтверждать валидные платежи;
- на `successful_payment` нужно подтверждать заказ и активировать premium.

4. Frontend purchase flow
- экран/кнопка покупки premium;
- загрузка списка продуктов;
- запрос `create-invoice`;
- открытие Telegram invoice;
- обновление UI после успешной оплаты;
- обработка отмены/ошибки.

# Требования к backend

## 1. Добавить модуль платежей

Рекомендуемая структура:
- `backend/payments/`
- `backend/payments/__init__.py`
- `backend/payments/models.py`
- `backend/payments/schemas.py`
- `backend/payments/service.py`
- `backend/payments/routes.py`
- при необходимости `backend/payments/telegram_stars.py`

Если в проекте уже есть близкая структура, встроить туда аккуратно и последовательно.

## 2. Продукты оплаты

Сделать backend-конфигурацию продуктов, например:
- `premium_1m`
- title: `Premium на 1 месяц`
- description: `Полный доступ к premium-функциям на 30 дней`
- currency: `XTR`
- amount: число звёзд
- duration_days: `30`

Важно:
- amount хранить на backend;
- frontend не должен быть источником цены;
- предусмотреть возможность легко добавлять новые продукты.

## 3. Таблица/модель платежей

Нужно либо использовать существующую БД/ORM-модель, либо добавить новую сущность платежей.
Минимальные поля:
- `id`
- `user_id`
- `product_id`
- `payload`
- `currency`
- `amount`
- `status` (`pending`, `paid`, `failed`, `cancelled`)
- `telegram_payment_charge_id`
- `provider_payment_charge_id` (если Telegram присылает)
- `created_at`
- `paid_at`
- `meta_json` или аналог для сырых данных

`payload` должен быть уникальным.

## 4. Endpoint списка продуктов

Добавить endpoint, например:
- `GET /api/payments/products`

Он должен возвращать безопасный список продуктов для frontend.

Пример ответа:
- `id`
- `title`
- `description`
- `amount`
- `currency`
- `durationDays`

## 5. Endpoint создания invoice

Добавить endpoint, например:
- `POST /api/payments/stars/create-invoice`

Требования:
- принимает `product_id`;
- определяет пользователя из текущей auth-сессии/telegram auth контекста;
- валидирует продукт;
- создаёт `payload`;
- создаёт pending payment record;
- вызывает Telegram Bot API `createInvoiceLink`;
- возвращает `invoice_link`, `payment_id`, `product_id`.

Важно использовать:
- `currency = XTR`
- корректные `prices`
- понятный `title`
- понятный `description`

## 6. Обработка `pre_checkout_query`

Нужно найти текущую точку обработки Telegram updates/webhook/polling.
Там добавить поддержку `pre_checkout_query`.

Логика:
- найти pending payment по `payload`;
- проверить, что продукт существует;
- проверить, что сумма и валюта ожидаемые;
- ответить Telegram `ok=true`, если всё валидно;
- если невалидно — ответить `ok=false` и понятное сообщение.

## 7. Обработка `successful_payment`

Нужно найти обработчик входящих Telegram update-ов и добавить туда обработку успешной оплаты.

Логика:
- получить `successful_payment`;
- извлечь `invoice_payload`;
- найти pending payment;
- убедиться, что он ещё не помечен как paid;
- сохранить `telegram_payment_charge_id` и детали платежа;
- обновить статус платежа на `paid`;
- активировать premium пользователю;
- продлить premium корректно, если он уже активен.

## 8. Логика выдачи premium

Нужно переиспользовать существующую premium-логику, если она уже есть.
Если её нет — добавить минимально безопасную.

Правила:
- если premium не активен, установить `expires_at = now + duration_days`;
- если premium уже активен и срок не истёк, продлить от текущего `expires_at`;
- если premium истёк, продлить от текущего момента.

## 9. Идемпотентность

Обязательно обеспечить идемпотентность:
- повторный `successful_payment` не должен активировать premium дважды;
- повторный webhook/update не должен дублировать продление;
- статус платежа должен защищать от повторной обработки.

## 10. Ошибки и логирование

Нужно добавить понятные логи:
- создание invoice;
- `pre_checkout_query` received;
- `successful_payment` received;
- payment activated;
- invalid payload;
- duplicate payment ignored.

Не логировать чувствительные токены.

# Требования к frontend

## 1. Экран или блок покупки premium

Добавить/обновить UI, где пользователь может:
- увидеть продукт premium;
- увидеть цену в звёздах;
- нажать кнопку покупки.

Если экран premium уже есть — встроить туда.

## 2. Получение списка продуктов

Frontend должен запрашивать:
- `GET /api/payments/products`

И рендерить доступные продукты.

## 3. Создание invoice

По нажатию на кнопку:
- вызвать `POST /api/payments/stars/create-invoice`;
- передать `product_id`;
- получить `invoice_link`.

## 4. Открытие Telegram invoice

Использовать Telegram Mini App API для открытия invoice.

Нужно проверить доступный объект WebApp в проекте. Предпочтительно использовать актуальный способ открытия invoice, доступный в текущем Telegram WebApp API.

Логика:
- если Telegram WebApp API доступен, открыть invoice внутри Telegram;
- если недоступен, показать понятную ошибку, что покупка доступна только внутри Telegram.

## 5. Поведение после результата оплаты

Frontend callback полезен только как UX-сигнал.
Нужно:
- показать `Оплата отменена`, если пользователь отменил;
- показать `Оплата успешна`, если клиентский callback вернул успех;
- после этого всё равно запросить актуальный профиль/статус premium с backend.

Frontend не должен сам считать пользователя premium без серверного подтверждения.

## 6. UX

Нужно обработать состояния:
- idle;
- loading products;
- creating invoice;
- payment opened;
- payment cancelled;
- payment success pending confirmation;
- payment confirmed.

# Telegram Bot API требования

## Использовать
- `createInvoiceLink`
- подтверждение `pre_checkout_query`
- обработку `successful_payment`

## Валюта
- `XTR`

## Важно
Не уходить в интеграцию с внешними провайдерами для первой итерации Stars.

# Что проверить в существующем коде до реализации

Перед внесением изменений разработчик должен найти и проверить:
- где хранится `BOT_TOKEN`;
- где реализована Telegram auth;
- где принимаются webhook/update-ы от Telegram или используется polling;
- где хранится пользовательская сущность;
- есть ли уже поля `is_premium`, `premium_until`, `subscription_expires_at` или аналогичные;
- есть ли уже endpoints профиля/статуса пользователя;
- как frontend узнаёт, что у пользователя premium.

# Переменные окружения

Нужно задокументировать и использовать в `.env`:
- `BOT_TOKEN`
- `WEBAPP_URL`
- `BACKEND_URL`
- `TELEGRAM_WEBHOOK_URL` (если используется webhook)
- `TELEGRAM_WEBHOOK_SECRET` (если используется)

Если какие-то переменные уже есть, не дублировать, а переиспользовать существующие.

# Безопасность

- Не доверять `product_id`, `amount`, `currency` с frontend без серверной проверки.
- Не активировать premium по одному только frontend callback.
- Проверять `payload` и пользователя.
- Все секреты хранить только на backend.
- Не выставлять `BOT_TOKEN` во frontend.

# Проверки после реализации

Разработчик должен вручную проверить:

1. `GET /api/payments/products` возвращает корректный список.
2. `POST /api/payments/stars/create-invoice` создаёт invoice link.
3. Mini App открывает Telegram invoice.
4. `pre_checkout_query` корректно подтверждается.
5. `successful_payment` приходит и корректно обрабатывается.
6. После оплаты premium активируется в БД.
7. После обновления профиля frontend видит premium.
8. Повторная обработка одного и того же update не дублирует premium.
9. Отмена оплаты не активирует premium.
10. Ошибки логируются понятно.

# Критерии готовности

Считать задачу завершённой только если:
- пользователь может купить premium за Telegram Stars внутри Mini App;
- оплата завершается без внешних провайдеров;
- backend получает и обрабатывает подтверждение Telegram;
- premium активируется надёжно и идемпотентно;
- frontend корректно показывает новый статус;
- все чувствительные данные остаются только на backend.

# Порядок выполнения для разработчика

1. Изучить текущую auth/user/premium логику.
2. Найти обработчик Telegram updates/webhook.
3. Добавить payment models/schemas/service/routes.
4. Реализовать `GET /api/payments/products`.
5. Реализовать `POST /api/payments/stars/create-invoice`.
6. Реализовать `pre_checkout_query` handling.
7. Реализовать `successful_payment` handling.
8. Связать оплату с premium-статусом пользователя.
9. Добавить frontend UI покупки.
10. Добавить обновление premium-статуса после оплаты.
11. Протестировать полный flow внутри Telegram.

# Важная заметка

Если в ходе реализации выяснится, что текущий код бота не принимает updates, сначала нужно определить, как именно бот работает сейчас:
- webhook;
- polling;
- сторонний обработчик;
- только Mini App без update handling.

Если update handling отсутствует, его нужно добавить до завершения payment flow, иначе Stars нельзя безопасно внедрить.

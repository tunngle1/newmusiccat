# План внедрения пробного периода на 1 неделю

## Цель

Добавить и стабилизировать пробный период длительностью **7 дней** для новых пользователей Telegram Mini App, сохранив совместимость с текущей системой Premium / Premium Pro / Telegram Stars.

## Текущее состояние проекта

### Backend

Ключевые места:

- `backend/database.py`
- `backend/main.py`
- `backend/payments.py`
- `backend/referral_endpoints.py`

У пользователя уже есть поля:

- `trial_started_at`
- `trial_expires_at`
- `premium_expires_at`
- `is_premium`
- `is_premium_pro`
- `is_blocked`

### Frontend

Ключевые места:

- `types.ts`
- `context/PlayerContext.tsx`
- `views/HomeView.tsx`
- `views/SubscriptionView.tsx`
- `components/SubscriptionBadge.tsx`

Тип `SubscriptionStatus` уже знает про:

- `reason: 'trial'`
- `trial_expires_at`
- `days_left`

### Что уже реализовано частично

В `backend/main.py` уже есть логика триала:

- в `has_access(user)` есть ветка `trial`
- в `auth_user(...)` новый пользователь получает `trial_started_at` и `trial_expires_at`
- в `GrantRequest` и admin-логике уже есть `trial_days`
- в UI уже есть `SubscriptionBadge`, который показывает пробный период

### Главная проблема текущей реализации

Сейчас новый пользователь получает **3 дня**, а не 7:

- `backend/main.py` -> `auth_user(...)`
- там используется `timedelta(days=3)`

Кроме того, trial логика реализована не как отдельная продуктовая сущность, а как набор условий, поэтому поведение нужно систематизировать.

---

# Целевое поведение

## Для нового пользователя

Новый пользователь при первом входе должен:

- автоматически получать **7 дней trial**
- иметь `subscription_status.reason = 'trial'`
- видеть остаток дней во frontend
- иметь доступ ко всем функциям, которые разрешены обычному Premium, если это соответствует бизнес-правилам

## После окончания trial

После истечения trial пользователь должен:

- терять доступ, если у него нет активного Premium / Premium Pro
- получать `subscription_status.reason = 'expired'`
- видеть экран/баннер с предложением оплатить Stars-подписку

## Если пользователь купил Premium во время trial

Система должна корректно определить приоритеты:

- `premium_pro` выше `premium`
- `premium` выше `trial`
- `trial` выше `expired`

Текущее дерево в `has_access(user)` уже соответствует этому порядку, но его надо протестировать.

---

# Что нужно изменить

## 1. Исправить длительность trial с 3 на 7 дней

### Файл

- `backend/main.py`

### Текущее место

Внутри `auth_user(...)`:

- новый пользователь получает `trial_expires = now + timedelta(days=3)`

### Что сделать

Заменить на:

- `timedelta(days=7)`

### Почему

Это единственная точка автоматической выдачи trial новым пользователям.

---

## 2. Зафиксировать product-правила trial в одном месте

### Файл

- `backend/main.py`

### Ключевая функция

- `has_access(user)`

### Что проверить и при необходимости скорректировать

Функция уже возвращает:

- `admin`
- `premium_pro`
- `premium`
- `trial`
- `expired`

Нужно проверить, что:

- `days_left` не уходит в `-1`
- при активном trial `has_access = true`
- при истёкшем trial и отсутствии premium -> `expired`
- при активном premium trial не влияет на UI приоритетом

### Желательное улучшение

Вместо `(trial_expires_at - now).days` лучше использовать безопасное округление вверх, чтобы пользователь в последний день видел корректный остаток, например через `ceil(...)` по суткам.

---

## 3. Привести frontend отображение статуса к реальному backend response

### Файлы

- `types.ts`
- `views/SubscriptionView.tsx`
- `components/SubscriptionBadge.tsx`
- `context/PlayerContext.tsx`

### Что проверить

#### `types.ts`
Тип уже поддерживает trial:

- `reason: 'trial'`
- `trial_expires_at?`
- `days_left?`

#### `SubscriptionBadge.tsx`
Сейчас показывает badge только если `reason === 'trial'`.

Нужно проверить:

- что badge не ломается, если `days_left` отсутствует
- что отображение корректно на 0/1/несколько дней
- что badge скрывается после покупки Premium

#### `views/SubscriptionView.tsx`
Сейчас view ориентирован в первую очередь на `premium_expires_at` и `has_access`, но почти не показывает детали trial.

### Нужно добавить

Если `reason === 'trial'`, страница подписки должна явно показывать:

- что у пользователя активен пробный период
- сколько дней осталось
- когда trial закончится
- CTA на покупку Premium до окончания trial

---

## 4. Определить продуктовые права на trial

### Сейчас

В `context/PlayerContext.tsx` helper:

- `canDownloadToApp()` возвращает `user?.subscription_status?.has_access || false`

Это означает, что trial уже автоматически даёт такой же доступ, как Premium.

### Нужно принять решение

#### Вариант A
Trial даёт всё, что даёт Premium.

Плюсы:

- просто
- уже почти работает текущим кодом

Минусы:

- триал может открыть слишком много дорогих функций

#### Вариант B
Trial ограничен

Например:

- прослушивание да
- скачивание в приложение нет
- скачивание в Telegram нет / да
- эксклюзивные функции нет

### Что нужно сделать, если выбирается ограниченный trial

Тогда необходимо отделить:

- `has_access`
- `canDownloadToApp`
- `canDownloadToChat`
- возможно дополнительные capability helpers в backend и frontend

На текущий момент код сильнее соответствует **Варианту A**.

---

## 5. Согласовать trial с оплатой Telegram Stars

### Файлы

- `views/SubscriptionView.tsx`
- `views/PaymentView.tsx`
- `backend/main.py`
- `backend/payments.py`
- `backend/referral_endpoints.py`

### Что проверить

После покупки Stars-плана:

- пользователь должен стать `is_premium = true`
- `premium_expires_at` должен быть выставлен
- UI должен перестать считать пользователя trial-only
- `subscription_status.reason` должен стать `premium`

### Риск

Логика продления Premium размазана минимум по двум местам:

- `backend/payments.py`
- `backend/referral_endpoints.py`

### Рекомендация

Выделить **одну authoritative функцию** для выдачи/продления Premium и использовать её везде, чтобы trial / premium / referral не расходились по правилам.

---

## 6. Проверить влияние рефералок на trial

### Файл

- `backend/referral_endpoints.py`
- `backend/main.py`

### Что проверить

Сейчас рефералка даёт Premium referrer-у после первой покупки приглашённого пользователя.

Нужно определить:

- должен ли реферал как новый пользователь всё равно получать 7-дневный trial
- можно ли комбинировать referral reward и trial
- влияет ли referral signup на `trial_started_at`

### Рекомендуемое поведение

- новый пользователь всегда получает 7-дневный trial
- referral reward не заменяет trial у приглашённого
- reward влияет только на referrer-а при выполнении условия оплаты

---

## 7. Админские инструменты для ручного контроля trial

### Файл

- `backend/main.py`
- `views/AdminView.tsx`

### Что уже есть

В admin endpoint уже есть:

- `trial_days`
- `premium_days`

### Что нужно проверить

- есть ли UI в `AdminView.tsx` для задания `trial_days`
- может ли админ визуально понять, у кого trial активен / истёк
- есть ли отображение `trial_expires_at`

### Рекомендация

Добавить в админку:

- колонку `subscription_status.reason`
- `trial_expires_at`
- быстрые действия:
  - выдать 7 дней trial
  - сбросить trial
  - выдать 30 дней premium

---

## 8. Согласовать тексты и UX

### Что нужно обновить

#### Home badge
Текст должен быть продуктово понятен:

- `Пробный период: 7 дней`
- `Остался 1 день`
- `Заканчивается сегодня`

#### Subscription view
Добавить copy:

- `У вас активен пробный период`
- `После его окончания потребуется подписка`

#### Paywall copy
Если trial истёк:

- отдельный текст для expired users
- преимущества Premium
- CTA на Stars purchase

---

# План внедрения по этапам

## Этап 1. Минимально рабочее изменение

### Изменения

- поменять 3 дня на 7 дней
- проверить `has_access(user)`
- убедиться, что новый пользователь получает `reason = 'trial'`
- убедиться, что badge показывает остаток дней

### Критерии готовности

- новый пользователь получает 7 дней trial
- `/api/user/subscription-status` возвращает trial
- frontend показывает badge trial

---

## Этап 2. Полировка UI trial

### Изменения

- доработать `SubscriptionView.tsx`
- показывать trial expiry и days left
- улучшить тексты

### Критерии готовности

- на странице подписки понятен статус trial
- пользователь понимает, что trial временный

---

## Этап 3. Тестирование жизненного цикла

### Кейсы

- новый пользователь -> trial 7 дней
- старый без trial -> expired
- trial активен -> доступ есть
- trial истёк -> доступа нет
- trial + покупка premium -> premium активен
- premium истёк, trial истёк -> expired
- admin user -> admin access
- premium_pro -> premium_pro access

---

## Этап 4. Рефакторинг правил подписки

### Изменения

- централизовать выдачу Premium
- убрать дублирование между `payments.py` и `referral_endpoints.py`
- формализовать capability helpers

### Критерии готовности

- все правила подписки определены в одном месте
- меньше риска регрессий

---

# Точки кода, которые нужно ревьюить в первую очередь

## Backend

- `backend/main.py`
  - `has_access(user)`
  - `auth_user(...)`
  - `/api/user/subscription-status`
  - admin grant endpoint

- `backend/database.py`
  - модель `User`

- `backend/payments.py`
  - продление premium после Stars

- `backend/referral_endpoints.py`
  - `extend_premium(...)`
  - reward-логика

## Frontend

- `types.ts`
- `context/PlayerContext.tsx`
- `components/SubscriptionBadge.tsx`
- `views/SubscriptionView.tsx`
- `views/PaymentView.tsx`
- `views/AdminView.tsx`

---

# Риски

## 1. Разъезд business rules

Логика trial / premium / referral уже распределена по нескольким файлам. Без централизации есть риск, что:

- один endpoint считает trial активным
- другой UI показывает expired
- третья часть продлевает premium не по тем правилам

## 2. Неверный `days_left`

Использование `.days` у `timedelta` может визуально занижать остаток.

## 3. Trial = full premium by accident

Сейчас `has_access` фактически открывает trial так же, как premium для части фронтовых helper-функций.

## 4. Отсутствие тестов

Сейчас нет видимых unit/integration tests для подписочной матрицы.

---

# Рекомендуемые тесты

## Backend

Добавить тесты на:

- `has_access(user)`
- создание нового пользователя в `auth_user`
- истечение trial
- продление premium
- приоритет premium над trial

## Frontend

Проверить руками:

- новый пользователь видит trial badge
- subscription page показывает trial
- после оплаты статус обновляется
- expired user видит paywall

---

# Минимальный actionable backlog

## Must have

- изменить trial с 3 на 7 дней
- показать trial в `SubscriptionView.tsx`
- протестировать `subscription_status`
- убедиться, что Vercel frontend получает актуальный статус

## Should have

- централизовать premium grant logic
- улучшить `days_left`
- добавить админский контроль trial в UI

## Nice to have

- отдельная аналитика trial conversion
- защита от повторной выдачи trial при edge cases
- onboarding copy для trial

---

# Короткий вывод

Проект уже содержит **большую часть инфраструктуры trial**, но в полусобранном состоянии:

- trial поля есть
- trial reason есть
- badge есть
- endpoint статуса есть
- admin hooks есть

Для полноценного запуска 7-дневного пробного периода нужно не создавать механизм с нуля, а:

- исправить срок
- доработать отображение
- протестировать матрицу состояний
- централизовать логику выдачи premium/trial

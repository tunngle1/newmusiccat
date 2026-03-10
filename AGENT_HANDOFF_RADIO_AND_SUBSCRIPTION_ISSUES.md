# Handoff для другого ИИ агента

## Контекст

Проект — Telegram Mini App с backend на FastAPI и frontend на React/Vite.

Текущая инфраструктура:

- backend уже вынесен на VPS / домен
- frontend живёт на Vercel
- подписки идут через Telegram Stars
- trial логика уже частично существует

Этот документ нужен для другого агента, который будет вносить изменения по двум направлениям:

- внедрение/доведение подписочного trial
- исправление бага на главной после радио `Последняя волна`

---

# Часть 1. Баг: после прослушивания радио "Последняя волна" на главной появляется окно поиска

## Симптом

После прослушивания радио станции `Последняя волна` и возврата на главную страницу UI показывает состояние, похожее на поиск / поисковый блок вместо ожидаемого состояния главной.

## Наиболее вероятная причина

### Подозрительная архитектура

`searchState` хранится глобально в `context/PlayerContext.tsx`, а `HomeView.tsx` напрямую рендерит UI на основе этого глобального состояния.

Ключевые места:

- `context/PlayerContext.tsx`
- `views/HomeView.tsx`
- `views/RadioView.tsx`

### Важные наблюдения

#### `PlayerContext.tsx`
Имеет глобальный `searchState`:

- `query`
- `results`
- `isSearching`
- `error`
- `page`
- `hasMore`
- `searchMode`
- `genreId`

Есть helper:

- `resetSearch()`

#### `HomeView.tsx`
Рендер завязан на условиях:

- если есть `searchState.query`, показываются search filters
- если нет query и нет results, показываются genres
- `rawDisplayTracks` вычисляется из `searchState.results` и `searchState.query`

Это означает, что если после радио где-то остаётся:

- `query`
- `results`
- `genreId`
- `error`

то HomeView может визуально вести себя как экран поиска.

#### `RadioView.tsx`
Использует:

- `playRadio(station)`
- `currentRadio`
- `isRadioMode`

Но по найденным точкам нет явного сброса `searchState` при переходе в радио или выходе из радио.

## Гипотеза причины

### Гипотеза A
`searchState` загрязняется ранее и не сбрасывается при возврате на HomeView.

### Гипотеза B
`genreId` или `results` остаются после переходов между вкладками, и HomeView интерпретирует это как активный контекст поиска.

### Гипотеза C
Воспроизведение радио меняет глобальный queue/current state, а HomeView завязан на `displayTracks` и вычисляет не то представление.

## Что должен сделать агент

### Шаг 1. Найти все переходы на главную

Найти, где вызывается:

- `onNavigate(ViewState.HOME)`
- любые возвраты из radio/player/search view

Проверить, должен ли при этих переходах вызываться `resetSearch()`.

### Шаг 2. Найти все места записи в `searchState`

Искать:

- `setSearchState(`
- `resetSearch(`

Убедиться, не сохраняются ли:

- `query`
- `results`
- `genreId`
- `error`

после сценария с радио.

### Шаг 3. Проверить `HomeView.tsx`

Особенно:

- `rawDisplayTracks`
- блок `searchState.query.trim()`
- блок жанров `!searchState.query.trim() && searchState.results.length === 0 && !searchState.isSearching`

Нужно выяснить, почему UI, который пользователь называет `окном поиска`, появляется после возврата.

### Шаг 4. Воспроизвести баг пошагово

Предлагаемый сценарий ручного теста:

1. Открыть главную
2. Не вводить поиск
3. Перейти в радио
4. Включить `Последняя волна`
5. Вернуться на главную
6. Зафиксировать значения:
   - `searchState.query`
   - `searchState.results.length`
   - `searchState.genreId`
   - `isRadioMode`
   - `currentRadio`

### Шаг 5. Вероятное исправление

Наиболее вероятное исправление:

- сбрасывать `searchState` при переходе на `HomeView`, если пользователь возвращается из режима радио и не находится в явном поисковом сценарии

Но это нужно делать аккуратно, чтобы не ломать сценарий, когда пользователь **осознанно возвращается к своим поисковым результатам**.

## Предпочтительный вариант исправления

### Вариант 1
Добавить в HomeView/useEffect условный reset:

- если `isRadioMode` было активно
- если `searchState.query` пустой, но есть мусорное состояние
- если `genreId`/`results` остались от предыдущей сессии

### Вариант 2
Сбрасывать `searchState` при переходе из `RadioView` на Home через конкретный navigation handler

Это лучше, если баг воспроизводится только через маршрут radio -> home.

### Вариант 3
Разделить UI-состояние поиска и музыкального каталога

Это более чистое архитектурно решение, но более дорогое по изменениям.

---

# Часть 2. Trial / подписка / доступ

## Что уже есть

### Backend

#### `backend/database.py`
Поля пользователя:

- `trial_started_at`
- `trial_expires_at`
- `premium_expires_at`
- `is_premium`
- `is_premium_pro`
- `is_blocked`

#### `backend/main.py`
Есть:

- `has_access(user)`
- `/api/user/auth`
- `/api/user/subscription-status`
- admin grant logic с `trial_days`

#### Важная деталь

Новый пользователь сейчас получает **3 дня trial**, не 7:

- `auth_user(...)`
- `trial_expires = now + timedelta(days=3)`

#### `backend/payments.py`
Есть логика выдачи Premium после Telegram Stars.

#### `backend/referral_endpoints.py`
Есть отдельная логика `extend_premium(...)`, что создаёт дублирование business rules.

### Frontend

#### `types.ts`
`SubscriptionStatus` уже поддерживает:

- `reason: 'trial'`
- `trial_expires_at`
- `days_left`

#### `components/SubscriptionBadge.tsx`
Уже умеет показывать trial badge.

#### `views/SubscriptionView.tsx`
Недостаточно явно показывает trial-статус, в основном ориентирован на premium.

## Что нужно сделать агенту

### Шаг 1. Исправить срок trial

В `backend/main.py`:

- заменить `timedelta(days=3)` на `timedelta(days=7)`

### Шаг 2. Проверить `has_access(user)`

Убедиться, что порядок приоритетов:

- admin
- premium_pro
- premium
- trial
- expired

### Шаг 3. Улучшить расчёт `days_left`

Текущее выражение через `.days` может давать неприятные пограничные значения.

Нужно сделать более user-friendly расчёт оставшихся дней.

### Шаг 4. Улучшить `SubscriptionView.tsx`

Добавить явную ветку UI для `reason === 'trial'`:

- активен пробный период
- сколько осталось
- когда закончится
- CTA на Stars purchase

### Шаг 5. Проверить capability helpers

В `context/PlayerContext.tsx`:

- `canDownloadToApp()` сейчас опирается на `subscription_status.has_access`

Это означает, что trial, вероятно, уже открывает те же возможности, что Premium.

Нужно подтвердить product decision:

- это желаемое поведение
- или нужны отдельные ограничения для trial

### Шаг 6. Свести Premium grant logic в одно место

Сейчас premium выдаётся/продлевается минимум в:

- `backend/payments.py`
- `backend/referral_endpoints.py`

Нужно по возможности централизовать это.

---

# Часть 3. Конкретный список файлов для ревью и правок

## Критично проверить

- `backend/main.py`
- `backend/database.py`
- `backend/payments.py`
- `backend/referral_endpoints.py`
- `context/PlayerContext.tsx`
- `views/HomeView.tsx`
- `views/RadioView.tsx`
- `views/SubscriptionView.tsx`
- `components/SubscriptionBadge.tsx`
- `types.ts`

---

# Часть 4. Предлагаемый порядок работы агента

## Этап A. Диагностика бага с главной/радио

1. Воспроизвести баг
2. Логировать `searchState` и route transitions
3. Найти место, где состояние поиска остаётся после радио
4. Исправить переход или reset state
5. Проверить, что обычный поиск не сломался

## Этап B. Trial 7 дней

1. Исправить срок 3 -> 7
2. Проверить `subscription-status`
3. Улучшить UI подписки
4. Проверить edge cases

## Этап C. Рефакторинг подписочных правил

1. Централизовать premium extension
2. Проверить referral reward flow
3. Проверить admin grant flow

---

# Часть 5. Acceptance criteria

## Для radio/home бага

- после прослушивания `Последняя волна` возврат на главную не показывает ошибочное поисковое состояние
- поиск продолжает работать как раньше
- жанры и дефолтная главная отображаются корректно

## Для trial

- новый пользователь получает 7 дней
- UI показывает trial корректно
- после покупки Premium trial не конфликтует с premium
- после окончания trial доступ истекает корректно

---

# Короткий вывод для следующего агента

Проект уже содержит почти всю основу для подписок и trial, но она не доведена до консистентного продуктового состояния.

Самый быстрый practical path:

1. починить баг `radio -> home/search state`
2. изменить auto-trial с 3 на 7 дней
3. улучшить `SubscriptionView.tsx` под trial
4. централизовать premium grant logic

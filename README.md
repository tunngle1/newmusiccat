# TG Music Player — Telegram Mini App

Музыкальный плеер внутри Telegram Mini App: поиск треков, радио, плейлисты, избранное, скачивание в приложение и в чат Telegram, подписки, рефералка.

## Стек

### Frontend
- **React** + **TypeScript** + **Vite**
- **TailwindCSS** — стили
- **IndexedDB** (через `idb`) — локальное хранилище треков/плейлистов/избранного
- **@tonconnect/ui-react** — TON-интеграция
- **PWA** (через `vite-plugin-pwa`)

### Backend
- **Python** + **FastAPI** + **Uvicorn**
- **httpx** + **BeautifulSoup** — парсинг треков (Hitmo)
- **SQLAlchemy** + **PostgreSQL** — пользователи, подписки, рефералы
- **lyricsgenius** — тексты песен
- **yt-dlp** — YouTube-загрузчик (планируется)

### Деплой
- Frontend → **Vercel**
- Backend + Bot → **Timeweb VPS**
- Домен backend: `https://zvukly.ru`

## Быстрый старт (локально)

### Требования
- Node.js 18+
- Python 3.10+
- PostgreSQL (опционально, для полного backend)

### Frontend

```bash
npm install
```

Создайте `.env.local` в корне проекта:

```env
VITE_API_URL=http://localhost:8000
```

Запуск:

```bash
npm run dev
```

Frontend будет доступен на `http://localhost:5173`.

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
```

Создайте `backend/.env` (см. `backend/.env.example`):

```env
BOT_TOKEN=...
WEBAPP_URL=http://localhost:5173
API_BASE_URL=http://localhost:8000
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
GENIUS_API_TOKEN=...
```

Запуск:

```bash
python main.py
```

Backend будет доступен на `http://localhost:8000`. Документация API: `http://localhost:8000/docs`.

## Структура проекта

```
├── App.tsx                  # Главный UI-компонент (роутинг, player, modals)
├── context/
│   └── PlayerContext.tsx     # Глобальное состояние плеера, поиска, пользователя
├── views/
│   ├── HomeTabView.tsx       # Главный экран (поиск, история, жанры)
│   ├── RadioTabView.tsx      # Экран радио
│   ├── PlaylistsTabView.tsx  # Экран плейлистов
│   ├── LibraryTabView.tsx    # Экран библиотеки / скачанного
│   ├── AdminView.tsx         # Админка
│   └── SubscriptionView.tsx  # Подписки
├── components/               # UI-компоненты, иконки, визуализатор
├── utils/
│   ├── api.ts               # API-клиент
│   ├── storage.ts           # IndexedDB wrapper
│   ├── deduplication.ts     # Дедупликация треков
│   ├── lyricsClient.ts      # Клиент текстов
│   └── telegram.ts          # Telegram WebApp helpers
├── types.ts                  # Типы и интерфейсы
├── constants.ts              # Константы
├── backend/
│   ├── main.py              # FastAPI — все эндпоинты
│   ├── hitmo_parser_light.py # Парсер треков
│   ├── database.py          # SQLAlchemy модели / сессия
│   ├── lyrics_service.py    # Сервис текстов
│   ├── payments.py          # Платежи
│   ├── referral_endpoints.py # Рефералка
│   ├── bot.py               # Telegram bot
│   └── requirements.txt     # Python зависимости
└── vite.config.ts            # Vite конфиг (PWA, proxy)
```

## Деплой

Подробнее — см. `DEPLOY_RULES.md`.

- **Frontend**: push в GitHub → Vercel auto-deploy
- **Backend**: SSH на VPS → `git pull` → `systemctl restart tg-music-backend`
- **Bot**: `systemctl restart tg-music-bot`

## Важные файлы

- `DEPLOY_RULES.md` — полные инструкции по деплою
- `FULL_PROJECT_CHECKUP.md` — аудит проекта с рекомендациями
- `backend/.env.example` — шаблон env-переменных

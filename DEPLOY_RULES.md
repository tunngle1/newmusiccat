# Правила деплоя проекта

Этот файл описывает рабочий deployment flow для текущего проекта:

- frontend -> Vercel
- backend -> Timeweb VPS
- bot -> Timeweb VPS
- репозиторий -> GitHub

Текущие рабочие адреса:

- Backend API: `https://zvukly.ru`
- Frontend Vercel: использовать актуальный URL деплоя
- Путь проекта на сервере: `/opt/tg-music/newmusiccat`
- Backend путь на сервере: `/opt/tg-music/newmusiccat/backend`
- Backend service: `tg-music-backend`
- Bot service: `tg-music-bot`

---

# 1. Команды для пуша обновлений на GitHub

## Перейти в папку проекта

```powershell
Set-Location "c:\Users\Владислав\Desktop\Проекы\TG miniapp\tg-music-player — копия — копия"
```

## Проверить статус

```powershell
git status
```

## Добавить изменения

```powershell
git add .
```

## Сделать коммит

```powershell
git commit -m "Update project"
```

## Отправить в GitHub

```powershell
git push origin main
```

## Полный короткий блок

```powershell
Set-Location "c:\Users\Владислав\Desktop\Проекы\TG miniapp\tg-music-player — копия — копия"
git status
git add .
git commit -m "Update project"
git push origin main
```

## Важно перед пушем

Не пушить в git:

- `backend/.env`
- `.env`
- токены
- секретные ключи
- временные локальные файлы

---

# 2. Команды для редеплоя backend через SSH на Timeweb

## Подключиться к серверу

```powershell
ssh root@5.42.105.6
```

## Перейти в проект и подтянуть обновления

```bash
cd /opt/tg-music/newmusiccat
git pull origin main
```

## Перейти в backend и обновить зависимости

```bash
cd /opt/tg-music/newmusiccat/backend
source venv/bin/activate
pip install -r requirements.txt
```

## Перезапустить backend и bot

```bash
systemctl restart tg-music-backend
systemctl restart tg-music-bot
```

## Проверить статусы

```bash
systemctl status tg-music-backend --no-pager
systemctl status tg-music-bot --no-pager
```

## Проверить логи, если что-то упало

### Backend logs

```bash
journalctl -u tg-music-backend -n 100 --no-pager -o cat
```

### Bot logs

```bash
journalctl -u tg-music-bot -n 100 --no-pager -o cat
```

## Проверка API после деплоя

Открыть в браузере:

```text
https://zvukly.ru/docs
```

## Полный короткий backend redeploy-блок

```bash
cd /opt/tg-music/newmusiccat
git pull origin main
cd /opt/tg-music/newmusiccat/backend
source venv/bin/activate
pip install -r requirements.txt
systemctl restart tg-music-backend
systemctl restart tg-music-bot
systemctl status tg-music-backend --no-pager
systemctl status tg-music-bot --no-pager
```

## Если менялся только код backend без новых библиотек

Можно использовать короткий сценарий:

```bash
cd /opt/tg-music/newmusiccat
git pull origin main
systemctl restart tg-music-backend
systemctl restart tg-music-bot
```

---

# 3. Команды и шаги, чтобы добавить новую ссылку с Vercel на backend

Под новой ссылкой Vercel имеется в виду новый frontend URL, например:

```text
https://newmusiccat-git-main-vlads-projects-c73cd9df.vercel.app
```

Нужно обновить:

- `WEBAPP_URL` в backend `.env`
- при необходимости `VITE_API_URL` в Vercel env
- перезапустить backend и bot
- обновить Mini App URL в BotFather

---

## 3.1. Обновить `WEBAPP_URL` на backend сервере

Подключиться к серверу:

```powershell
ssh root@5.42.105.6
```

Открыть `.env`:

```bash
nano /opt/tg-music/newmusiccat/backend/.env
```

Найти строку:

```env
WEBAPP_URL=...
```

Заменить на новую ссылку Vercel:

```env
WEBAPP_URL=https://newmusiccat-git-main-vlads-projects-c73cd9df.vercel.app
```

Проверить, что backend URL тоже правильный:

```env
API_BASE_URL=https://zvukly.ru
```

Сохранить файл:

- `Ctrl + O`
- `Enter`
- `Ctrl + X`

Перезапустить сервисы:

```bash
systemctl restart tg-music-backend
systemctl restart tg-music-bot
```

Проверить статусы:

```bash
systemctl status tg-music-backend --no-pager
systemctl status tg-music-bot --no-pager
```

---

## 3.2. Проверить env-переменную на Vercel

На Vercel в проекте должна быть env-переменная:

```env
VITE_API_URL=https://zvukly.ru
```

Если backend домен не менялся, её менять не нужно.

Если backend URL когда-нибудь поменяется, надо будет обновить именно её.

### Правильное значение

```env
VITE_API_URL=https://zvukly.ru
```

### После изменения env на Vercel

Обязательно сделать:

- `Redeploy`

или:

- `Redeploy with existing Build Cache`
- либо полный redeploy, если нужно

---

## 3.3. Обновить Mini App URL в BotFather

Если Vercel URL изменился, нужно поставить новый URL в Telegram BotFather.

В качестве Mini App URL использовать:

```text
https://newmusiccat-git-main-vlads-projects-c73cd9df.vercel.app
```

---

## 3.4. Финальная проверка после смены Vercel URL

### Проверить frontend

Открыть:

```text
https://newmusiccat-git-main-vlads-projects-c73cd9df.vercel.app
```

### Проверить backend

Открыть:

```text
https://zvukly.ru/docs
```

### Проверить Telegram bot

- отправить `/start`
- открыть кнопку Mini App
- проверить, что запросы идут в backend

---

# Быстрые готовые сценарии

## Сценарий A: обычный push в GitHub

```powershell
Set-Location "c:\Users\Владислав\Desktop\Проекы\TG miniapp\tg-music-player — копия — копия"
git add .
git commit -m "Update project"
git push origin main
```

## Сценарий B: redeploy backend на сервере

```bash
cd /opt/tg-music/newmusiccat
git pull origin main
cd /opt/tg-music/newmusiccat/backend
source venv/bin/activate
pip install -r requirements.txt
systemctl restart tg-music-backend
systemctl restart tg-music-bot
```

## Сценарий C: смена Vercel ссылки на backend

```bash
nano /opt/tg-music/newmusiccat/backend/.env
```

Потом обновить:

```env
WEBAPP_URL=https://NEW_VERCEL_URL
API_BASE_URL=https://zvukly.ru
```

И перезапустить:

```bash
systemctl restart tg-music-backend
systemctl restart tg-music-bot
```

---

# Обязательные проверки после любого деплоя

## Backend

```text
https://zvukly.ru/docs
```

## Systemd

```bash
systemctl status tg-music-backend --no-pager
systemctl status tg-music-bot --no-pager
```

## Логи при ошибке

```bash
journalctl -u tg-music-backend -n 100 --no-pager -o cat
journalctl -u tg-music-bot -n 100 --no-pager -o cat
```

---

# Важные правила

- backend деплоится на **Timeweb через SSH**
- frontend деплоится на **Vercel через GitHub / redeploy**
- `VITE_API_URL` на Vercel должен указывать на backend:

```env
VITE_API_URL=https://zvukly.ru
```

- `WEBAPP_URL` в backend `.env` должен указывать на актуальный frontend URL
- после изменения backend `.env` всегда перезапускать оба сервиса
- после изменения Vercel env всегда делать redeploy

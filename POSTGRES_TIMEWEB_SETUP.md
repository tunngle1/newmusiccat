# Переход с SQLite на PostgreSQL на Timeweb

Этот файл описывает переход проекта на PostgreSQL **без миграции старых данных**.

Старую SQLite базу можно удалить после проверки, что backend успешно запускается на PostgreSQL.

---

# Что уже изменено в коде

В проекте backend уже подготовлен к работе через переменную окружения:

```env
DATABASE_URL=...
```

Если `DATABASE_URL` не задан, backend по-прежнему попытается использовать SQLite:

```env
sqlite:///./users.db
```

Также в `backend/requirements.txt` добавлен PostgreSQL-драйвер:

```text
psycopg2-binary==2.9.9
```

---

# Цель

Нужно:

- установить PostgreSQL на Timeweb VPS
- создать БД и пользователя
- прописать `DATABASE_URL` в `backend/.env`
- обновить зависимости backend
- перезапустить backend
- проверить, что таблицы создались автоматически
- затем удалить старую SQLite базу

---

# 1. Установка PostgreSQL на Timeweb

Подключиться к серверу:

```powershell
ssh root@5.42.105.6
```

Обновить пакеты:

```bash
apt update
```

Установить PostgreSQL:

```bash
apt install postgresql postgresql-contrib -y
```

Проверить статус:

```bash
systemctl status postgresql --no-pager
```

Должно быть:

```text
Active: active (running)
```

---

# 2. Создание пользователя и базы

Перейти в postgres shell:

```bash
sudo -u postgres psql
```

Внутри выполнить:

```sql
CREATE DATABASE newmusiccat;
CREATE USER newmusiccat_user WITH PASSWORD 'CHANGE_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE newmusiccat TO newmusiccat_user;
\q
```

---

# 3. Выдать права на schema public

Иногда для SQLAlchemy этого не хватает. Выполни:

```bash
sudo -u postgres psql -d newmusiccat
```

Внутри:

```sql
GRANT ALL ON SCHEMA public TO newmusiccat_user;
ALTER SCHEMA public OWNER TO newmusiccat_user;
\q
```

---

# 4. Прописать DATABASE_URL в backend `.env`

Открыть файл:

```bash
nano /opt/tg-music/newmusiccat/backend/.env
```

Добавить строку:

```env
DATABASE_URL=postgresql://newmusiccat_user:CHANGE_STRONG_PASSWORD_HERE@127.0.0.1:5432/newmusiccat
```

Важно:

- пароль должен совпадать с тем, что ты задал в PostgreSQL
- если в пароле будут спецсимволы, лучше использовать URL-safe пароль

---

# 5. Обновить backend после изменения кода

```bash
cd /opt/tg-music/newmusiccat
git pull origin main
cd /opt/tg-music/newmusiccat/backend
source venv/bin/activate
pip install -r requirements.txt
```

---

# 6. Перезапустить backend и bot

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

# 7. Проверить, что таблицы создались в PostgreSQL

Зайти в БД:

```bash
psql -h 127.0.0.1 -U newmusiccat_user -d newmusiccat
```

Если попросит пароль — введи пароль пользователя БД.

Внутри проверить таблицы:

```sql
\dt
```

Ты должен увидеть примерно такие таблицы:

- `users`
- `downloaded_messages`
- `lyrics`
- `payments`
- `referrals`
- `promo_codes`

Посмотреть пользователей:

```sql
SELECT * FROM users;
```

Выйти:

```sql
\q
```

---

# 8. Проверить backend снаружи

Открыть:

```text
https://zvukly.ru/docs
```

Потом проверить:

- `/start` в Telegram
- открытие Mini App
- регистрацию нового пользователя

Так как миграция старых данных не нужна, новые таблицы будут созданы пустыми, кроме default admin, который создаётся в `init_db()`.

---

# 9. Удалить старую SQLite базу

Только после успешной проверки PostgreSQL.

Сначала проверь наличие старого файла:

```bash
ls -lah /opt/tg-music/newmusiccat/backend/users.db
```

Если всё работает на Postgres, удалить:

```bash
rm -f /opt/tg-music/newmusiccat/backend/users.db
```

Если хочешь перестраховаться, сначала сделать backup:

```bash
mv /opt/tg-music/newmusiccat/backend/users.db /opt/tg-music/newmusiccat/backend/users.db.backup
```

---

# 10. Как подключаться к PostgreSQL и смотреть таблицы

## Через консоль на сервере

```bash
psql -h 127.0.0.1 -U newmusiccat_user -d newmusiccat
```

Полезные команды:

```sql
\dt
\d users
SELECT * FROM users LIMIT 20;
```

## Через DBeaver / DataGrip / TablePlus

Параметры подключения:

- Host: `5.42.105.6`
- Port: `5432`
- Database: `newmusiccat`
- User: `newmusiccat_user`
- Password: твой пароль

### Важно

По умолчанию внешний доступ к PostgreSQL лучше **не открывать** наружу.

Лучше использовать:

- SSH Tunnel через DBeaver
- либо подключаться только изнутри сервера

### Безопасный вариант через SSH Tunnel

В DBeaver:

- SSH Host: `5.42.105.6`
- SSH User: `root`
- DB Host: `127.0.0.1`
- DB Port: `5432`

Так безопаснее, чем открывать PostgreSQL порт миру.

---

# 11. Быстрый сценарий целиком

## На сервере

```bash
apt update
apt install postgresql postgresql-contrib -y
sudo -u postgres psql
```

Внутри `psql`:

```sql
CREATE DATABASE newmusiccat;
CREATE USER newmusiccat_user WITH PASSWORD 'CHANGE_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE newmusiccat TO newmusiccat_user;
\q
```

Потом:

```bash
sudo -u postgres psql -d newmusiccat
```

Внутри:

```sql
GRANT ALL ON SCHEMA public TO newmusiccat_user;
ALTER SCHEMA public OWNER TO newmusiccat_user;
\q
```

Дальше:

```bash
nano /opt/tg-music/newmusiccat/backend/.env
```

Добавить:

```env
DATABASE_URL=postgresql://newmusiccat_user:CHANGE_STRONG_PASSWORD_HERE@127.0.0.1:5432/newmusiccat
```

Потом:

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

Проверка:

```bash
psql -h 127.0.0.1 -U newmusiccat_user -d newmusiccat
```

Внутри:

```sql
\dt
SELECT * FROM users;
\q
```

Если всё работает, можно удалить SQLite:

```bash
rm -f /opt/tg-music/newmusiccat/backend/users.db
```

---

# 12. Важные замечания

- после смены БД старые данные SQLite не перенесутся
- создастся новая пустая PostgreSQL БД
- первый запуск backend создаст таблицы автоматически
- default admin из `init_db()` будет создан снова
- перед коммитом не добавляй `.env` в git

---

# 13. Что делать, если backend не стартует

Смотреть логи:

```bash
journalctl -u tg-music-backend -n 100 --no-pager -o cat
```

Частые причины:

- неправильный `DATABASE_URL`
- неверный пароль пользователя Postgres
- нет прав на schema `public`
- не установлен `psycopg2-binary`

---

# 14. Рекомендация по безопасности

После настройки PostgreSQL и backend обязательно перевыпусти засвеченные секреты:

- `BOT_TOKEN`
- `GENIUS_API_TOKEN`

И не храни их в публичном репозитории.

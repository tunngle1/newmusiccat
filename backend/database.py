from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./users.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True) # Telegram ID
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)
    is_premium = Column(Boolean, default=False)
    is_blocked = Column(Boolean, default=False)  # New field for access control
    joined_at = Column(DateTime, default=datetime.utcnow)

class DownloadedMessage(Base):
    __tablename__ = "downloaded_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, index=True)  # Telegram user ID
    chat_id = Column(Integer)  # Usually same as user_id for private chats
    message_id = Column(Integer)  # Telegram message ID
    track_id = Column(String)  # Track identifier
    created_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)
    
    # Ensure default admin exists
    db = SessionLocal()
    admin_id = 414153884
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        admin = User(id=admin_id, username="admin", is_admin=True, is_premium=True)
        db.add(admin)
        db.commit()
    else:
        if not admin.is_admin:
            admin.is_admin = True
            db.commit()
    db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

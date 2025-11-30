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
    is_premium_pro = Column(Boolean, default=False)  # Эксклюзивный уровень
    is_blocked = Column(Boolean, default=False)  # New field for access control
    download_count = Column(Integer, default=0)  # Track download activity
    joined_at = Column(DateTime, default=datetime.utcnow)
    
    # Trial period fields
    trial_started_at = Column(DateTime, nullable=True)
    trial_expires_at = Column(DateTime, nullable=True)
    
    # Premium expiration (for subscription stacking)
    premium_expires_at = Column(DateTime, nullable=True)
    
    # Referral system
    referral_code = Column(String, unique=True, index=True, nullable=True)
    referred_by = Column(Integer, nullable=True)  # ID of referrer

class DownloadedMessage(Base):
    __tablename__ = "downloaded_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, index=True)
    chat_id = Column(Integer)  # Usually same as user_id for private chats
    message_id = Column(Integer)  # Telegram message ID
    track_id = Column(String)  # Track identifier
    created_at = Column(DateTime, default=datetime.utcnow)

class Lyrics(Base):
    __tablename__ = "lyrics"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    track_id = Column(String, unique=True, index=True)  # Unique track identifier
    title = Column(String)
    artist = Column(String)
    lyrics_text = Column(String)  # Full lyrics text
    source = Column(String, default="genius")  # Source: genius, manual, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, index=True)
    amount = Column(String) # Store as string to avoid float precision issues with crypto
    currency = Column(String) # 'TON', 'XTR' (Stars)
    plan = Column(String) # 'month', 'year'
    status = Column(String) # 'completed', 'failed'
    transaction_hash = Column(String, nullable=True) # For TON
    created_at = Column(DateTime, default=datetime.utcnow)

class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    referrer_id = Column(Integer, index=True)  # Who invited
    referred_id = Column(Integer, index=True)  # Who was invited
    status = Column(String, default='pending')  # pending, completed
    reward_given = Column(Boolean, default=False)  # Has referrer received reward
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)  # When referral made first purchase



def init_db():
    Base.metadata.create_all(bind=engine)
    
    # Ensure default admin exists
    db = SessionLocal()
    admin_id = 414153884
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        admin = User(id=admin_id, username="admin", is_admin=True, is_premium=True, is_premium_pro=True)
        db.add(admin)
        db.commit()
    else:
        if not admin.is_admin or not admin.is_premium_pro:
            admin.is_admin = True
            admin.is_premium = True
            admin.is_premium_pro = True
            db.commit()
    db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

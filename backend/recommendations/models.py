from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime

try:
    from backend.database import Base
except ImportError:
    from database import Base


class UserTrackEvent(Base):
    __tablename__ = "user_track_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, index=True, nullable=False)
    event_type = Column(String, index=True, nullable=False)
    track_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    audio_url = Column(String, nullable=True)
    cover_url = Column(String, nullable=True)
    duration = Column(Integer, default=0)
    played_seconds = Column(Integer, default=0)
    position_seconds = Column(Integer, default=0)
    source = Column(String, nullable=True)
    context_type = Column(String, nullable=True)
    context_id = Column(String, nullable=True)
    session_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

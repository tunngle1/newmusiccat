from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta

try:
    from backend.recommendations.models import UserTrackEvent
    from backend.recommendations.schemas import TrackEventIn
except ImportError:
    from recommendations.models import UserTrackEvent
    from recommendations.schemas import TrackEventIn


VALID_EVENT_TYPES = {
    "play", "pause", "skip", "complete", "like", "unlike",
    "search_select", "queue_add", "playlist_add", "radio_start"
}


def ingest_events(db: Session, user_id: int, events: List[TrackEventIn]) -> int:
    """Insert validated events into the database. Returns count of accepted events."""
    accepted = 0
    for ev in events:
        if ev.event_type not in VALID_EVENT_TYPES:
            continue
        if not ev.track_id or not ev.title or not ev.artist:
            continue

        record = UserTrackEvent(
            user_id=user_id,
            event_type=ev.event_type,
            track_id=ev.track_id,
            title=ev.title,
            artist=ev.artist,
            audio_url=ev.audio_url,
            cover_url=ev.cover_url,
            duration=ev.duration or 0,
            played_seconds=ev.played_seconds or 0,
            position_seconds=ev.position_seconds or 0,
            source=ev.source,
            context_type=ev.context_type,
            context_id=ev.context_id,
            session_id=ev.session_id,
        )
        db.add(record)
        accepted += 1

    if accepted > 0:
        db.commit()
    return accepted


# --- Taste Profile ---

EVENT_WEIGHTS = {
    "like": 5,
    "playlist_add": 4,
    "complete": 3,
    "search_select": 2,
    "play": 1,
    "radio_start": 1,
    "skip": -3,
}


def build_taste_profile(db: Session, user_id: int, days: int = 30, max_artists: int = 15) -> Dict:
    """
    Build a compact taste profile for a user from recent events.
    Returns dict with top_artists, recent_track_signatures, skipped_signatures.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    events = (
        db.query(UserTrackEvent)
        .filter(UserTrackEvent.user_id == user_id, UserTrackEvent.created_at >= cutoff)
        .order_by(desc(UserTrackEvent.created_at))
        .limit(500)
        .all()
    )

    artist_scores: Dict[str, float] = {}
    recent_signatures: List[str] = []
    skipped_signatures: List[str] = []
    liked_artists: set = set()

    for ev in events:
        artist_key = ev.artist.lower().strip()
        sig = f"{artist_key}|||{ev.title.lower().strip()}|||{ev.duration or 0}"
        weight = EVENT_WEIGHTS.get(ev.event_type, 0)

        artist_scores[artist_key] = artist_scores.get(artist_key, 0) + weight

        if ev.event_type in ("play", "complete", "search_select", "like"):
            if sig not in recent_signatures:
                recent_signatures.append(sig)

        if ev.event_type == "skip":
            if sig not in skipped_signatures:
                skipped_signatures.append(sig)

        if ev.event_type == "like":
            liked_artists.add(artist_key)

    # Sort artists by score descending
    sorted_artists = sorted(artist_scores.items(), key=lambda x: x[1], reverse=True)
    top_artists = [a[0] for a in sorted_artists[:max_artists] if a[1] > 0]

    return {
        "top_artists": top_artists,
        "liked_artists": list(liked_artists),
        "recent_signatures": recent_signatures[:50],
        "skipped_signatures": skipped_signatures[:30],
        "artist_scores": dict(sorted_artists[:max_artists]),
    }


def get_recent_played_urls(db: Session, user_id: int, limit: int = 20) -> List[str]:
    """Get audio URLs of recently played tracks to avoid recommending them."""
    events = (
        db.query(UserTrackEvent.audio_url)
        .filter(
            UserTrackEvent.user_id == user_id,
            UserTrackEvent.event_type.in_(["play", "complete"]),
            UserTrackEvent.audio_url.isnot(None),
        )
        .order_by(desc(UserTrackEvent.created_at))
        .limit(limit)
        .all()
    )
    return [e.audio_url for e in events if e.audio_url]

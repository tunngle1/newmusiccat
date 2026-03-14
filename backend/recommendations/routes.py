"""
Recommendation API routes.
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from typing import Optional
from urllib.parse import quote

try:
    from backend.database import get_db
    from backend.recommendations.schemas import (
        TrackEventsRequest, TrackEventsResponse,
        RecommendationResponse, RecommendationTrack,
    )
    from backend.recommendations.signals import ingest_events
    from backend.recommendations.service import get_personal_recommendations, get_radio_recommendations
    from backend.hitmo_parser_light import HitmoParser
except ImportError:
    from database import get_db
    from recommendations.schemas import (
        TrackEventsRequest, TrackEventsResponse,
        RecommendationResponse, RecommendationTrack,
    )
    from recommendations.signals import ingest_events
    from recommendations.service import get_personal_recommendations, get_radio_recommendations
    from hitmo_parser_light import HitmoParser


router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

# Shared parser instance (will be set from main.py)
_parser: Optional[HitmoParser] = None


def set_parser(parser: HitmoParser):
    global _parser
    _parser = parser


def _get_parser() -> HitmoParser:
    global _parser
    if _parser is None:
        _parser = HitmoParser()
    return _parser


def _get_user_id(request: Request) -> int:
    """
    Extract user_id from request.
    Tries X-User-Id header first, then query param, then falls back to 0.
    """
    uid = request.headers.get("X-User-Id")
    if uid:
        try:
            return int(uid)
        except ValueError:
            pass
    return 0


# --- Event Ingestion ---

@router.post("/events", response_model=TrackEventsResponse)
async def post_events(
    body: TrackEventsRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = _get_user_id(request)
    accepted = ingest_events(db, user_id, body.events)
    return TrackEventsResponse(ok=True, accepted=accepted)


# --- Personal Recommendations ---

@router.get("/personal")
async def personal_recommendations(
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    cursor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    user_id = _get_user_id(request)
    parser = _get_parser()
    user_agent = request.headers.get("User-Agent")

    result = await get_personal_recommendations(
        db=db,
        user_id=user_id,
        parser=parser,
        limit=limit,
        cursor=cursor,
        user_agent=user_agent,
    )

    base_url = str(request.base_url).rstrip("/")
    items = []
    for t in result["items"]:
        raw_url = t.get("url", "")
        if raw_url and not raw_url.startswith("/"):
            raw_url = f"/api/stream?url={quote(raw_url, safe='')}"
        items.append(RecommendationTrack(
            id=t.get("id", ""),
            title=t.get("title", ""),
            artist=t.get("artist", ""),
            duration=t.get("duration", 0),
            url=raw_url,
            image=t.get("image", ""),
        ))

    return {
        "items": [i.dict() for i in items],
        "cursor": result.get("cursor"),
        "has_more": result.get("has_more", False),
        "debug": result.get("debug"),
    }


# --- Radio from Track ---

@router.get("/radio")
async def radio_recommendations(
    request: Request,
    artist: str = Query(...),
    title: str = Query(...),
    limit: int = Query(20, ge=1, le=50),
    cursor: Optional[str] = Query(None),
    track_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    user_id = _get_user_id(request)
    parser = _get_parser()
    user_agent = request.headers.get("User-Agent")

    result = await get_radio_recommendations(
        db=db,
        user_id=user_id,
        parser=parser,
        seed_artist=artist,
        seed_title=title,
        limit=limit,
        cursor=cursor,
        user_agent=user_agent,
    )

    items = []
    for t in result["items"]:
        raw_url = t.get("url", "")
        if raw_url and not raw_url.startswith("/"):
            raw_url = f"/api/stream?url={quote(raw_url, safe='')}"
        items.append(RecommendationTrack(
            id=t.get("id", ""),
            title=t.get("title", ""),
            artist=t.get("artist", ""),
            duration=t.get("duration", 0),
            url=raw_url,
            image=t.get("image", ""),
        ))

    return {
        "items": [i.dict() for i in items],
        "cursor": result.get("cursor"),
        "has_more": result.get("has_more", False),
    }

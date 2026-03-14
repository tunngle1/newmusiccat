from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class TrackEventIn(BaseModel):
    event_type: str  # play, pause, skip, complete, like, unlike, search_select, queue_add, playlist_add, radio_start
    track_id: str
    title: str
    artist: str
    audio_url: Optional[str] = None
    cover_url: Optional[str] = None
    duration: Optional[int] = 0
    played_seconds: Optional[int] = 0
    position_seconds: Optional[int] = 0
    source: Optional[str] = None  # search, genre, radio, playlist, favorites, wave
    context_type: Optional[str] = None  # home_search, genre_browse, radio, wave, etc.
    context_id: Optional[str] = None
    session_id: Optional[str] = None


class TrackEventsRequest(BaseModel):
    events: List[TrackEventIn]


class TrackEventsResponse(BaseModel):
    ok: bool
    accepted: int


class RecommendationTrack(BaseModel):
    id: str
    title: str
    artist: str
    duration: int
    url: str
    image: str


class RecommendationResponse(BaseModel):
    items: List[RecommendationTrack]
    cursor: Optional[str] = None
    has_more: bool = False


class RadioRequest(BaseModel):
    track_id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    audio_url: Optional[str] = None

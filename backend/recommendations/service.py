"""
Recommendation service — orchestrates the full recommendation pipeline.
"""
from typing import List, Dict, Optional, Set
from sqlalchemy.orm import Session

try:
    from backend.recommendations.signals import build_taste_profile, get_recent_played_urls
    from backend.recommendations.candidates import generate_personal_candidates, generate_radio_candidates
    from backend.recommendations.scoring import score_candidates
    from backend.recommendations.filters import filter_candidates, build_cursor_from_results, parse_cursor
    from backend.hitmo_parser_light import HitmoParser
except ImportError:
    from recommendations.signals import build_taste_profile, get_recent_played_urls
    from recommendations.candidates import generate_personal_candidates, generate_radio_candidates
    from recommendations.scoring import score_candidates
    from recommendations.filters import filter_candidates, build_cursor_from_results, parse_cursor
    from hitmo_parser_light import HitmoParser


# Default genres for cold-start fallback
FALLBACK_GENRE_IDS = [1, 2, 3, 4, 5]


def _normalize_track(raw: Dict) -> Dict:
    """Normalize a raw Hitmo track dict to our recommendation track shape."""
    return {
        "id": raw.get("id", ""),
        "title": raw.get("title", ""),
        "artist": raw.get("artist", ""),
        "duration": raw.get("duration", 0),
        "url": raw.get("url", ""),
        "image": raw.get("image", ""),
        "candidate_source": raw.get("candidate_source", "unknown"),
        "_score": raw.get("_score", 0),
    }


async def get_personal_recommendations(
    db: Session,
    user_id: int,
    parser: HitmoParser,
    limit: int = 20,
    cursor: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict:
    """
    Full personal recommendation pipeline.
    Returns { items, cursor, has_more, debug }.
    """
    # 1. Build taste profile
    taste = build_taste_profile(db, user_id)
    recent_urls = get_recent_played_urls(db, user_id, limit=20)
    excluded = parse_cursor(cursor)

    # 2. Cold-start fallback
    if not taste["top_artists"] and not taste["liked_artists"]:
        return await _cold_start_recommendations(parser, limit, excluded, user_agent)

    # 3. Generate candidates
    raw_candidates = await generate_personal_candidates(
        parser, taste, limit=max(limit * 6, 120), user_agent=user_agent
    )

    if not raw_candidates:
        return await _cold_start_recommendations(parser, limit, excluded, user_agent)

    # 4. Normalize
    candidates = [_normalize_track(c) for c in raw_candidates]

    # 5. Score
    scored = score_candidates(candidates, taste)

    # 6. Filter
    filtered = filter_candidates(
        scored,
        recent_played_urls=recent_urls,
        excluded_signatures=excluded,
        max_same_artist=2,
        limit=limit,
    )

    # 7. Build cursor
    all_excluded = excluded | set(build_cursor_from_results(filtered).split("|||SEP|||"))
    new_cursor = "|||SEP|||".join(all_excluded) if filtered else None

    return {
        "items": filtered,
        "cursor": new_cursor,
        "has_more": len(raw_candidates) > len(filtered),
        "debug": {
            "profile_top_artists": taste["top_artists"][:5],
            "candidate_count": len(raw_candidates),
            "after_score_count": len(scored),
            "after_filter_count": len(filtered),
        },
    }


async def get_radio_recommendations(
    db: Session,
    user_id: int,
    parser: HitmoParser,
    seed_artist: str,
    seed_title: str,
    limit: int = 20,
    cursor: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict:
    """
    Radio-from-track recommendation pipeline.
    Returns { items, cursor, has_more }.
    """
    taste = build_taste_profile(db, user_id)
    recent_urls = get_recent_played_urls(db, user_id, limit=20)
    excluded = parse_cursor(cursor)

    raw_candidates = await generate_radio_candidates(
        parser,
        seed_artist=seed_artist,
        seed_title=seed_title,
        taste_profile=taste if taste["top_artists"] else None,
        limit=limit * 3,
        user_agent=user_agent,
    )

    candidates = [_normalize_track(c) for c in raw_candidates]
    scored = score_candidates(candidates, taste)

    filtered = filter_candidates(
        scored,
        recent_played_urls=recent_urls,
        excluded_signatures=excluded,
        max_same_artist=5,
        limit=limit,
    )

    all_excluded = excluded | set(build_cursor_from_results(filtered).split("|||SEP|||"))
    new_cursor = "|||SEP|||".join(all_excluded) if filtered else None

    return {
        "items": filtered,
        "cursor": new_cursor,
        "has_more": len(filtered) >= limit // 2,
    }


async def _cold_start_recommendations(
    parser: HitmoParser,
    limit: int,
    excluded: Set[str],
    user_agent: Optional[str] = None,
) -> Dict:
    """Fallback when user has no history — return popular/genre tracks."""
    import random

    genre_id = random.choice(FALLBACK_GENRE_IDS)
    try:
        raw = await parser.get_genre_tracks(genre_id, limit=limit * 2, page=1, user_agent=user_agent)
    except Exception:
        raw = []

    candidates = [_normalize_track(c) for c in raw]

    # Simple filter for cold start
    filtered = filter_candidates(
        candidates,
        recent_played_urls=[],
        excluded_signatures=excluded,
        max_same_artist=3,
        limit=limit,
    )

    return {
        "items": filtered,
        "cursor": None,
        "has_more": len(filtered) >= limit // 2,
        "debug": {"cold_start": True, "genre_id": genre_id},
    }

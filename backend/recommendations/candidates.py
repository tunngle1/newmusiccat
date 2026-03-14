"""
Candidate generation for recommendations.
Uses existing HitmoParser to search for tracks similar to user taste profile.
"""
from typing import List, Dict, Optional
import asyncio
import random

try:
    from backend.hitmo_parser_light import HitmoParser
except ImportError:
    from hitmo_parser_light import HitmoParser


async def generate_personal_candidates(
    parser: HitmoParser,
    taste_profile: Dict,
    limit: int = 120,
    user_agent: Optional[str] = None,
) -> List[Dict]:
    """
    Generate recommendation candidates from taste profile.
    Strategy:
      - 60% from top artists
      - 25% from liked artists broader search
      - 15% exploration (random related queries)
    """
    top_artists = taste_profile.get("top_artists", [])
    liked_artists = taste_profile.get("liked_artists", [])
    recent_signatures = taste_profile.get("recent_signatures", [])

    if not top_artists and not liked_artists:
        return []

    candidates: List[Dict] = []
    seen_urls: set = set()
    seed_queries: List[tuple[str, str, int, int]] = []

    for artist in top_artists[:10]:
        seed_queries.append((artist, "top_artist", 12, 1))

    for artist in liked_artists[:8]:
        if artist not in top_artists:
            seed_queries.append((artist, "liked_artist", 12, 1))

    recent_titles = []
    for sig in recent_signatures[:10]:
        parts = sig.split("|||")
        if len(parts) >= 2 and parts[1]:
            recent_titles.append(parts[1])

    for title in recent_titles[:6]:
        seed_queries.append((title, "recent_title", 8, 1))

    exploration_queries = []
    for artist in top_artists[:6]:
        words = [w for w in artist.split() if w]
        if words:
            exploration_queries.append(words[0])

    for q in exploration_queries[:4]:
        seed_queries.append((q, "exploration", 8, random.randint(1, 3)))

    random.shuffle(seed_queries)
    active_seeds = seed_queries[:5]

    for query, source, query_limit, page in active_seeds:
        try:
            batch = await parser.search(query, limit=query_limit, page=page, user_agent=user_agent)
        except Exception:
            batch = []
        if not batch:
            continue
        for track in batch:
            url = track.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                track["candidate_source"] = source
                candidates.append(track)

    random.shuffle(candidates)
    return candidates[: max(limit * 2, 60)]


async def generate_radio_candidates(
    parser: HitmoParser,
    seed_artist: str,
    seed_title: str,
    taste_profile: Optional[Dict] = None,
    limit: int = 40,
    user_agent: Optional[str] = None,
) -> List[Dict]:
    """
    Generate candidates for radio mode starting from a seed track.
    Strategy:
      - search by artist
      - search by title
      - search by artist + title combined
      - mix in user taste if available
    """
    candidates: List[Dict] = []
    seen_urls: set = set()

    tasks = [
        parser.search(seed_artist, limit=15, page=1, user_agent=user_agent),
        parser.search(seed_title, limit=10, page=1, user_agent=user_agent),
        parser.search(f"{seed_artist} {seed_title}", limit=10, page=1, user_agent=user_agent),
    ]

    # Add a taste-based query if available
    if taste_profile:
        top = taste_profile.get("top_artists", [])
        extra_artists = [a for a in top if a.lower() != seed_artist.lower()]
        if extra_artists:
            tasks.append(
                parser.search(extra_artists[0], limit=10, page=1, user_agent=user_agent)
            )

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for batch in results:
        if isinstance(batch, Exception) or not batch:
            continue
        for track in batch:
            url = track.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                track["candidate_source"] = "radio_seed"
                candidates.append(track)

    random.shuffle(candidates)
    return candidates[:limit * 2]

"""
Post-filters for recommendation candidates.
Handles deduplication, recent-repeat suppression, and quality checks.
"""
from typing import List, Dict, Set, Optional


def filter_candidates(
    candidates: List[Dict],
    recent_played_urls: List[str],
    excluded_signatures: Optional[Set[str]] = None,
    max_same_artist: int = 2,
    limit: int = 20,
) -> List[Dict]:
    """
    Apply all post-filters to scored candidates.
    Returns a clean, deduplicated, limited list.
    """
    recent_urls_set = set(recent_played_urls)
    excluded_sigs = excluded_signatures or set()

    seen_urls: Set[str] = set()
    seen_sigs: Set[str] = set()
    artist_counts: Dict[str, int] = {}
    result: List[Dict] = []

    for c in candidates:
        url = c.get("url", "")
        artist = c.get("artist", "").lower().strip()
        title = c.get("title", "").lower().strip()
        duration = c.get("duration", 0)

        # Skip empty URL
        if not url:
            continue

        # Skip exact URL duplicates
        if url in seen_urls:
            continue

        # Skip recently played
        if url in recent_urls_set:
            continue

        # Build signature
        sig = f"{artist}|||{title}|||{duration}"

        # Skip excluded signatures (cursor-based pagination)
        if sig in excluded_sigs:
            continue

        # Skip exact signature duplicates within this batch
        if sig in seen_sigs:
            continue

        # Limit same artist
        count = artist_counts.get(artist, 0)
        if count >= max_same_artist:
            continue

        # Quality checks
        if not c.get("title") or not c.get("artist"):
            continue

        seen_urls.add(url)
        seen_sigs.add(sig)
        artist_counts[artist] = count + 1
        result.append(c)

        if len(result) >= limit:
            break

    return result


def build_cursor_from_results(results: List[Dict]) -> str:
    """
    Build a cursor string from result signatures for pagination.
    The cursor encodes which tracks have already been served.
    """
    sigs = []
    for r in results:
        artist = r.get("artist", "").lower().strip()
        title = r.get("title", "").lower().strip()
        duration = r.get("duration", 0)
        sigs.append(f"{artist}|||{title}|||{duration}")
    return "|||SEP|||".join(sigs)


def parse_cursor(cursor: Optional[str]) -> Set[str]:
    """Parse cursor back into a set of excluded signatures."""
    if not cursor:
        return set()
    return set(cursor.split("|||SEP|||"))

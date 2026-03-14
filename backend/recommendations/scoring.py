"""
Heuristic scoring for recommendation candidates.
"""
from typing import List, Dict


def score_candidates(
    candidates: List[Dict],
    taste_profile: Dict,
) -> List[Dict]:
    """
    Score each candidate based on user taste profile.
    Returns candidates sorted by score descending.
    """
    top_artists = set(taste_profile.get("top_artists", []))
    liked_artists = set(taste_profile.get("liked_artists", []))
    artist_scores = taste_profile.get("artist_scores", {})
    recent_sigs = set(taste_profile.get("recent_signatures", []))
    skipped_sigs = set(taste_profile.get("skipped_signatures", []))

    max_artist_score = max(artist_scores.values()) if artist_scores else 1

    for c in candidates:
        artist_key = c.get("artist", "").lower().strip()
        title_key = c.get("title", "").lower().strip()
        duration = c.get("duration", 0)
        sig = f"{artist_key}|||{title_key}|||{duration}"
        source = c.get("candidate_source", "")

        # --- Artist affinity (0..1) ---
        raw_artist_affinity = artist_scores.get(artist_key, 0)
        artist_affinity = min(raw_artist_affinity / max_artist_score, 1.0) if max_artist_score > 0 else 0

        # --- Liked boost ---
        liked_boost = 0.15 if artist_key in liked_artists else 0

        # --- Novelty (higher if not in recent history) ---
        novelty = 0.0 if sig in recent_sigs else 0.5

        # --- Skip penalty ---
        skip_penalty = 0.4 if sig in skipped_sigs else 0

        # --- Exploration bonus ---
        exploration_bonus = 0.15 if source == "exploration" else 0

        # --- Source bonus ---
        source_bonus = 0.0
        if source == "top_artist":
            source_bonus = 0.1
        elif source == "radio_seed":
            source_bonus = 0.2

        # --- Final score ---
        score = (
            artist_affinity * 0.35
            + liked_boost
            + novelty * 0.20
            + exploration_bonus
            + source_bonus
            - skip_penalty
        )

        c["_score"] = round(score, 4)

    candidates.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return candidates

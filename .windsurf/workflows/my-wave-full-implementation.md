---
description: Full implementation spec for a personalized "My Wave" / recommendation system in this music app
---

# Purpose

This document is a full handoff specification for another AI agent to implement a personalized recommendation system similar in spirit to Yandex Music "Моя волна" or Spotify recommendation surfaces, adapted to this specific project.

The goal is not to clone any third-party product exactly. The goal is to build a project-native recommendation layer that:

- uses the app's existing data and architecture
- preserves the current UI/UX style
- works with the current React frontend and FastAPI backend
- starts with a strong heuristic MVP
- is extensible toward smarter ranking later

This document should be treated as the implementation contract.

# Product Goal

Implement a personalized music recommendation experience with these capabilities:

- `My Wave` / `Твоя волна`
- `Radio from track`
- `Because you listened to ...`
- `Made for you`

The first production target is a solid heuristic recommendation system. Do not begin with ML, embeddings, or external recommendation APIs unless explicitly requested later.

# Non-Goals

Do not do the following in the first implementation pass:

- do not redesign the current visual style
- do not replace the current search system
- do not introduce a large ML stack
- do not hardcode recommendations in frontend-only state
- do not couple recommendation generation to playback queue internals
- do not break existing favorites, recent tracks, search, or genre browsing

# Project Context

This project currently has:

- React frontend with `App.tsx`, extracted tab views, `PlayerContext`, IndexedDB storage utilities, and API helpers
- FastAPI backend with Hitmo-based parsing/search and genre endpoints
- local persistence for tracks, playlists, favorites, recent tracks, and app state
- user activity surfaces that can be reused as recommendation signals

Important existing patterns:

- preserve current UI/UX and styling
- prefer modular additions over large invasive rewrites
- frontend already has track entities with `id`, `title`, `artist`, `coverUrl`, `audioUrl`, `duration`
- backend already aggregates external music data from Hitmo-like sources

# Recommended Delivery Strategy

Implement in 4 phases:

1. Activity signal collection
2. Recommendation backend MVP
3. Frontend recommendation surfaces
4. Feedback loop and ranking refinement

Do not try to ship everything in one giant change.

# Feature Set

## Phase 1 MVP Features

Implement these first:

- `My Wave` block on Home
- `Radio from current track`
- recommendation endpoint on backend
- activity event tracking
- recent anti-repeat filtering
- heuristic scoring based on user taste

## Phase 2 Enhancements

After MVP works:

- daily mixes
- mood buckets
- artist-focused mixes
- "new for you"
- negative feedback handling
- session-aware reranking

# User Experience Requirements

## My Wave

The user opens Home and sees a personalized horizontal or vertical recommendation block.

Requirements:

- recommendations should feel related to their taste
- some known content is allowed
- some exploration is required
- repeated tracks should be minimized
- recently played tracks should be downranked or hidden

## Radio from Track

The user can start a radio-like stream from the currently selected track.

Requirements:

- recommendations must be centered around current track's artist/title style and recent user taste
- playback queue should be refillable from recommendation results
- results should avoid exact repeats and obvious pagination loops

# Architecture Overview

## Backend Responsibilities

Backend should:

- store or access user interaction signals
- build candidate sets
- score candidates
- filter duplicates and recent repeats
- expose recommendation endpoints
- optionally cache recommendation results briefly

## Frontend Responsibilities

Frontend should:

- send activity signals
- request recommendation lists
- render recommendation sections
- handle loading and error states
- start playback from recommended lists
- optionally request more recommendations for continuation

# Data Model

## New Concept: User Activity Signal

A signal is an interaction event describing how the user behaved around a track.

Recommended event types:

- `play`
- `pause`
- `skip`
- `complete`
- `like`
- `unlike`
- `search_select`
- `queue_add`
- `playlist_add`
- `radio_start`

Recommended normalized event payload:

```json
{
  "user_id": 123,
  "event_type": "play",
  "track_id": "...",
  "title": "...",
  "artist": "...",
  "audio_url": "...",
  "cover_url": "...",
  "duration": 215,
  "position_seconds": 0,
  "played_seconds": 0,
  "source": "search",
  "context_type": "home_search",
  "context_id": null,
  "session_id": "uuid",
  "created_at": "timestamp"
}
```

## New Concept: Recommendation Candidate

A candidate is a track considered for recommendation before ranking.

Recommended internal structure:

```json
{
  "track": {
    "id": "...",
    "title": "...",
    "artist": "...",
    "duration": 215,
    "url": "...",
    "image": "..."
  },
  "candidate_source": "favorite_artist_seed",
  "seed_artist": "...",
  "seed_title": "...",
  "seed_weight": 0.82,
  "features": {
    "artist_affinity": 0.9,
    "title_affinity": 0.2,
    "genre_affinity": 0.7,
    "novelty": 0.4,
    "recency_penalty": 0.8
  },
  "score": 0.0
}
```

# Storage Strategy

## Preferred MVP Storage

Use backend persistence for recommendation signals.

If project already has a database configured via SQLAlchemy, add a table such as:

- `user_track_events`

Recommended columns:

- `id`
- `user_id`
- `event_type`
- `track_id`
- `title`
- `artist`
- `audio_url`
- `cover_url`
- `duration`
- `played_seconds`
- `position_seconds`
- `source`
- `context_type`
- `context_id`
- `session_id`
- `created_at`

## Frontend Local Cache

Frontend may also store a lightweight local activity cache in IndexedDB for resilience and batching, but backend should remain the source of truth for recommendations.

# New Backend Module Structure

Recommended backend module layout:

```text
backend/
  recommendations/
    __init__.py
    schemas.py
    service.py
    scoring.py
    signals.py
    candidates.py
    filters.py
    routes.py
```

## Module Responsibilities

### `schemas.py`

Define request/response shapes:

- `TrackEventIn`
- `RecommendationRequest`
- `RecommendationTrack`
- `RecommendationResponse`
- `RadioRequest`

### `signals.py`

Handle:

- event ingestion
- event normalization
- event deduplication if needed
- batch insert support

### `candidates.py`

Build raw recommendation pools from:

- favorite artists
- recent liked tracks
- recent completed listens
- playlist additions
- search selections
- genres inferred from user behavior
- current seed track for radio

### `filters.py`

Apply:

- recent-repeat filtering
- exact duplicate filtering
- same `audio_url` collapse
- unsafe/empty metadata filtering
- user blacklist or negative feedback filtering if added later

### `scoring.py`

Implement heuristic ranking function.

### `service.py`

Orchestrate full pipeline:

- collect taste profile
- build candidates
- score candidates
- filter candidates
- return final response

### `routes.py`

Expose recommendation API routes.

# API Endpoints

## 1. Track Activity Ingestion

### `POST /api/recommendations/events`

Purpose:

- ingest one or multiple user events

Request body:

```json
{
  "events": [
    {
      "event_type": "play",
      "track_id": "123",
      "title": "Track",
      "artist": "Artist",
      "audio_url": "https://...",
      "cover_url": "https://...",
      "duration": 200,
      "played_seconds": 0,
      "source": "search",
      "context_type": "home_search",
      "session_id": "uuid"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "accepted": 1
}
```

## 2. Personal Recommendations

### `GET /api/recommendations/personal`

Query params:

- `limit`
- `cursor` optional for pagination
- `mode` optional: `wave`, `mix`, `new`

Response:

```json
{
  "items": [...],
  "cursor": "...",
  "has_more": true,
  "debug": {
    "profile_top_artists": [...],
    "profile_top_sources": [...]
  }
}
```

Debug block should be optional and disabled in production if needed.

## 3. Radio from Track

### `GET /api/recommendations/radio`

Query params:

- `track_id` optional
- `title`
- `artist`
- `audio_url` optional
- `limit`
- `cursor`

This endpoint should work even if only `title + artist` are available.

## 4. Recommendation Feedback

### `POST /api/recommendations/feedback`

Purpose:

- support explicit thumbs up / down later
- support skip-quality feedback

This can initially proxy into event ingestion.

# Recommendation Pipeline

## Step 1: Build User Taste Profile

Build a compact taste profile from recent user behavior.

Recommended inputs with example weights:

- `like`: +5
- `playlist_add`: +4
- `complete`: +3
- `repeat_play`: +3
- `search_select`: +2
- `play`: +1
- `skip`: -3
- `quick_skip`: -5

Derive:

- top artists
- top normalized artist-title pairs
- top genres if available
- preferred durations
- recent history set
- disliked/skipped set

## Step 2: Candidate Generation

Candidate sources for `personal` mode:

- tracks matching top artists
- tracks from top genres
- tracks adjacent to recent successful searches
- tracks similar to liked titles
- exploration pool from semi-random but related artist/title search expansion

Candidate sources for `radio` mode:

- same artist
- title variants
- adjacent results from search results for the seed track
- genre-neighbor tracks
- user-affinity artist overlap

## Step 3: Candidate Normalization

Map every candidate to a common normalized track shape.

Normalize identity with a signature such as:

- exact signature: `audio_url`
- fallback signature: `artist + title + duration`

Use this to avoid exact recommendation duplication.

## Step 4: Scoring

Suggested heuristic score:

```text
score =
  artist_affinity * 0.35 +
  title_affinity * 0.10 +
  genre_affinity * 0.20 +
  completion_affinity * 0.10 +
  novelty * 0.10 +
  exploration_bonus * 0.10 -
  recent_repeat_penalty * 0.20 -
  skip_penalty * 0.25
```

This formula does not have to be exact. The important thing is to keep the scoring modular and inspectable.

## Step 5: Post-Filter

Before returning results:

- remove items with empty audio URL
- remove exact duplicate signatures
- strongly limit repeated `artist + title`
- suppress items played very recently
- stop pagination if a next page adds no new exact signatures

# Frontend Integration Plan

## New API functions

Add to `utils/api.ts`:

- `sendRecommendationEvents()`
- `getPersonalRecommendations()`
- `getRadioRecommendations()`
- `sendRecommendationFeedback()`

## New frontend state

Recommended new state container, either in `PlayerContext` or dedicated recommendation hook:

- `personalRecommendations`
- `isRecommendationsLoading`
- `recommendationsError`
- `recommendationsCursor`
- `hasMoreRecommendations`
- `radioRecommendations`

## Recommended hook abstraction

Create something like:

- `hooks/useRecommendations.ts`

Responsibilities:

- fetch recommendation blocks
- send events
- cache current response
- handle load more
- prevent repeated fetch loops

## UI Placement

Add to Home screen without changing overall visual language.

Recommended blocks:

- `Твоя волна`
- `Сделано для тебя`
- `Похоже на последний трек`

Do not introduce a brand-new visual system. Reuse existing track cards and track list rendering helpers.

# Activity Event Collection Rules

The following frontend behaviors should emit events.

## On play start

Emit `play` when user intentionally starts a track.

Do not emit duplicate play events every render or every progress tick.

## On skip

Emit `skip` when user moves away from a track quickly.

Recommended quick skip heuristic:

- skipped before 20% of duration or before 30 seconds

## On complete

Emit `complete` when played at least 85-90% of the track.

## On like/unlike

Emit explicit events from favorites toggle.

## On search click

Emit `search_select` when user taps a search result.

## On playlist add

Emit `playlist_add` when a track is added to playlist.

# Anti-Repetition Rules

This is critical.

Implement at least these protections:

- never repeat exact same `audio_url` in the same recommendation response
- avoid repeating the same exact signature across pagination pages
- limit same normalized `artist + title` count
- exclude tracks listened to in the last N tracks of user history
- exclude recently skipped tracks for a cooldown window

Recommended cooldown defaults:

- recent history exclusion: last 20 played tracks
- recent skip cooldown: 2 hours or last 30 recommendation impressions

# Radio Queue Strategy

For radio mode:

- seed the queue from current track
- when queue runs low, request more radio recommendations
- preserve current player behavior
- do not overwrite unrelated queues silently unless user explicitly starts radio mode

# Pagination Rules

Recommendation pagination must not loop.

Use a backend and/or frontend cursor approach based on seen signatures.

At minimum:

- pass `cursor`
- backend excludes already served signatures if cursor contains them or if server cache tracks them
- frontend stops when newly fetched page adds zero new exact signatures

# Suggested Implementation Order

## Step A

Create backend schemas and routes.

## Step B

Create event ingestion endpoint and persist signals.

## Step C

Build a first taste profile from favorites + recent plays + search selections.

## Step D

Build recommendation candidate generator using existing search/genre capabilities.

## Step E

Implement scoring and anti-repeat filters.

## Step F

Add frontend API methods and a recommendation hook.

## Step G

Render `My Wave` in Home using existing track UI.

## Step H

Add radio-from-track trigger.

## Step I

Instrument play/skip/complete/like/search-select events.

## Step J

Tune ranking weights after manual testing.

# Testing Requirements

## Backend tests

Add tests for:

- event ingestion acceptance
- score ordering sanity
- duplicate suppression
- recent-repeat filtering
- pagination stop when no new signatures exist
- radio recommendations using a seed track

## Frontend tests

At minimum verify manually:

- recommendation block loads
- load more does not loop infinitely
- playing a recommended track works
- search/favorites still behave correctly
- radio mode starts from recommendation seed
- no UI regressions in Home

# Observability

Add safe debug logging in backend during development only:

- candidate count before filters
- top profile artists
- number of filtered recent tracks
- final returned item count

Avoid noisy logs in production.

# Performance Constraints

Keep MVP simple and responsive.

Recommendations:

- cache recommendation responses for short TTL per user and mode
- avoid firing too many external Hitmo requests per page load
- build candidates in bounded pools, e.g. 100-300 max before scoring
- avoid synchronous expensive operations in request path

# Failure Modes and Fallbacks

## If user has no history

Fallback order:

- favorites if available
- recent tracks if available
- trending genre-based pool
- popular default editorial pool

## If recommendation candidate pool is too small

Broaden sources:

- recent searches
- top genres
- similar artists inferred from repeated search patterns
- controlled random exploration

## If external source quality is noisy

Use stronger filtering:

- exact signature dedupe
- title normalization
- duration sanity checks
- URL validity checks

# Acceptance Criteria

This feature is considered successfully implemented when:

- Home shows a personalized `My Wave` block
- recommendations are based on real user behavior
- user can start a radio-like flow from a track
- exact repeats are strongly reduced
- pagination does not loop forever
- recommendation surfaces do not break existing search/player behavior
- implementation fits the current design language

# Optional Future Upgrades

Do not implement these in MVP unless explicitly requested.

Possible later upgrades:

- vector embeddings for artist/title similarity
- session-aware bandit reranking
- mood clusters
- explicit dislike button
- recommendation explanation labels like `Because you liked ...`
- nightly offline profile aggregation

# Instructions for the Next AI Agent

When implementing this:

- preserve the existing visual design
- do not do a large UI rewrite
- make modular changes
- prefer small, testable backend modules
- keep recommendation logic inspectable and deterministic first
- do not introduce ML unless asked
- do not break current search, favorites, playlists, and radio
- ensure duplicate and pagination protections are explicit

Recommended first concrete coding task:

1. create backend recommendation schemas/routes
2. add event ingestion
3. wire frontend `search_select`, `play`, `like`, `skip`, `complete`
4. ship `GET /api/recommendations/personal`
5. render `Твоя волна` on Home with existing track UI

# End State

After implementation, the app should feel more personalized and alive, while still remaining lightweight, understandable, and compatible with the current architecture.

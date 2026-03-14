import { useState, useCallback, useRef } from 'react';
import { Track } from '../types';
import { getPersonalRecommendations, getRadioRecommendations, sendRecommendationEvents } from '../utils/api';

interface UseRecommendationsReturn {
    tracks: Track[];
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    loadPersonal: () => Promise<void>;
    loadMore: () => Promise<void>;
    loadRadio: (artist: string, title: string) => Promise<void>;
    sendEvent: (event: TrackEvent) => void;
    reset: () => void;
}

export interface TrackEvent {
    event_type: string;
    track_id: string;
    title: string;
    artist: string;
    audio_url?: string;
    cover_url?: string;
    duration?: number;
    played_seconds?: number;
    source?: string;
    context_type?: string;
}

export function useRecommendations(userId?: number): UseRecommendationsReturn {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const cursorRef = useRef<string | null>(null);
    const modeRef = useRef<'personal' | 'radio'>('personal');
    const radioSeedRef = useRef<{ artist: string; title: string } | null>(null);

    // Event batching
    const eventBufferRef = useRef<TrackEvent[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushEvents = useCallback(() => {
        const events = eventBufferRef.current;
        if (events.length === 0) return;
        eventBufferRef.current = [];
        sendRecommendationEvents(events.map(e => ({
            event_type: e.event_type,
            track_id: e.track_id,
            title: e.title,
            artist: e.artist,
            audio_url: e.audio_url,
            cover_url: e.cover_url,
            duration: e.duration,
            played_seconds: e.played_seconds,
            source: e.source,
            context_type: e.context_type,
        })), userId);
    }, [userId]);

    const sendEvent = useCallback((event: TrackEvent) => {
        eventBufferRef.current.push(event);
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        // Flush every 3 seconds or when buffer reaches 5 events
        if (eventBufferRef.current.length >= 5) {
            flushEvents();
        } else {
            flushTimerRef.current = setTimeout(flushEvents, 3000);
        }
    }, [flushEvents]);

    const loadPersonal = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        modeRef.current = 'personal';
        cursorRef.current = null;
        try {
            const result = await getPersonalRecommendations(20, null, userId);
            setTracks(result.tracks);
            cursorRef.current = result.cursor;
            setHasMore(result.hasMore);
        } catch (e: any) {
            setError(e?.message || 'Ошибка загрузки рекомендаций');
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    const loadMore = useCallback(async () => {
        if (isLoading || !hasMore) return;
        setIsLoading(true);
        try {
            let result;
            if (modeRef.current === 'radio' && radioSeedRef.current) {
                result = await getRadioRecommendations(
                    radioSeedRef.current.artist,
                    radioSeedRef.current.title,
                    20,
                    cursorRef.current,
                    userId,
                );
            } else {
                result = await getPersonalRecommendations(20, cursorRef.current, userId);
            }
            const prev = tracks;
            const combined = [...prev, ...result.tracks];
            // Deduplicate by audioUrl
            const seen = new Set<string>();
            const unique = combined.filter(t => {
                if (seen.has(t.audioUrl)) return false;
                seen.add(t.audioUrl);
                return true;
            });
            const addedNew = unique.length > prev.length;
            setTracks(unique);
            cursorRef.current = result.cursor;
            setHasMore(addedNew && result.hasMore);
        } catch (e: any) {
            setError(e?.message || 'Ошибка загрузки');
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, hasMore, tracks, userId]);

    const loadRadio = useCallback(async (artist: string, title: string) => {
        setIsLoading(true);
        setError(null);
        modeRef.current = 'radio';
        radioSeedRef.current = { artist, title };
        cursorRef.current = null;
        try {
            const result = await getRadioRecommendations(artist, title, 20, null, userId);
            setTracks(result.tracks);
            cursorRef.current = result.cursor;
            setHasMore(result.hasMore);
        } catch (e: any) {
            setError(e?.message || 'Ошибка загрузки радио');
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    const reset = useCallback(() => {
        setTracks([]);
        setIsLoading(false);
        setError(null);
        setHasMore(false);
        cursorRef.current = null;
        modeRef.current = 'personal';
        radioSeedRef.current = null;
    }, []);

    return {
        tracks,
        isLoading,
        error,
        hasMore,
        loadPersonal,
        loadMore,
        loadRadio,
        sendEvent,
        reset,
    };
}

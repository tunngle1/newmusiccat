import { Track } from '../types';

/**
 * Limit duplicate tracks based on artist and title
 * Keeps at most `maxPerGroup` occurrences for each unique pair while preserving order
 */
export const deduplicateTracks = (tracks: Track[], maxPerGroup: number = 3): Track[] => {
    const counts = new Map<string, number>();
    const result: Track[] = [];

    for (const track of tracks) {
        // Create a unique key from artist and title (normalized)
        const key = `${track.artist.toLowerCase().trim()}|||${track.title.toLowerCase().trim()}`;
        const currentCount = counts.get(key) ?? 0;

        if (currentCount < maxPerGroup) {
            counts.set(key, currentCount + 1);
            result.push(track);
        }
    }

    return result;
};

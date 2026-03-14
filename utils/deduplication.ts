import { Track } from '../types';

/**
 * Limit duplicate tracks based on artist and title
 * Keeps at most `maxPerGroup` occurrences for each unique pair while preserving order
 */
export const deduplicateTracks = (tracks: Track[], maxPerGroup: number = 5): Track[] => {
    const counts = new Map<string, number>();
    const result: Track[] = [];

    for (const track of tracks) {
        const groupKey = `${track.artist.toLowerCase().trim()}|||${track.title.toLowerCase().trim()}`;
        const variantKey = `${groupKey}|||${track.duration || 0}|||${track.audioUrl || ''}`;
        const currentCount = counts.get(variantKey) ?? 0;

        if (currentCount < maxPerGroup) {
            counts.set(variantKey, currentCount + 1);
            result.push(track);
        }
    }

    return result;
};

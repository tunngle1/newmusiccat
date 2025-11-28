/**
 * API Client for Music Backend
 * Клиент для взаимодействия с FastAPI бэкендом
 */

import { Track } from '../types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
    throw new Error('VITE_API_URL environment variable is not set');
}

interface SearchResponse {
    results: Track[];
    count: number;
}

interface ApiError {
    detail: string;
}

/**
 * Поиск треков
 */
export const searchTracks = async (
    query: string,
    limit: number = 20,
    page: number = 1
): Promise<Track[]> => {
    try {
        const url = new URL(`${API_BASE_URL}/api/search`);
        url.searchParams.append('q', query);
        url.searchParams.append('limit', limit.toString());
        url.searchParams.append('page', page.toString());

        const response = await fetch(url.toString(), {
            headers: {
                'tuna-skip-browser-warning': 'true'
            }
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при поиске треков');
        }

        const data: SearchResponse = await response.json();

        // Преобразуем данные в формат Track
        return data.results.map(track => {
            let audioUrl = (track as any).url;
            // Если URL относительный (начинается с /), добавляем базовый URL API
            if (audioUrl && audioUrl.startsWith('/')) {
                audioUrl = `${API_BASE_URL}${audioUrl}`;
            }

            return {
                id: track.id,
                title: track.title,
                artist: track.artist,
                coverUrl: (track as any).image,
                audioUrl: audioUrl,
                duration: track.duration,
                isLocal: false
            };
        });
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
};

/**
 * Получить треки конкретного жанра
 */
export const getGenreTracks = async (
    genreId: number,
    limit: number = 20
): Promise<Track[]> => {
    try {
        const url = new URL(`${API_BASE_URL}/api/genre/${genreId}`);
        url.searchParams.append('limit', limit.toString());

        const response = await fetch(url.toString(), {
            headers: {
                'tuna-skip-browser-warning': 'true'
            }
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при получении треков жанра');
        }

        const data: SearchResponse = await response.json();

        // Преобразуем данные в формат Track
        return data.results.map(track => {
            let audioUrl = (track as any).url;
            if (audioUrl && audioUrl.startsWith('/')) {
                audioUrl = `${API_BASE_URL}${audioUrl}`;
            }

            return {
                id: track.id,
                title: track.title,
                artist: track.artist,
                coverUrl: (track as any).image,
                audioUrl: audioUrl,
                duration: track.duration,
                isLocal: false
            };
        });
    } catch (error) {
        console.error('Genre tracks error:', error);
        throw error;
    }
};

/**
 * Получить информацию о треке по ID
 */
export const getTrack = async (trackId: string): Promise<Track> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/track/${trackId}`, {
            headers: {
                'tuna-skip-browser-warning': 'true'
            }
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при получении трека');
        }

        const track = await response.json();

        let audioUrl = (track as any).url;
        if (audioUrl && audioUrl.startsWith('/')) {
            audioUrl = `${API_BASE_URL}${audioUrl}`;
        }

        return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            coverUrl: (track as any).image,
            audioUrl: audioUrl,
            duration: track.duration,
            isLocal: false
        };
    } catch (error) {
        console.error('Get track error:', error);
        throw error;
    }
};

/**
 * Проверка работоспособности API
 */
export const checkHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.ok;
    } catch (error) {
        console.error('Health check error:', error);
        return false;
    }
};

/**
 * Форматирование времени из секунд в MM:SS
 */
export const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * API Client for Music Backend
 * Клиент для взаимодействия с FastAPI бэкендом
 */

import { Track, SearchMode } from '../types';

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
    page: number = 1,
    searchMode: SearchMode = 'all',
    signal?: AbortSignal
): Promise<Track[]> => {
    try {
        const url = new URL(`${API_BASE_URL}/api/search`);
        url.searchParams.append('q', query);
        url.searchParams.append('limit', limit.toString());
        url.searchParams.append('page', page.toString());

        const response = await fetch(url.toString(), {
            headers: {
                'tuna-skip-browser-warning': 'true'
            },
            signal
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при поиске треков');
        }

        const data: SearchResponse = await response.json();

        // Преобразуем данные в формат Track
        const mapped = data.results.map(track => {
            let audioUrl = (track as any).url;
            // Если URL относительный (начинается с /), добавляем базовый URL API
            if (audioUrl && audioUrl.startsWith('/')) {
                audioUrl = `${API_BASE_URL}${audioUrl}`;
            }

            let coverUrl = (track as any).image;
            if (coverUrl && coverUrl.startsWith('/')) {
                coverUrl = `${API_BASE_URL}${coverUrl}`;
            }

            return {
                id: track.id,
                title: track.title,
                artist: track.artist,
                coverUrl: coverUrl,
                audioUrl: audioUrl,
                duration: track.duration,
                isLocal: false
            };
        });

        // Локальная фильтрация по артисту/треку, чтобы не триггерить глубокий поиск на бэкенде
        if (searchMode === 'artist') {
            const q = query.toLowerCase();
            return mapped.filter(t => t.artist?.toLowerCase().includes(q));
        }
        if (searchMode === 'track') {
            const q = query.toLowerCase();
            return mapped.filter(t => t.title?.toLowerCase().includes(q));
        }

        return mapped;
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
    limit: number = 20,
    page: number = 1
): Promise<Track[]> => {
    try {
        const url = new URL(`${API_BASE_URL}/api/genre/${genreId}`);
        url.searchParams.append('limit', limit.toString());
        url.searchParams.append('page', page.toString());

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

            let coverUrl = (track as any).image;
            if (coverUrl && coverUrl.startsWith('/')) {
                coverUrl = `${API_BASE_URL}${coverUrl}`;
            }

            return {
                id: track.id,
                title: track.title,
                artist: track.artist,
                coverUrl: coverUrl,
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

        let coverUrl = (track as any).image;
        if (coverUrl && coverUrl.startsWith('/')) {
            coverUrl = `${API_BASE_URL}${coverUrl}`;
        }

        return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            coverUrl: coverUrl,
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
 * Получить список радиостанций
 */
export const getRadioStations = async (): Promise<any[]> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/radio`, {
            headers: {
                'tuna-skip-browser-warning': 'true'
            }
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при получении радиостанций');
        }

        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('Get radio stations error:', error);
        throw error;
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

/**
 * Send text message to Telegram chat via bot
 */
export const sendMessageToChat = async (userId: number, message: string): Promise<void> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/send-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                message: message
            })
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при отправке сообщения');
        }
    } catch (error) {
        console.error('Send message error:', error);
        throw error;
    }
};

/**
 * Download track to Telegram chat via bot
 */
export const downloadToChat = async (userId: number, track: Track): Promise<void> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/download/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                track: {
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    duration: track.duration,
                    url: track.audioUrl,
                    image: track.coverUrl
                }
            })
        });

        if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при отправке трека в чат');
        }
    } catch (error) {
        console.error('Download to chat error:', error);
        throw error;
    }
};


/**
 * Get lyrics for a track
 */
export const getLyrics = async (trackId: string, title: string, artist: string): Promise<any> => {
    try {
        const url = new URL(`${API_BASE_URL}/api/lyrics/${trackId}`);
        url.searchParams.append('title', title);
        url.searchParams.append('artist', artist);

        const response = await fetch(url.toString());

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Текст песни не найден');
            } else if (response.status === 503) {
                throw new Error('Сервис текстов недоступен');
            }
            const error: ApiError = await response.json();
            throw new Error(error.detail || 'Ошибка при получении текста');
        }

        return await response.json();
    } catch (error) {
        console.error('Get lyrics error:', error);
        throw error;
    }
};

import { Track, Playlist } from './types';

// Пустые массивы по умолчанию
export const MOCK_TRACKS: Track[] = [];

export const INITIAL_PLAYLISTS: Playlist[] = [];

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
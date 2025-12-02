import { Track, Playlist } from './types';

// Демонстрационные треки, чтобы интерфейс открывался даже без данных с бэка
export const MOCK_TRACKS: Track[] = [
  {
    id: 'demo_1',
    title: 'Brutal Intro',
    artist: 'Lebedev',
    coverUrl: 'https://picsum.photos/seed/lebedev1/400/400',
    audioUrl: 'https://file-examples.com/storage/fe1a5c0f0c82aa5a0a028bf/2017/11/file_example_MP3_700KB.mp3',
    duration: 120
  },
  {
    id: 'demo_2',
    title: 'Midnight Run',
    artist: 'TG Player',
    coverUrl: 'https://picsum.photos/seed/lebedev2/400/400',
    audioUrl: 'https://file-examples.com/storage/fe1a5c0f0c82aa5a0a028bf/2017/11/file_example_MP3_1MG.mp3',
    duration: 150
  },
  {
    id: 'demo_3',
    title: 'Neon Pulse',
    artist: 'AI Band',
    coverUrl: 'https://picsum.photos/seed/lebedev3/400/400',
    audioUrl: 'https://file-examples.com/storage/fe1a5c0f0c82aa5a0a028bf/2017/11/file_example_MP3_2MG.mp3',
    duration: 210
  }
];

export const INITIAL_PLAYLISTS: Playlist[] = [];

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

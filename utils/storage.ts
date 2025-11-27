import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track } from '../types';

import { Playlist } from '../types';

interface MusicDB extends DBSchema {
    tracks: {
        key: string;
        value: Track & {
            audioBlob: Blob;
            coverBlob?: Blob;
            savedAt: number;
        };
        indexes: { 'by-date': number };
    };
    playlists: {
        key: string;
        value: Playlist & {
            createdAt: number;
        };
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'tg-music-player-db';
const DB_VERSION = 2;

class StorageService {
    private dbPromise: Promise<IDBPDatabase<MusicDB>>;

    constructor() {
        this.dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, newVersion, transaction) {
                if (oldVersion < 1) {
                    const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
                    trackStore.createIndex('by-date', 'savedAt');
                }
                if (oldVersion < 2) {
                    const playlistStore = db.createObjectStore('playlists', { keyPath: 'id' });
                    playlistStore.createIndex('by-date', 'createdAt');
                }
            },
        });
    }

    async saveTrack(track: Track, audioBlob: Blob, coverBlob?: Blob): Promise<void> {
        const db = await this.dbPromise;
        await db.put('tracks', {
            ...track,
            audioBlob,
            coverBlob,
            savedAt: Date.now(),
            isLocal: true
        });
    }

    async getTrack(id: string): Promise<(Track & { audioBlob: Blob; coverBlob?: Blob }) | undefined> {
        const db = await this.dbPromise;
        return db.get('tracks', id);
    }

    async getAllTracks(): Promise<Track[]> {
        const db = await this.dbPromise;
        const tracks = await db.getAllFromIndex('tracks', 'by-date');
        // Возвращаем треки без блобов для списка, чтобы не забивать память
        return tracks.map(({ audioBlob, coverBlob, ...track }) => ({
            ...track,
            isLocal: true
        }));
    }

    async deleteTrack(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('tracks', id);
    }

    async isTrackDownloaded(id: string): Promise<boolean> {
        const db = await this.dbPromise;
        const key = await db.getKey('tracks', id);
        return !!key;
    }

    // Playlist methods

    async savePlaylist(playlist: Playlist): Promise<void> {
        const db = await this.dbPromise;
        // Проверяем, существует ли уже плейлист, чтобы сохранить дату создания
        const existing = await db.get('playlists', playlist.id);

        await db.put('playlists', {
            ...playlist,
            createdAt: existing ? existing.createdAt : Date.now()
        });
    }

    async getAllPlaylists(): Promise<Playlist[]> {
        const db = await this.dbPromise;
        const playlists = await db.getAllFromIndex('playlists', 'by-date');
        return playlists.map(({ createdAt, ...playlist }) => playlist);
    }

    async deletePlaylist(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('playlists', id);
    }

    async updatePlaylist(playlist: Playlist): Promise<void> {
        await this.savePlaylist(playlist);
    }
}

export const storage = new StorageService();

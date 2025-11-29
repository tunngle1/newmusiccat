import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track } from '../types';

import { Playlist } from '../types';

interface MusicDB extends DBSchema {
    tracks: {
        key: string;
        value: Track & {
            audioBlob?: Blob; // Made optional
            coverBlob?: Blob;
            savedAt: number;
        };
        indexes: { 'by-date': number };
    };
    playlists: {
        key: string;
        value: Playlist & {
            coverBlob?: Blob; // Added coverBlob
            createdAt: number;
        };
        indexes: { 'by-date': number };
    };
    favorites: {
        key: string;
        value: Track & {
            savedAt: number;
        };
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'tg-music-player-db';
const DB_VERSION = 5; // Increment version

class StorageService {
    private dbPromise: Promise<IDBPDatabase<MusicDB>>;

    constructor() {
        this.dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, newVersion, transaction) {
                console.log(`Upgrading DB from ${oldVersion} to ${newVersion}`);
                if (oldVersion < 1) {
                    const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
                    trackStore.createIndex('by-date', 'savedAt');
                }
                if (oldVersion < 2) {
                    const playlistStore = db.createObjectStore('playlists', { keyPath: 'id' });
                    playlistStore.createIndex('by-date', 'createdAt');
                }
                if (oldVersion < 5) {
                    const favoriteStore = db.createObjectStore('favorites', { keyPath: 'id' });
                    favoriteStore.createIndex('by-date', 'savedAt');
                }
            },
            blocked(currentVersion, blockedVersion, event) {
                console.warn("DB Open Blocked: Another tab has the DB open", currentVersion, blockedVersion);
            },
            blocking(currentVersion, blockedVersion, event) {
                console.warn("DB Open Blocking: This tab is blocking a version upgrade", currentVersion, blockedVersion);
                const db = (event.target as any).result;
                db.close();
            },
            terminated() {
                console.error("DB Connection Terminated Abruptly");
            },
        });
    }

    async saveTrack(track: Track, audioBlob?: Blob, coverBlob?: Blob): Promise<void> {
        const db = await this.dbPromise;
        await db.put('tracks', {
            ...track,
            audioBlob,
            coverBlob,
            savedAt: Date.now(),
            isLocal: !!audioBlob // Only local if we have the audio
        });
    }

    async getTrack(id: string): Promise<(Track & { audioBlob?: Blob; coverBlob?: Blob }) | undefined> {
        const db = await this.dbPromise;
        return db.get('tracks', id);
    }

    async getAllTracks(): Promise<Track[]> {
        const db = await this.dbPromise;
        const tracks = await db.getAllFromIndex('tracks', 'by-date');
        // Return all tracks (both downloaded and metadata-only)
        return tracks.map(({ audioBlob, coverBlob, ...track }) => ({
            ...track,
            isLocal: !!audioBlob
        }));
    }

    async deleteTrack(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('tracks', id);
    }

    async isTrackDownloaded(id: string): Promise<boolean> {
        const db = await this.dbPromise;
        const track = await db.get('tracks', id);
        return !!track?.audioBlob;
    }

    // Playlist methods

    async savePlaylist(playlist: Playlist, coverBlob?: Blob): Promise<void> {
        const db = await this.dbPromise;
        const existing = await db.get('playlists', playlist.id);

        await db.put('playlists', {
            ...playlist,
            coverBlob: coverBlob || existing?.coverBlob, // Keep existing blob if not provided
            createdAt: existing ? existing.createdAt : Date.now()
        });
    }

    async getAllPlaylists(): Promise<(Playlist & { coverBlob?: Blob })[]> {
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

    // Favorites methods

    async addToFavorites(track: Track): Promise<void> {
        const db = await this.dbPromise;
        await db.put('favorites', {
            ...track,
            savedAt: Date.now()
        });
    }

    async removeFromFavorites(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('favorites', id);
    }

    async getFavorites(): Promise<Track[]> {
        const db = await this.dbPromise;
        const favorites = await db.getAllFromIndex('favorites', 'by-date');
        // Favorites are just metadata, so no blob handling needed usually, 
        // but we return them as Tracks
        return favorites.map(({ savedAt, ...track }) => track);
    }

    async isFavorite(id: string): Promise<boolean> {
        const db = await this.dbPromise;
        const track = await db.get('favorites', id);
        return !!track;
    }
}

export const storage = new StorageService();

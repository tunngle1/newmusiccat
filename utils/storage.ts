import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track, RadioStation } from '../types';

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
    favoriteRadios: {
        key: string;
        value: {
            radioId: string;
            savedAt: number;
        };
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'tg-music-player-db';
const DB_VERSION = 6; // Increment version for favoriteRadios

class StorageService {
    private dbPromise: Promise<IDBPDatabase<MusicDB>> | null = null;
    private isInitializing = false;
    private initPromise: Promise<void> | null = null;

    constructor() {
        // Start initialization immediately
        this.initPromise = this.initDB();
    }

    private async initDB(): Promise<void> {
        if (this.dbPromise) return;
        if (this.isInitializing) {
            // Wait for ongoing initialization
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.initDB();
        }

        this.isInitializing = true;
        console.log('[Storage] Initializing IndexedDB...');

        try {
            this.dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
                upgrade(db, oldVersion, newVersion, transaction) {
                    console.log(`[Storage] Upgrading DB from ${oldVersion} to ${newVersion}`);
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
                    if (oldVersion < 6) {
                        const favoriteRadioStore = db.createObjectStore('favoriteRadios', { keyPath: 'radioId' });
                        favoriteRadioStore.createIndex('by-date', 'savedAt');
                    }
                },
                blocked(currentVersion, blockedVersion, event) {
                    console.warn("[Storage] DB Open Blocked: Another tab has the DB open", currentVersion, blockedVersion);
                },
                blocking(currentVersion, blockedVersion, event) {
                    console.warn("[Storage] DB Open Blocking: This tab is blocking a version upgrade", currentVersion, blockedVersion);
                    const db = (event.target as any).result;
                    if (db) db.close();
                },
                terminated() {
                    console.error("[Storage] DB Connection Terminated Abruptly - will reconnect on next operation");
                },
            });

            // Wait for the promise to resolve to confirm DB is ready
            await this.dbPromise;
            console.log('[Storage] IndexedDB initialized successfully');
        } catch (error) {
            console.error('[Storage] Failed to initialize IndexedDB:', error);
            this.dbPromise = null;
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    // Ensure DB is ready before any operation
    private async ensureDB(retries = 3): Promise<IDBPDatabase<MusicDB>> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Wait for initial setup if still in progress
                if (this.initPromise) {
                    await this.initPromise;
                }

                if (!this.dbPromise) {
                    await this.initDB();
                }

                const db = await this.dbPromise!;
                return db;
            } catch (error) {
                console.error(`[Storage] ensureDB attempt ${attempt}/${retries} failed:`, error);

                if (attempt < retries) {
                    // Reset and retry
                    this.dbPromise = null;
                    this.isInitializing = false;
                    await new Promise(resolve => setTimeout(resolve, 200 * attempt));
                } else {
                    throw error;
                }
            }
        }
        throw new Error('[Storage] Failed to initialize database after retries');
    }

    async saveTrack(track: Track, audioBlob?: Blob, coverBlob?: Blob): Promise<void> {
        const db = await this.ensureDB();
        await db.put('tracks', {
            ...track,
            audioBlob,
            coverBlob,
            savedAt: Date.now(),
            isLocal: !!audioBlob // Only local if we have the audio
        });
    }

    async getTrack(id: string): Promise<(Track & { audioBlob?: Blob; coverBlob?: Blob }) | undefined> {
        const db = await this.ensureDB();
        return db.get('tracks', id);
    }

    async getAllTracks(): Promise<Track[]> {
        const db = await this.ensureDB();
        const tracks = await db.getAllFromIndex('tracks', 'by-date');
        // Return all tracks (both downloaded and metadata-only)
        return tracks.map(({ audioBlob, coverBlob, ...track }) => ({
            ...track,
            isLocal: !!audioBlob
        }));
    }

    async deleteTrack(id: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('tracks', id);
    }

    async isTrackDownloaded(id: string): Promise<boolean> {
        const db = await this.ensureDB();
        const track = await db.get('tracks', id);
        return !!track?.audioBlob;
    }

    // Playlist methods

    async savePlaylist(playlist: Playlist, coverBlob?: Blob): Promise<void> {
        const db = await this.ensureDB();
        const existing = await db.get('playlists', playlist.id);

        await db.put('playlists', {
            ...playlist,
            coverBlob: coverBlob || existing?.coverBlob, // Keep existing blob if not provided
            createdAt: existing ? existing.createdAt : Date.now()
        });
    }

    async getAllPlaylists(): Promise<(Playlist & { coverBlob?: Blob })[]> {
        const db = await this.ensureDB();
        const playlists = await db.getAllFromIndex('playlists', 'by-date');
        return playlists.map(({ createdAt, ...playlist }) => playlist);
    }

    async deletePlaylist(id: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('playlists', id);
    }

    async updatePlaylist(playlist: Playlist): Promise<void> {
        await this.savePlaylist(playlist);
    }

    // Favorites methods

    async addToFavorites(track: Track): Promise<void> {
        const db = await this.ensureDB();
        await db.put('favorites', {
            ...track,
            savedAt: Date.now()
        });
    }

    async removeFromFavorites(id: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('favorites', id);
    }

    async getFavorites(): Promise<Track[]> {
        const db = await this.ensureDB();
        const favorites = await db.getAllFromIndex('favorites', 'by-date');
        // Favorites are just metadata, so no blob handling needed usually, 
        // but we return them as Tracks
        return favorites.map(({ savedAt, ...track }) => track);
    }

    async isFavorite(id: string): Promise<boolean> {
        const db = await this.ensureDB();
        const track = await db.get('favorites', id);
        return !!track;
    }

    // Favorite Radio Methods
    async saveFavoriteRadio(radioId: string): Promise<void> {
        const db = await this.ensureDB();
        await db.put('favoriteRadios', {
            radioId,
            savedAt: Date.now()
        });
    }

    async removeFavoriteRadio(radioId: string): Promise<void> {
        const db = await this.ensureDB();
        await db.delete('favoriteRadios', radioId);
    }

    async getFavoriteRadios(): Promise<string[]> {
        const db = await this.ensureDB();
        const favorites = await db.getAllFromIndex('favoriteRadios', 'by-date');
        return favorites.map(f => f.radioId);
    }

    async isFavoriteRadio(radioId: string): Promise<boolean> {
        const db = await this.ensureDB();
        const radio = await db.get('favoriteRadios', radioId);
        return !!radio;
    }
}

export const storage = new StorageService();

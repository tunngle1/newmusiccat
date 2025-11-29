import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Track, Playlist, RepeatMode, RadioStation, User, SearchMode } from '../types';
import { MOCK_TRACKS, INITIAL_PLAYLISTS, API_BASE_URL } from '../constants';
import { hapticFeedback } from '../utils/telegram';
import { searchTracks, getGenreTracks } from '../utils/api';

interface PlayerContextType {
  // Данные
  allTracks: Track[];
  playlists: Playlist[];
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  repeatMode: RepeatMode;
  queue: Track[];
  downloadedTracks: Set<string>;
  isDownloading: string | null;
  isShuffle: boolean;

  // Действия
  playTrack: (track: Track, newQueue?: Track[]) => void;
  playRadio: (station: RadioStation) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (time: number) => void;
  addTrack: (track: Track) => void;
  createPlaylist: (name: string, coverFile?: File) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  downloadTrack: (track: Track) => void;
  removeDownloadedTrack: (trackId: string) => void;
  deletePlaylist: (id: string) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  updatePlaylist: (playlist: Playlist, coverBlob?: Blob) => void;

  // Search
  searchState: {
    query: string;
    results: Track[];
    isSearching: boolean;
    error: string | null;
    page: number;
    hasMore: boolean;
    searchMode: SearchMode;
    genreId: number | null; // New field
  };
  setSearchState: React.Dispatch<React.SetStateAction<{
    query: string;
    results: Track[];
    isSearching: boolean;
    error: string | null;
    page: number;
    hasMore: boolean;
    searchMode: SearchMode;
    genreId: number | null;
  }>>;
  resetSearch: () => void;
  // User State
  user: User | null;
  // Favorites
  favorites: Track[];
  toggleFavorite: (track: Track) => Promise<void>;
  // Favorite Radios
  favoriteRadios: Set<string>;
  toggleFavoriteRadio: (radioId: string) => Promise<void>;
  markTrackAsDownloaded: (trackId: string) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

import { storage } from '../utils/storage';

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [allTracks, setAllTracks] = useState<Track[]>(MOCK_TRACKS);
  const [playlists, setPlaylists] = useState<Playlist[]>(INITIAL_PLAYLISTS);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentRadio, setCurrentRadio] = useState<RadioStation | null>(null);
  const [isRadioMode, setIsRadioMode] = useState(false);
  const [queue, setQueue] = useState<Track[]>(MOCK_TRACKS);
  const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [isShuffle, setIsShuffle] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Favorites State
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [favoriteRadios, setFavoriteRadios] = useState<Set<string>>(new Set());

  const toggleFavorite = async (track: Track) => {
    try {
      const isFav = favorites.some(f => f.id === track.id);
      if (isFav) {
        await storage.removeFromFavorites(track.id);
        setFavorites(prev => prev.filter(f => f.id !== track.id));
      } else {
        await storage.addToFavorites(track);
        setFavorites(prev => [...prev, track]);
      }
      hapticFeedback.medium();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const toggleFavoriteRadio = async (radioId: string) => {
    try {
      const isFav = favoriteRadios.has(radioId);
      if (isFav) {
        await storage.removeFavoriteRadio(radioId);
        setFavoriteRadios(prev => {
          const next = new Set(prev);
          next.delete(radioId);
          return next;
        });
      } else {
        await storage.saveFavoriteRadio(radioId);
        setFavoriteRadios(prev => new Set(prev).add(radioId));
      }
      hapticFeedback.medium();
    } catch (error) {
      console.error('Error toggling favorite radio:', error);
    }
  };

  // Search State
  const [searchState, setSearchState] = useState({
    query: '',
    results: [] as Track[],
    isSearching: false,
    error: null as string | null,
    page: 1,
    hasMore: true,
    searchMode: 'all' as SearchMode,
    genreId: null as number | null
  });

  const resetSearch = () => {
    setSearchState({
      query: '',
      results: [],
      isSearching: false,
      error: null,
      page: 1,
      hasMore: true,
      searchMode: 'all',
      genreId: null
    });
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);
  const repeatModeRef = useRef(repeatMode);
  const isShuffleRef = useRef(isShuffle);
  const searchStateRef = useRef(searchState);

  // Sync refs with state
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { searchStateRef.current = searchState; }, [searchState]);

  // ... (Auth and Load Data omitted)

  // Load more tracks function
  const loadMoreTracks = async () => {
    const currentSearchState = searchStateRef.current;
    if (!currentSearchState.hasMore || currentSearchState.isSearching || (!currentSearchState.query.trim() && !currentSearchState.genreId)) return;

    console.log("Pre-loading more tracks...");
    // Set loading state to prevent multiple fetches
    setSearchState(prev => ({ ...prev, isSearching: true }));

    try {
      const nextPage = currentSearchState.page + 1;
      let newTracks: Track[] = [];

      if (currentSearchState.genreId) {
        newTracks = await getGenreTracks(currentSearchState.genreId, 20, nextPage);
      } else {
        newTracks = await searchTracks(currentSearchState.query, currentSearchState.searchMode, 20, nextPage);
      }

      if (newTracks.length > 0) {
        setSearchState(prev => ({
          ...prev,
          results: [...prev.results, ...newTracks],
          page: nextPage,
          hasMore: newTracks.length >= 20,
          isSearching: false
        }));

        setQueue(prev => [...prev, ...newTracks]);
      } else {
        setSearchState(prev => ({ ...prev, hasMore: false, isSearching: false }));
      }
    } catch (e) {
      console.error("Failed to load more tracks:", e);
      setSearchState(prev => ({ ...prev, isSearching: false }));
    }
  };



  const nextTrack = async () => {
    const currentTrackVal = currentTrackRef.current;
    const currentQueue = queueRef.current;
    const isShuffleVal = isShuffleRef.current;
    const repeatModeVal = repeatModeRef.current;

    if (!currentTrackVal || currentQueue.length === 0) return;

    if (isShuffleVal) {
      const randomIndex = Math.floor(Math.random() * currentQueue.length);
      playTrack(currentQueue[randomIndex]);
      return;
    }

    const currentIndex = currentQueue.findIndex(t => t.id === currentTrackVal.id);

    if (currentIndex < currentQueue.length - 1) {
      playTrack(currentQueue[currentIndex + 1]);
    } else if (repeatModeVal === 'all') {
      playTrack(currentQueue[0]);
    } else {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  };

  const prevTrack = () => {
    const currentTrackVal = currentTrackRef.current;
    const currentQueue = queueRef.current;

    if (!currentTrackVal || currentQueue.length === 0) return;
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const currentIndex = currentQueue.findIndex(t => t.id === currentTrackVal.id);
    if (currentIndex > 0) {
      playTrack(currentQueue[currentIndex - 1]);
    } else {
      playTrack(currentQueue[currentQueue.length - 1]);
    }
  };

  // Auth and Load Data
  useEffect(() => {
    const init = async () => {
      // 1. Auth User
      if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
        try {
          const response = await fetch(`${API_BASE_URL}/api/user/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: tgUser.id,
              username: tgUser.username,
              first_name: tgUser.first_name,
              last_name: tgUser.last_name
            })
          });
          if (response.ok) {
            const data = await response.json();
            console.log("Auth response:", data); // DEBUG LOG
            setUser(data.user);
          } else if (response.status === 403) {
            // User is blocked
            console.error("User is blocked");
            if (window.Telegram?.WebApp?.showAlert) {
              window.Telegram.WebApp.showAlert("Доступ к приложению ограничен. Обратитесь к администратору.");
            } else {
              alert("Доступ к приложению ограничен. Обратитесь к администратору.");
            }
            // Don't set user, keep as null
          } else {
            console.error("Auth error:", await response.text());
          }
        } catch (e) {
          console.error("Auth failed:", e);
          // Fallback for dev/testing if needed
          if (tgUser.id === 414153884) {
            setUser({ id: 414153884, is_admin: true, is_premium: true });
          }
        }
      } else {
        // Dev fallback
        // setUser({ id: 414153884, is_admin: true, is_premium: true });
      }

      // 2. Load Data
      try {
        console.log("Loading data from storage...");
        // ... existing loading logic ...
        const tracks = await storage.getAllTracks();

        // 1. Set downloaded tracks (only those with audio)
        const downloadedIds = new Set(tracks.filter(t => t.isLocal).map(t => t.id));
        setDownloadedTracks(downloadedIds);

        // 2. Hydrate allTracks with loaded tracks (merging with mocks/defaults)
        setAllTracks(prev => {
          const loadedMap = new Map(tracks.map(t => [t.id, t]));
          // We want to keep MOCK_TRACKS but override them if we have a local version (e.g. with blob)
          // And append any new tracks from storage

          const merged = [...prev];
          // Update existing
          for (let i = 0; i < merged.length; i++) {
            if (loadedMap.has(merged[i].id)) {
              merged[i] = loadedMap.get(merged[i].id)!;
              loadedMap.delete(merged[i].id);
            }
          }
          // Add remaining (new) tracks
          return [...merged, ...Array.from(loadedMap.values())];
        });

        const savedPlaylists = await storage.getAllPlaylists();
        const loadedFavorites = await storage.getFavorites();
        const loadedFavoriteRadios = await storage.getFavoriteRadios();

        setFavorites(loadedFavorites);
        setFavoriteRadios(new Set(loadedFavoriteRadios));

        if (savedPlaylists.length > 0) {
          setPlaylists(prev => {
            const defaultIds = new Set(INITIAL_PLAYLISTS.map(p => p.id));
            const newPlaylists = savedPlaylists
              .filter(p => !defaultIds.has(p.id))
              .map(p => {
                if (p.coverBlob) {
                  return { ...p, coverUrl: URL.createObjectURL(p.coverBlob) };
                }
                return p;
              });
            return [...INITIAL_PLAYLISTS, ...newPlaylists];
          });
        }
      } catch (e) {
        console.error("Failed to load data:", e);
      }
    };

    init();
  }, []);

  // Инициализация аудио элемента
  useEffect(() => {
    audioRef.current = new Audio();

    const audio = audioRef.current;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      const currentRepeatMode = repeatModeRef.current;
      const currentQueue = queueRef.current;
      const currentTrackVal = currentTrackRef.current;
      const isShuffleVal = isShuffleRef.current;
      const audio = audioRef.current;

      if (!audio) return;

      if (currentRepeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(e => console.error("Repeat play error:", e));
        return; // Important: return here to prevent other logic
      }

      // Logic from nextTrack, but using refs
      if (!currentTrackVal || currentQueue.length === 0) return;

      if (isShuffleVal) {
        const randomIndex = Math.floor(Math.random() * currentQueue.length);
        const nextTrack = currentQueue[randomIndex];
        setCurrentTrack(nextTrack);
        setCurrentRadio(null);
        setIsRadioMode(false);
        setIsPlaying(true);
        return;
      }

      const currentIndex = currentQueue.findIndex(t => t.id === currentTrackVal.id);
      if (currentIndex < currentQueue.length - 1) {
        const nextTrack = currentQueue[currentIndex + 1];
        setCurrentTrack(nextTrack);
        setCurrentRadio(null);
        setIsRadioMode(false);
        setIsPlaying(true);
      } else if (currentRepeatMode === 'all') {
        const nextTrack = currentQueue[0];
        setCurrentTrack(nextTrack);
        setCurrentRadio(null);
        setIsRadioMode(false);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        audio.currentTime = 0;
      }
    };
    const handleError = (e: Event) => {
      console.error("Audio error:", e);
      // Можно добавить логику пропуска трека при ошибке
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Remove repeatMode from dependencies!

  // Управление воспроизведением при смене трека
  // Track if current track is downloaded (to avoid re-triggering when other tracks are downloaded)
  const isCurrentTrackDownloaded = currentTrack ? downloadedTracks.has(currentTrack.id) : false;

  const previousTrackIdRef = useRef<string | null>(null);

  const blobUrlCache = useRef<Map<string, string>>(new Map());

  // ... (existing code)

  useEffect(() => {
    const playAudio = async () => {
      if (currentTrack && audioRef.current) {
        try {
          let src = currentTrack.audioUrl;
          let isLocal = false;

          // 1. Check Cache first (Synchronous)
          if (blobUrlCache.current.has(currentTrack.id)) {
            src = blobUrlCache.current.get(currentTrack.id)!;
            isLocal = true;
            console.log("Playing from blob cache:", currentTrack.title);
          }
          // 2. Fallback to Async DB load if downloaded but not cached
          else if (isCurrentTrackDownloaded) {
            try {
              const savedTrack = await storage.getTrack(currentTrack.id);
              if (savedTrack && savedTrack.audioBlob) {
                const blobUrl = URL.createObjectURL(savedTrack.audioBlob);
                blobUrlCache.current.set(currentTrack.id, blobUrl); // Cache it
                src = blobUrl;
                isLocal = true;
                console.log("Playing from local storage (async):", currentTrack.title);

                if (savedTrack.coverBlob) {
                  const coverUrl = URL.createObjectURL(savedTrack.coverBlob);
                  currentTrack.coverUrl = coverUrl;
                }
              }
            } catch (e) {
              console.error("Error loading local track:", e);
              src = currentTrack.audioUrl;
            }
          }

          if (audioRef.current.src !== src) {
            const wasPlaying = isPlaying;
            const savedTime = audioRef.current.currentTime || 0;
            const isSameTrack = previousTrackIdRef.current === currentTrack.id;

            if (!isSameTrack) {
              setDuration(0);
              setCurrentTime(0);
            }

            // Revoke old blob if it's not in cache (or manage cache cleanup separately)
            // For now, we rely on cache cleanup logic or browser GC for simple blobs
            // But we should be careful not to revoke what's in cache

            audioRef.current.src = src;
            audioRef.current.load();

            if (isSameTrack && savedTime > 0) {
              audioRef.current.currentTime = savedTime;
            } else {
              audioRef.current.currentTime = 0;
            }

            if (wasPlaying) {
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch(e => {
                  console.error("Play error (auto-play):", e);
                });
              }
            }
          }

          previousTrackIdRef.current = currentTrack.id;

        } catch (e) {
          console.error("Play setup error:", e);
        }
      }
    };

    playAudio();
  }, [currentTrack, isCurrentTrackDownloaded]);

  // ... (existing code)

  // Pre-fetch effect (Network + Blobs)
  useEffect(() => {
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);

    // 1. Pre-load Blobs for next 3 tracks
    const preloadBlobs = async () => {
      for (let i = 1; i <= 3; i++) {
        const nextTrack = queue[currentIndex + i];
        if (nextTrack && downloadedTracks.has(nextTrack.id) && !blobUrlCache.current.has(nextTrack.id)) {
          try {
            const saved = await storage.getTrack(nextTrack.id);
            if (saved?.audioBlob) {
              const url = URL.createObjectURL(saved.audioBlob);
              blobUrlCache.current.set(nextTrack.id, url);
              console.log("Pre-loaded blob for:", nextTrack.title);
            }
          } catch (e) {
            console.warn("Failed to pre-load blob:", e);
          }
        }
      }
    };
    preloadBlobs();

    // 2. Load more tracks from API if needed
    const tracksRemaining = queue.length - 1 - currentIndex;
    if (tracksRemaining < 3) {
      loadMoreTracks();
    }

    // 3. Cleanup old cache entries (optional, keep last 5?)
    // Simple cleanup: remove tracks far behind
    if (currentIndex > 5) {
      const trackToRemove = queue[currentIndex - 5];
      if (blobUrlCache.current.has(trackToRemove.id)) {
        URL.revokeObjectURL(blobUrlCache.current.get(trackToRemove.id)!);
        blobUrlCache.current.delete(trackToRemove.id);
      }
    }

  }, [currentTrack, queue, downloadedTracks]);

  // Управление play/pause
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Play error:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const playTrack = (track: Track, newQueue?: Track[]) => {
    if (newQueue) {
      setQueue(newQueue);
    }
    setCurrentTrack(track);
    setCurrentRadio(null);
    setIsRadioMode(false);
    setIsPlaying(true);
  };

  const playRadio = (station: RadioStation) => {
    setCurrentRadio(station);
    setCurrentTrack(null);
    setIsRadioMode(true);
    setIsPlaying(true);

    // Set audio source directly for radio
    if (audioRef.current) {
      audioRef.current.src = station.url;
      audioRef.current.load();
      audioRef.current.play().catch(e => console.error("Radio play error:", e));
    }
  };

  const togglePlay = () => setIsPlaying(!isPlaying);



  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Media Session API integration
  useEffect(() => {
    if ('mediaSession' in navigator) {
      if (currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: 'TG Music Player',
          artwork: [
            { src: currentTrack.coverUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: currentTrack.coverUrl, sizes: '128x128', type: 'image/jpeg' },
            { src: currentTrack.coverUrl, sizes: '192x192', type: 'image/jpeg' },
            { src: currentTrack.coverUrl, sizes: '256x256', type: 'image/jpeg' },
            { src: currentTrack.coverUrl, sizes: '384x384', type: 'image/jpeg' },
            { src: currentTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' },
          ]
        });
      } else if (currentRadio) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentRadio.name,
          artist: currentRadio.genre,
          album: 'Radio',
          artwork: [
            { src: currentRadio.image, sizes: '96x96', type: 'image/jpeg' },
            { src: currentRadio.image, sizes: '128x128', type: 'image/jpeg' },
            { src: currentRadio.image, sizes: '192x192', type: 'image/jpeg' },
            { src: currentRadio.image, sizes: '256x256', type: 'image/jpeg' },
            { src: currentRadio.image, sizes: '384x384', type: 'image/jpeg' },
            { src: currentRadio.image, sizes: '512x512', type: 'image/jpeg' },
          ]
        });
      }

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seek(details.seekTime);
        }
      });
    }
  }, [currentTrack, currentRadio]); // Update metadata when track changes

  // Update playback state for Media Session
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  const addTrack = (track: Track) => {
    setAllTracks(prev => [track, ...prev]);
    setQueue(prev => [track, ...prev]);
  };

  const createPlaylist = (name: string, coverFile?: File) => {
    const newPlaylist: Playlist = {
      id: Date.now().toString(),
      name,
      coverUrl: coverFile
        ? URL.createObjectURL(coverFile)
        : `https://picsum.photos/400/400?random=${Date.now()}`,
      trackIds: []
    };
    setPlaylists(prev => [...prev, newPlaylist]);
    storage.savePlaylist(newPlaylist, coverFile).catch(err => {
      console.error("Failed to save playlist:", err);
      // Revert state if save fails? Or just notify user
      if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({ message: "Ошибка при сохранении плейлиста" });
      } else {
        console.error("Ошибка при сохранении плейлиста");
      }
    });
  };

  const addToPlaylist = async (playlistId: string, track: Track) => {
    // 0. Сохраняем метаданные трека в БД, если его там нет (чтобы он не пропал при перезагрузке)
    try {
      const existing = await storage.getTrack(track.id);
      if (!existing) {
        // Save without audio blob (metadata only)
        await storage.saveTrack(track);
      }
    } catch (e) {
      console.error("Failed to save track metadata:", e);
    }

    // 1. Добавляем трек в общий список, если его там нет
    setAllTracks(prev => {
      if (!prev.some(t => t.id === track.id)) {
        return [...prev, track];
      }
      return prev;
    });

    // 2. Добавляем ID трека в плейлист
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId && !pl.trackIds.includes(track.id)) {
        const updatedPlaylist = { ...pl, trackIds: [...pl.trackIds, track.id] };
        storage.updatePlaylist(updatedPlaylist).catch(err => console.error("Failed to update playlist:", err));
        return updatedPlaylist;
      }
      return pl;
    }));
  };

  const deletePlaylist = async (id: string) => {
    try {
      await storage.deletePlaylist(id);
      setPlaylists(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error("Failed to delete playlist:", e);
    }
  };

  const removeFromPlaylist = async (playlistId: string, trackId: string) => {
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        const updatedPlaylist = { ...pl, trackIds: pl.trackIds.filter(id => id !== trackId) };
        storage.updatePlaylist(updatedPlaylist).catch(err => console.error("Failed to update playlist:", err));
        return updatedPlaylist;
      }
      return pl;
    }));
  };

  const updatePlaylist = async (playlist: Playlist, coverBlob?: Blob) => {
    try {
      await storage.savePlaylist(playlist, coverBlob); // savePlaylist handles update logic
      setPlaylists(prev => prev.map(p => {
        if (p.id === playlist.id) {
          // If we have a new blob, we should update the URL in state
          if (coverBlob) {
            return { ...playlist, coverUrl: URL.createObjectURL(coverBlob) };
          }
          return playlist;
        }
        return p;
      }));
    } catch (e) {
      console.error("Failed to update playlist:", e);
    }
  };

  const [downloadQueue, setDownloadQueue] = useState<Track[]>([]);

  const toggleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);

  const processDownload = async (track: Track) => {
    try {
      setIsDownloading(track.id);
      console.log("Downloading track:", track.title);

      // 1. Скачиваем аудио
      const audioResponse = await fetch(track.audioUrl);
      if (!audioResponse.ok) throw new Error('Audio download failed');
      const audioBlob = await audioResponse.blob();

      // 2. Скачиваем обложку (если есть)
      let coverBlob: Blob | undefined;
      if (track.coverUrl && !track.coverUrl.includes('ui-avatars.com')) {
        try {
          const coverResponse = await fetch(track.coverUrl);
          if (coverResponse.ok) {
            coverBlob = await coverResponse.blob();
          }
        } catch (e) {
          console.warn("Failed to download cover:", e);
        }
      }

      // 3. Сохраняем всё в базу
      await storage.saveTrack(track, audioBlob, coverBlob);

      setDownloadedTracks(prev => new Set(prev).add(track.id));
      setDownloadQueue(prev => prev.slice(1));
    } catch (e) {
      console.error("Download failed:", e);
      setDownloadQueue(prev => prev.slice(1));
    } finally {
      setIsDownloading(null);
    }
  };

  // Queue processor
  useEffect(() => {
    if (!isDownloading && downloadQueue.length > 0) {
      const nextTrack = downloadQueue[0];
      setDownloadQueue(prev => prev.slice(1));
      processDownload(nextTrack);
    }
  }, [isDownloading, downloadQueue]);

  const downloadTrack = async (track: Track) => {
    // Check if already downloaded
    if (downloadedTracks.has(track.id)) return;

    // Check if already in queue
    setDownloadQueue(prev => {
      if (prev.some(t => t.id === track.id)) return prev;
      return [...prev, track];
    });
  };

  const removeDownloadedTrack = async (trackId: string) => {
    try {
      await storage.deleteTrack(trackId);
      setDownloadedTracks(prev => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    } catch (e) {
      console.error("Remove download error:", e);
    }
  };

  return (
    <PlayerContext.Provider value={{
      allTracks,
      playlists,
      currentTrack,
      currentRadio,
      isRadioMode,
      isPlaying,
      currentTime,
      duration,
      repeatMode,
      queue,
      downloadedTracks,
      isDownloading,
      isShuffle,
      playTrack,
      playRadio,
      togglePlay,
      nextTrack,
      prevTrack,
      seek,
      addTrack,
      createPlaylist,
      addToPlaylist,
      toggleRepeat,
      toggleShuffle,
      downloadTrack,
      removeDownloadedTrack,
      deletePlaylist,
      removeFromPlaylist,
      updatePlaylist,
      searchState,
      setSearchState,
      resetSearch,
      user,
      favorites,
      toggleFavorite,
      favoriteRadios,
      toggleFavoriteRadio,
      markTrackAsDownloaded
    }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
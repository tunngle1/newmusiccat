import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Track, Playlist, RepeatMode, RadioStation, User } from '../types';
import { MOCK_TRACKS, INITIAL_PLAYLISTS, API_BASE_URL } from '../constants';

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
    isArtistSearch: boolean;
    genreId: number | null; // New field
  };
  setSearchState: React.Dispatch<React.SetStateAction<{
    query: string;
    results: Track[];
    isSearching: boolean;
    error: string | null;
    page: number;
    hasMore: boolean;
    isArtistSearch: boolean;
    genreId: number | null;
  }>>;
  resetSearch: () => void;
  // User State
  user: User | null;
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

  // Search State
  const [searchState, setSearchState] = useState({
    query: '',
    results: [] as Track[],
    isSearching: false,
    error: null as string | null,
    page: 1,
    hasMore: true,
    isArtistSearch: false,
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
      isArtistSearch: false,
      genreId: null
    });
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);
  const repeatModeRef = useRef(repeatMode);
  const isShuffleRef = useRef(isShuffle);

  // Sync refs with state
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);

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
        audio.play();
      } else {
        // Logic from nextTrack, but using refs
        if (!currentTrackVal || currentQueue.length === 0) return;

        if (isShuffleVal) {
          const randomIndex = Math.floor(Math.random() * currentQueue.length);
          // We can't call playTrack directly because it's not in ref, but we can call the function from scope?
          // Yes, playTrack is stable? No, playTrack depends on state setters.
          // But handleEnded is created ONCE. playTrack is recreated.
          // So we CANNOT call playTrack from here if we want fresh closure.
          // We need to trigger next track via state update or something.
          // Actually, we can just call setQueue/setCurrentTrack directly?
          // Or better: use a ref for playTrack?
          // Or just emit an event?

          // Let's use a workaround: call a method that is updated in a ref?
          // Or just duplicate logic:
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

  useEffect(() => {
    const playAudio = async () => {
      if (currentTrack && audioRef.current) {
        try {
          let src = currentTrack.audioUrl;

          // Проверяем, скачан ли трек
          if (isCurrentTrackDownloaded) {
            try {
              const savedTrack = await storage.getTrack(currentTrack.id);
              if (savedTrack && savedTrack.audioBlob) {
                src = URL.createObjectURL(savedTrack.audioBlob);
                console.log("Playing from local storage:", currentTrack.title);

                // Если есть сохраненная обложка, обновляем её в текущем треке для отображения
                if (savedTrack.coverBlob) {
                  const coverUrl = URL.createObjectURL(savedTrack.coverBlob);
                  currentTrack.coverUrl = coverUrl;
                }
              }
            } catch (e) {
              console.error("Error loading local track:", e);
              // Fallback to network URL if local load fails
              src = currentTrack.audioUrl;
            }
          }

          if (audioRef.current.src !== src) {
            // Save current playback position and playing state
            const wasPlaying = isPlaying;
            const savedTime = audioRef.current.currentTime || 0;

            // Check if we are switching sources for the SAME track
            const isSameTrack = previousTrackIdRef.current === currentTrack.id;

            // Reset time ONLY if it's a new track
            if (!isSameTrack) {
              setDuration(0);
              setCurrentTime(0);
            }

            // Освобождаем старый URL если это был blob
            if (audioRef.current.src.startsWith('blob:')) {
              URL.revokeObjectURL(audioRef.current.src);
            }

            audioRef.current.src = src;
            audioRef.current.load(); // Явно загружаем новый источник

            // Restore playback position ONLY if it's the same track (switching source)
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
                  // Если ошибка NotSupportedError, возможно blob битый или формат не тот
                });
              }
            }
          }

          // Update previous track ID
          previousTrackIdRef.current = currentTrack.id;

        } catch (e) {
          console.error("Play setup error:", e);
        }
      }
    };

    playAudio();
  }, [currentTrack, isCurrentTrackDownloaded]);

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

  const nextTrack = () => {
    if (!currentTrack || queue.length === 0) return;

    if (isShuffle) {
      // Random track logic
      const randomIndex = Math.floor(Math.random() * queue.length);
      playTrack(queue[randomIndex]);
      return;
    }

    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);

    if (currentIndex < queue.length - 1) {
      playTrack(queue[currentIndex + 1]);
    } else if (repeatMode === 'all') {
      playTrack(queue[0]);
    } else {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  };

  const prevTrack = () => {
    if (!currentTrack || queue.length === 0) return;
    const audio = audioRef.current;

    // Если прошло более 3 секунд, возвращаемся в начало трека
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
      playTrack(queue[currentIndex - 1]);
    } else {
      playTrack(queue[queue.length - 1]); // Loop back to last
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

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

  const toggleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);

  const downloadTrack = async (track: Track) => {
    if (downloadedTracks.has(track.id) || isDownloading) return;

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
      console.log("Track downloaded successfully");

      // Haptic feedback
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (e) {
      console.error("Download error:", e);
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
    } finally {
      setIsDownloading(null);
    }
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
      user
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
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Track, Playlist, RepeatMode } from '../types';
import { MOCK_TRACKS, INITIAL_PLAYLISTS } from '../constants';

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

  // Search
  searchState: {
    query: string;
    results: Track[];
    isSearching: boolean;
    page: number;
    hasMore: boolean;
  };
  setSearchState: React.Dispatch<React.SetStateAction<{
    query: string;
    results: Track[];
    isSearching: boolean;
    page: number;
    hasMore: boolean;
  }>>;
  resetSearch: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

import { storage } from '../utils/storage';

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [allTracks, setAllTracks] = useState<Track[]>(MOCK_TRACKS);
  const [playlists, setPlaylists] = useState<Playlist[]>(INITIAL_PLAYLISTS);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>(MOCK_TRACKS);
  const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set());

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
    page: 1,
    hasMore: true
  });

  const resetSearch = () => {
    setSearchState({
      query: '',
      results: [],
      isSearching: false,
      page: 1,
      hasMore: true
    });
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Загрузка скачанных треков и плейлистов при старте
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log("Loading data from storage...");

        // Загрузка треков
        try {
          const tracks = await storage.getAllTracks();
          const ids = new Set(tracks.map(t => t.id));
          setDownloadedTracks(ids);
          console.log(`Loaded ${tracks.length} tracks`);
        } catch (e) {
          console.error("Failed to load tracks:", e);
        }

        // Загрузка плейлистов
        try {
          const savedPlaylists = await storage.getAllPlaylists();
          console.log(`Loaded ${savedPlaylists.length} playlists`);

          if (savedPlaylists.length > 0) {
            setPlaylists(prev => {
              // Объединяем дефолтные и сохраненные, избегая дубликатов по ID
              const defaultIds = new Set(INITIAL_PLAYLISTS.map(p => p.id));
              const newPlaylists = savedPlaylists.filter(p => !defaultIds.has(p.id));
              return [...INITIAL_PLAYLISTS, ...newPlaylists];
            });
          }
        } catch (e) {
          console.error("Failed to load playlists:", e);
        }
      } catch (e) {
        console.error("Critical error loading data:", e);
      }
    };
    loadData();
  }, []);

  // Инициализация аудио элемента
  useEffect(() => {
    audioRef.current = new Audio();

    const audio = audioRef.current;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        nextTrack();
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
  }, [repeatMode]);

  // Управление воспроизведением при смене трека
  useEffect(() => {
    const playAudio = async () => {
      if (currentTrack && audioRef.current) {
        try {
          // Сбрасываем состояние при смене трека, чтобы не показывать данные предыдущего
          // Но только если это действительно новый трек (проверка по ID или src не поможет, так как мы еще не знаем src)
          // Лучше делать это при установке нового src

          let src = currentTrack.audioUrl;

          // Проверяем, скачан ли трек
          if (downloadedTracks.has(currentTrack.id)) {
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
            // Сбрасываем длительность пока грузится новый трек
            setDuration(0);
            setCurrentTime(0);

            // Освобождаем старый URL если это был blob
            if (audioRef.current.src.startsWith('blob:')) {
              URL.revokeObjectURL(audioRef.current.src);
            }

            audioRef.current.src = src;
            audioRef.current.load(); // Явно загружаем новый источник

            if (isPlaying) {
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch(e => {
                  console.error("Play error (auto-play):", e);
                  // Если ошибка NotSupportedError, возможно blob битый или формат не тот
                });
              }
            }
          }
        } catch (e) {
          console.error("Play setup error:", e);
        }
      }
    };

    playAudio();
  }, [currentTrack, downloadedTracks]);

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
    setIsPlaying(true);
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
    storage.savePlaylist(newPlaylist); // Сохраняем в БД
  };

  const addToPlaylist = (playlistId: string, track: Track) => {
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
        storage.updatePlaylist(updatedPlaylist); // Обновляем в БД
        return updatedPlaylist;
      }
      return pl;
    }));
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
      isPlaying,
      currentTime,
      duration,
      repeatMode,
      queue,
      downloadedTracks,
      isDownloading,
      isShuffle,
      playTrack,
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
      searchState,
      setSearchState,
      resetSearch
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
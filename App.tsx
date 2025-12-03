import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { NotificationProvider } from './context/NotificationContext';
import InstallPrompt from './components/InstallPrompt';
import SubscriptionBlocker from './components/SubscriptionBlocker';
import {
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  SkipBackIcon,
  SearchIcon,
  HomeIcon,
  PlaylistIcon,
  HeartIcon,
  RadioIcon,
  LibraryIcon,
  DownloadIcon,
  SendIcon,
  YoutubeIcon,
  CheckIcon,
  MenuIcon,
  CloseIcon,
  StarIcon,
  UsersIcon,
  LockIcon,
  PlusIcon,
  ChartIcon,
  CopyIcon,
  ChevronDownIcon,
  RepeatIcon,
  ShuffleIcon,
  LyricsIcon
} from './components/newdesign/Icons';
import { ArrowUpRight } from 'lucide-react';
import { Visualizer } from './components/newdesign/Visualizer';
import MarqueeText from './components/MarqueeText';
import ArtistSelectorModal from './components/ArtistSelectorModal';
import { Track, Playlist, UserStats, UserListItem, ActivityStat, ViewState, SearchMode } from './types';
import { formatDuration, searchTracks, getGenreTracks, getLyrics as getLyricsApi, getRadioStations } from './utils/api';
import { initTelegramWebApp } from './utils/telegram';
import { API_BASE_URL } from './constants';
import AdminView from './views/AdminView';

import SubscriptionView from './views/SubscriptionView';
import { fetchLyrics } from './utils/lyricsClient';

const PRESET_GENRES = [
  { name: 'HIP-HOP', genreId: 3, seed: 'hiphop' },
  { name: 'POP', genreId: 2, seed: 'pop' },
  { name: 'ROCK', genreId: 6, seed: 'rock' },
  { name: 'INDIE ROCK', genreId: 7, seed: 'indierock' },
  { name: 'ELECTRONIC', genreId: 8, seed: 'electronic' },
  { name: 'DANCE', genreId: 11, seed: 'dance' },
  { name: 'ALTERNATIVE', genreId: 7, seed: 'alternative' },
  { name: 'CLASSIC', genreId: 28, seed: 'classic' },
  { name: 'JAZZ', genreId: 39, seed: 'jazz' },
  { name: 'BLUES', genreId: 17, seed: 'blues' }
];

type MenuView = 'main' | 'subscription' | 'referrals' | 'admin';
type AdminTab = 'stats' | 'users' | 'activity' | 'broadcast';

const formatSeconds = (seconds: number | undefined) => {
  if (seconds === undefined || Number.isNaN(seconds)) return '0:00';
  return formatDuration(Math.max(0, Math.floor(seconds)));
};

const getCover = (track?: Track | null) =>
  track?.coverUrl || 'https://picsum.photos/seed/tg-music/400/400';

const MenuButton: React.FC<{ icon: React.FC<{ className?: string }>; label: string; onClick?: () => void }> = ({
  icon: Icon,
  label,
  onClick
}) => (
  <button
    onClick={onClick}
    className="flex items-center justify-between w-full px-6 py-4 border-b border-lebedev-white/20 hover:bg-lebedev-white/5 transition-colors"
  >
    <div className="flex items-center gap-3">
      <Icon className="w-6 h-6" />
      <span className="text-lg font-black uppercase tracking-wider">{label}</span>
    </div>
    <ChevronDownIcon className="w-5 h-5 rotate-90 text-lebedev-gray" />
  </button>
);

const NewDesignApp: React.FC = () => {
  const {
    allTracks,
    playlists,
    currentTrack,
    currentRadio,
    isRadioMode,
    isPlaying,
    playRadio,
    togglePlay,
    nextTrack,
    prevTrack,
    playTrack,
    duration,
    currentTime,
    seek,
    repeatMode,
    isShuffle,
    toggleRepeat,
    toggleShuffle,
    downloadTrack,
    downloadedTracks,
    downloadProgress,
    downloadQueue,
    downloadToChat,
    downloadToChatQueue,
    isDownloadingToChat,
    addToPlaylist,
    removeFromPlaylist,
    updatePlaylist,
    deletePlaylist,
    createPlaylist,
    searchState,
    setSearchState,
    user,
    refreshSubscriptionStatus,
    favorites,
    toggleFavorite,
    favoriteRadios,
    toggleFavoriteRadio
  } = usePlayer();

  const [activeTab, setActiveTab] = useState<ViewState>(ViewState.HOME);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'subscription' | 'referrals'>('main');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [isCoverColor, setIsCoverColor] = useState(false);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [isLoadMoreLoading, setIsLoadMoreLoading] = useState(false);
  const [playlistSelectionTrack, setPlaylistSelectionTrack] = useState<Track | null>(null);
  const [moveFromPlaylistId, setMoveFromPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isPlaylistEditOpen, setIsPlaylistEditOpen] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [newPlaylistCover, setNewPlaylistCover] = useState<File | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editPlaylistTitle, setEditPlaylistTitle] = useState('');
  const [editPlaylistCover, setEditPlaylistCover] = useState<File | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [lyricsTrackId, setLyricsTrackId] = useState<string | null>(null);
  const [showArtistSelector, setShowArtistSelector] = useState(false);
  const [artistOptions, setArtistOptions] = useState<string[]>([]);
  const [radioStations, setRadioStations] = useState<any[]>([]);
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Restore YouTube state variables
  const [youtubeLink, setYoutubeLink] = useState('');
  const [youtubeTrack, setYoutubeTrack] = useState<Track | null>(null);
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);

  const handleSelectArtist = (artistName: string) => {
    setShowArtistSelector(false);
    setSearchState(prev => ({
      ...prev,
      query: artistName,
      searchMode: 'artist',
      results: [],
      isSearching: true,
      page: 1,
      hasMore: true,
      error: null
    }));
    setIsPlayerOpen(false);
    setActiveTab(ViewState.HOME);
  };

  const toastTimeout = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const allTracksSafe = allTracks;
  const safeTrack: Track | null = currentTrack || searchState.results[0] || null;
  const miniTrack = currentTrack;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const hasAccess = user?.subscription_status?.has_access ?? true;

  const libraryTracks = useMemo(
    () => {
      const downloaded = allTracksSafe.filter((t) => downloadedTracks.has(t.id));
      // Add queued tracks that aren't already downloaded
      const queued = downloadQueue.filter(t => !downloadedTracks.has(t.id));
      // Show queued first, then downloaded (reversed to show newest first)
      return [...queued, ...downloaded.reverse()];
    },
    [allTracksSafe, downloadedTracks, downloadQueue]
  );

  const popularTracks = useMemo(() => allTracksSafe.slice(0, 6), [allTracksSafe]);

  // Add styles for jumping dots animation
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes pulse-red {
        0%, 100% { opacity: 0.4; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      .jumping-dot {
        animation: pulse-red 1s infinite;
        background-color: #ef4444;
        border-radius: 50%;
        width: 4px;
        height: 4px;
      }
      .jumping-dot:nth-child(2) { animation-delay: 0.2s; }
      .jumping-dot:nth-child(3) { animation-delay: 0.4s; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const genres = useMemo(() => {
    const values = allTracksSafe
      .map((t) => {
        const genre = (t as any).genre as string | undefined;
        return genre ? { name: genre, genreId: null, seed: genre } : null;
      })
      .filter(Boolean) as { name: string; genreId: number | null; seed: string }[];
    const uniqueNames = Array.from(new Set(values.map(v => v.name)));
    if (uniqueNames.length === 0) return PRESET_GENRES;

    return uniqueNames.map((name) => ({
      name,
      genreId: null,
      seed: name
    }));
  }, [allTracksSafe]);

  useEffect(() => {
    setShowLyrics(false);
    setLyricsText(null);
    setLyricsError(null);
    setLyricsLoading(false);
    setLyricsTrackId(null);
  }, [safeTrack?.id]);

  useEffect(() => {
    const pl = playlists.find(p => p.id === selectedPlaylistId);
    setEditPlaylistTitle(pl?.name || '');
    setEditPlaylistCover(null);
    setIsPlaylistEditOpen(false);
  }, [selectedPlaylistId, playlists]);

  useEffect(() => {
    if (activeTab !== ViewState.RADIO || radioStations.length > 0 || radioLoading) return;
    setRadioLoading(true);
    setRadioError(null);
    getRadioStations()
      .then(setRadioStations)
      .catch((e) => setRadioError((e as Error).message || 'Не удалось загрузить радиостанции'))
      .finally(() => setRadioLoading(false));
  }, [activeTab, radioStations.length, radioLoading]);

  const handleArtistClick = () => {
    if (!safeTrack) return;
    const artists = safeTrack.artist.split(',').map(a => a.trim()).filter(Boolean);
    if (artists.length <= 1) {
      const name = artists[0] || safeTrack.artist;
      setSearchState(prev => ({
        ...prev,
        query: name,
        searchMode: 'artist',
        results: [],
        isSearching: true,
        page: 1,
        hasMore: true,
        error: null
      }));
      setIsPlayerOpen(false);
      setActiveTab(ViewState.HOME);
    } else {
      setArtistOptions(artists);
      setShowArtistSelector(true);
    }
  };

  const loadMoreSearch = async () => {
    const query = searchState.query.trim();
    const mode = searchState.searchMode as SearchMode;
    // Allow loading more if there is a query OR a genreId
    if ((!query && !searchState.genreId) || searchState.isSearching || !searchState.hasMore) return;

    const nextPage = (searchState.page || 1) + 1;
    setIsLoadMoreLoading(true);
    setSearchState(prev => ({ ...prev, isSearching: true }));

    try {
      let newResults: Track[] = [];
      if (searchState.genreId) {
        newResults = await getGenreTracks(searchState.genreId, 20, nextPage);
      } else {
        newResults = await searchTracks(query, 20, nextPage, mode);
      }

      setSearchState(prev => {
        // If query changed or genre changed while loading, discard
        if ((query && prev.query.trim() !== query) || (!query && prev.genreId !== searchState.genreId)) {
          return prev;
        }

        const combined = [...prev.results, ...newResults];
        const unique = combined.filter(
          (track, idx, arr) => arr.findIndex((t) => t.title === track.title && t.artist === track.artist) === idx
        );
        return {
          ...prev,
          results: unique,
          isSearching: false,
          page: nextPage,
          hasMore: newResults.length > 0
        };
      });
    } catch (e) {
      setSearchState(prev => ({ ...prev, isSearching: false, error: (e as Error).message || 'Ошибка загрузки' }));
    } finally {
      setIsLoadMoreLoading(false);
    }
  };

  useEffect(() => {
    if (!currentTrack) return;
    setRecentTracks((prev) => {
      // если тот же самый трек уже первый — не дублируем
      if (prev[0]?.id === currentTrack.id) return prev;
      const next = [currentTrack, ...prev.filter((t) => t.id !== currentTrack.id)];
      return next.slice(0, 5);
    });
  }, [currentTrack?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeout.current) {
      clearTimeout(toastTimeout.current);
    }
    toastTimeout.current = window.setTimeout(() => setToastMessage(null), 2600);
  };

  useEffect(() => {
    initTelegramWebApp();

    const handleReferral = async () => {
      if (!user) return;
      const initData = window.Telegram?.WebApp?.initDataUnsafe;
      const startParam = (initData as any)?.start_param;
      if (startParam && startParam.startsWith('REF')) {
        try {
          await fetch(`${API_BASE_URL} /api/referral / register ? user_id = ${user.id}& referral_code=${startParam} `, {
            method: 'POST'
          });
          showToast('Реферальная ссылка зарегистрирована');
        } catch (error) {
          console.error('Failed to register referral:', error);
        }
      }
    };

    handleReferral();
  }, [user]);

  useEffect(() => {
    if (isPlayerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isPlayerOpen]);

  useEffect(() => {
    const query = searchState.query.trim();
    const mode = searchState.searchMode as SearchMode;
    if (!query) {
      setSearchState((prev) => ({
        ...prev,
        results: [],
        isSearching: false,
        error: null,
        page: 1,
        hasMore: true
      }));
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      const run = async () => {
        setSearchState((prev) => ({ ...prev, isSearching: true, error: null, page: 1, results: [] }));
        try {
          const results = await searchTracks(query, 20, 1, mode, controller.signal);
          const unique = results.filter(
            (track, idx, arr) => arr.findIndex((t) => t.title === track.title && t.artist === track.artist) === idx
          );
          if (cancelled) return;
          setSearchState((prev) => ({
            ...prev,
            results: unique,
            isSearching: false,
            hasMore: results.length > 0,
            page: 1
          }));
        } catch (e: any) {
          if (cancelled || e?.name === 'AbortError') return;
          setSearchState((prev) => ({
            ...prev,
            isSearching: false,
            error: (e as Error).message || 'Ошибка поиска'
          }));
        }
      };
      run();
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      cancelled = true;
      controller.abort();
    };
  }, [searchState.query, searchState.searchMode, setSearchState]);

  // Keep focus on the search input when typing, even after re-render
  useEffect(() => {
    if (searchState.query && searchInputRef.current) {
      const input = searchInputRef.current;
      input.focus({ preventScroll: true });
      const len = searchState.query.length;
      input.setSelectionRange?.(len, len);
    }
  }, [searchState.query, searchState.searchMode]);

  const handleTrackSelect = (track: Track, queue?: Track[]) => {
    playTrack(track, queue || allTracksSafe);
  };

  const handleDownloadToApp = (track: Track) => {
    if (downloadedTracks.has(track.id)) return;
    downloadTrack(track);
    showToast('Скачиваю в приложение');
  };

  const handleDownloadToChat = (track: Track) => {
    downloadToChat(track);
    showToast('Отправляю в чат');
  };

  const handleAddToPlaylist = (playlistId: string) => {
    if (!playlistSelectionTrack) return;
    addToPlaylist(playlistId, playlistSelectionTrack);
    if (moveFromPlaylistId && moveFromPlaylistId !== playlistId) {
      removeFromPlaylist(moveFromPlaylistId, playlistSelectionTrack.id);
    }
    setPlaylistSelectionTrack(null);
    setMoveFromPlaylistId(null);
    showToast('Трек добавлен в плейлист');
  };

  const handleCreatePlaylist = () => {
    if (!newPlaylistTitle.trim()) return;
    createPlaylist(newPlaylistTitle.trim(), newPlaylistCover || undefined);
    setNewPlaylistTitle('');
    setNewPlaylistCover(null);
    setEditPlaylistCover(null);
    setIsCreatingPlaylist(false);
    showToast('Плейлист создан');
  };


  const handleUpdateSelectedPlaylist = async () => {
    if (!selectedPlaylistId) return;
    const current = playlists.find(p => p.id === selectedPlaylistId);
    if (!current) return;
    const updated = { ...current, name: editPlaylistTitle.trim() || current.name };
    await updatePlaylist(updated, editPlaylistCover || undefined);
    setEditPlaylistCover(null);
    setIsPlaylistEditOpen(false);
    showToast('Плейлист обновлен');
  };

  const handleDeleteSelectedPlaylist = async () => {
    if (!selectedPlaylistId) return;
    await deletePlaylist(selectedPlaylistId);
    setSelectedPlaylistId(null);
    setIsPlaylistEditOpen(false);
    showToast('Плейлист удален');
  };

  const renderRadio = () => {
    return (
      <div className="flex flex-col h-full">


        <div className="px-4 pb-4 space-y-4">
          {radioLoading && (
            <div className="text-center text-lebedev-gray uppercase font-bold tracking-widest">Загружаем станции...</div>
          )}
          {radioError && (
            <div className="text-center text-lebedev-red uppercase font-bold tracking-widest">{radioError}</div>
          )}
          {!radioLoading && !radioError && radioStations.length === 0 && (
            <div className="text-center text-lebedev-gray uppercase font-bold tracking-widest opacity-60">Станций нет</div>
          )}

          <div className="-mx-4 w-[calc(100%+32px)] divide-y divide-lebedev-white/20">
            {[...radioStations]
              .sort((a, b) => {
                const favA = favoriteRadios.has(a.id) ? 1 : 0;
                const favB = favoriteRadios.has(b.id) ? 1 : 0;
                return favB - favA;
              })
              .map((station, idx, arr) => {
                const isFav = favoriteRadios.has(station.id);
                const isActive = currentRadio?.id === station.id && isRadioMode;
                const isLast = idx === arr.length - 1;
                return (
                  <div
                    key={station.id}
                    className={`flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-lebedev-white/10 transition-colors border-b border-lebedev-white/20 ${isActive ? 'bg-lebedev-white/10' : ''
                      } ${isLast ? 'border-b-0' : ''}`}
                    onClick={() => {
                      if (isActive && isPlaying) {
                        togglePlay();
                      } else {
                        playRadio(station);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0 px-4">
                      <div className="flex flex-col min-w-0">
                        <div className="text-sm font-black uppercase truncate">{station.name}</div>
                        <div className="text-[11px] uppercase text-lebedev-gray truncate">{station.genre}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 min-w-[200px] justify-end">
                      <span className={`text-[11px] font-black uppercase min-w-[38px] text-center ${isActive && isPlaying ? 'text-[#ef4444]' : 'text-transparent'}`}>
                        Live
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteRadio(station.id);
                        }}
                        className={`p-2 rounded-full transition-colors shrink-0 ${isFav ? 'text-white' : 'text-lebedev-gray hover:text-white'}`}
                        title="Избранное радио"
                      >
                        <HeartIcon className={`w-4 h-4 ${isFav ? 'fill-white' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActive && isPlaying) {
                            togglePlay();
                          } else {
                            playRadio(station);
                          }
                        }}
                        className="px-3 py-1 text-[11px] font-bold uppercase bg-lebedev-white text-lebedev-black hover:bg-lebedev-red hover:text-white transition-colors min-w-[82px] text-center"
                      >
                        {isActive && isPlaying ? 'Пауза' : 'Слушать'}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText('https://t.me/your_bot?start=ref');
    showToast('Реферальная ссылка скопирована');
  };

  const handleYoutubeSearch = async () => {
    if (!youtubeLink.trim()) return;
    setIsYoutubeLoading(true);
    setYoutubeTrack(null);
    try {
      const response = await fetch(`${API_BASE_URL} /api/youtube / info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeLink })
      });
      if (!response.ok) throw new Error('Не удалось получить данные YouTube');
      const data = await response.json();
      const track: Track = {
        id: data.id,
        title: data.title,
        artist: data.artist,
        coverUrl: data.image,
        audioUrl: data.url,
        duration: data.duration ?? 0
      };
      setYoutubeTrack(track);
    } catch (e) {
      showToast((e as Error).message || 'Ошибка загрузки YouTube');
    } finally {
      setIsYoutubeLoading(false);
    }
  };

  const isTrackInChatQueue = (trackId: string) =>
    isDownloadingToChat === trackId || downloadToChatQueue.some((t) => t.id === trackId);

  const handleYoutubeDownload = (target: 'app' | 'chat') => {
    if (!youtubeTrack) return;
    if (target === 'app') {
      downloadTrack(youtubeTrack);
      showToast('Скачиваю в приложение');
    } else {
      if (isTrackInChatQueue(youtubeTrack.id)) return;
      downloadToChat(youtubeTrack);
      showToast('Отправляю в чат');
    }
    setYoutubeLink('');
    setYoutubeTrack(null);
  };

  const renderTrackItem = (track: Track, index: number, queue?: Track[], playlistContext?: { playlistId: string }) => {
    const isActive = safeTrack?.id === track.id;
    const isDownloaded = downloadedTracks.has(track.id);
    const progress = downloadProgress.get(track.id);
    const effectiveQueue = queue || allTracksSafe;
    const inPlaylist = Boolean(playlistContext?.playlistId);

    return (
      <div
        key={track.id}
        onClick={() => {
          if (isActive) {
            togglePlay();
          } else {
            handleTrackSelect(track, effectiveQueue);
          }
        }}
        className={`flex items-center justify-between p-4 cursor-pointer active:bg-lebedev-white/10 group relative ${isActive ? 'bg-lebedev-white text-lebedev-black' : 'bg-transparent text-lebedev-white'
          }`}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0 mr-2">
          <span className={`text-sm font-bold w-6 shrink-0 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="flex flex-col min-w-0">
            <span
              className={`text-lg font-black uppercase leading-tight truncate ${isActive ? 'text-lebedev-black' : 'text-lebedev-white'
                }`}
            >
              {track.title}
            </span>
            <span
              className="text-xs uppercase tracking-widest truncate"
              style={{ color: '#ef4444' }}
            >
              {track.artist}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="w-6 flex justify-center">{isActive ? <Visualizer isPlaying={isPlaying} /> : null}</div>
          <div className="flex items-center gap-2 justify-end flex-wrap">
            {!inPlaylist && activeTab !== ViewState.FAVORITES && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPlaylistSelectionTrack(track);
                  setMoveFromPlaylistId(null);
                }}
                className="p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors text-gray-200"
                title="Добавить в плейлист"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            )}
            {inPlaylist && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromPlaylist(playlistContext!.playlistId, track.id);
                    showToast('Трек удален из плейлиста');
                  }}
                  className="p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors text-gray-200"
                  title="Удалить из плейлиста"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
                {playlists.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaylistSelectionTrack(track);
                      setMoveFromPlaylistId(playlistContext!.playlistId);
                    }}
                    className="p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors text-gray-200"
                    title="Переместить в другой плейлист"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                  </button>
                )}
              </>
            )}
            {activeTab === ViewState.FAVORITES && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(track);
                }}
                className="p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors text-gray-200"
                title="Удалить из избранного"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadToChat(track);
              }}
              className="p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors text-gray-200"
              title="Отправить в чат"
            >
              <SendIcon className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadToApp(track);
              }}
              className="p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors text-gray-200"
              title="Скачать в приложение"
              disabled={isDownloaded || progress !== undefined}
            >
              {isDownloaded ? (
                <CheckIcon className="w-5 h-5 opacity-100" />
              ) : progress !== undefined ? (
                <div className="flex gap-0.5 items-center justify-center w-5 h-5">
                  <div className="w-1 h-1 bg-lebedev-red rounded-full jumping-dot"></div>
                  <div className="w-1 h-1 bg-lebedev-red rounded-full jumping-dot"></div>
                  <div className="w-1 h-1 bg-lebedev-red rounded-full jumping-dot"></div>
                </div>
              ) : (
                <DownloadIcon className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {progress !== undefined && (
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-lebedev-white/20">
            <div className="h-full bg-lebedev-red" style={{ width: `${progress}% ` }} />
          </div>
        )}
      </div>
    );
  };

  const renderHome = () => {
    const isSearching = Boolean(searchState.query.trim()) || Boolean(searchState.genreId);
    const searchResults = searchState.results;
    const baseTracks = allTracksSafe;
    const visibleTracks = isSearching ? searchResults : baseTracks;

    if (isSearching) {
      return (
        <>
          <div className="p-0 border-b-2 border-lebedev-white bg-lebedev-black shrink-0">
            <div className="relative group flex items-center">
              <div className="pl-4 text-lebedev-gray">
                <SearchIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                ref={searchInputRef}
                value={searchState.query}
                onChange={(e) =>
                  setSearchState((prev) => ({
                    ...prev,
                    query: e.target.value,
                    results: [],
                    page: 1,
                    hasMore: true
                  }))
                }
                placeholder="Искать..."
                className="w-full bg-transparent text-lg p-4 uppercase placeholder-lebedev-gray/40 focus:outline-none text-lebedev-white font-bold tracking-wide rounded-none"
              />
            </div>
            <div className="flex bg-lebedev-black">
              {[
                { id: 'all', label: 'Все' },
                { id: 'artist', label: 'Артист' },
                { id: 'track', label: 'Название' }
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() =>
                    setSearchState((prev) => ({
                      ...prev,
                      searchMode: mode.id as SearchMode,
                      results: [],
                      page: 1,
                      hasMore: true
                    }))
                  }
                  className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${searchState.searchMode === mode.id
                    ? 'text-white border-lebedev-red'
                    : 'text-lebedev-gray border-transparent hover:text-white hover:border-lebedev-white/30'
                    }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 divide-y divide-lebedev-white/20">
            {searchState.isSearching && searchState.results.length === 0 && (
              <div className="p-8 text-center text-lebedev-gray text-sm uppercase font-bold tracking-widest opacity-60">
                <span className="inline-flex items-center gap-2">
                  Поиск
                  <span className="loading-dots-bounce">
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                  </span>
                </span>
              </div>
            )}
            {searchState.error && (
              <div className="p-8 text-center text-lebedev-red text-sm uppercase font-bold tracking-widest opacity-80">
                {searchState.error}
              </div>
            )}
            {!searchState.isSearching && visibleTracks.length === 0 && (
              <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
                Ничего не найдено.
              </div>
            )}
            {visibleTracks.map((track, idx) => renderTrackItem(track, idx, visibleTracks))}

            {searchState.hasMore && visibleTracks.length > 0 && (
              <div className="p-6 text-center">
                <button
                  onClick={loadMoreSearch}
                  className="px-6 py-3 font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={searchState.isSearching || isLoadMoreLoading}
                  style={{ color: '#ef4444' }}
                >
                  {isLoadMoreLoading ? (
                    <span className="loading-dots">
                      <span className="loading-dot" />
                      <span className="loading-dot" />
                      <span className="loading-dot" />
                    </span>
                  ) : (
                    'Еще'
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      );
    }

    return (
      <div className="flex flex-col gap-8 pb-8">
        <div className="p-4 border-b border-lebedev-white bg-lebedev-black">
          <div className="relative group flex items-center bg-lebedev-white/10 p-2 border border-transparent hover:border-lebedev-white/30 transition-colors">
            <SearchIcon className="w-5 h-5 text-lebedev-gray ml-2" />
            <input
              type="text"
              ref={searchInputRef}
              value={searchState.query}
              onChange={(e) => {
                const val = e.target.value;
                setSearchState((prev) => ({ ...prev, query: val }));
              }}
              placeholder="Искать..."
              className="w-full bg-transparent p-2 uppercase placeholder-lebedev-gray/40 focus:outline-none text-lebedev-white font-bold"
            />
          </div>
        </div>

        {recentTracks.length > 0 && (
          <div>
            <div className="px-4 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 bg-lebedev-red animate-pulse" />
              <h2 className="text-xl font-black uppercase tracking-widest">История</h2>
            </div>
            <div
              className="flex overflow-x-auto gap-4 px-4 pb-4 snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {recentTracks.map((track) => (
                <div
                  key={`${track.id} -recent`}
                  onClick={() => handleTrackSelect(track, recentTracks)}
                  className="snap-start shrink-0 w-64 cursor-pointer group"
                >
                  <div className="aspect-square border-2 border-lebedev-white mb-3 relative overflow-hidden bg-lebedev-white/5">
                    <img
                      src={getCover(track)}
                      className={`w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} group-hover:grayscale-0 transition-all duration-500`}
                    />
                    <div className="absolute bottom-0 right-0 bg-lebedev-black text-white text-[10px] font-bold px-2 py-1 border-t border-l border-lebedev-white">
                      {formatSeconds(track.duration)}
                    </div>
                    <div className="absolute top-0 left-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-lebedev-red rounded-full p-2 text-white shadow-lg">
                        <PlayIcon className="w-4 h-4 fill-current" />
                      </div>
                    </div>
                  </div>
                  <h3 className="font-bold uppercase truncate text-lg leading-none mb-1 group-hover:text-lebedev-red transition-colors">
                    {track.title}
                  </h3>
                  <p className="text-xs uppercase truncate" style={{ color: '#ef4444' }}>{track.artist}</p>
                </div>
              ))}
              <div className="w-2 shrink-0" />
            </div>
          </div>
        )}

        {genres.length > 0 && (
          <div className="px-4">
            <h2 className="text-xl font-black uppercase tracking-widest mb-4 border-b border-lebedev-white/20 pb-2">Жанры</h2>
            <div className="grid grid-cols-2 gap-4">
              {genres.map((genre) => (
                <div
                  key={genre.name}
                  onClick={async () => {
                    setSelectedGenre(genre.name);
                    setSearchState(prev => ({
                      ...prev,
                      isSearching: true,
                      results: [],
                      genreId: genre.genreId || null,
                      page: 1,
                      error: null,
                      query: ''
                    }));

                    try {
                      const results = genre.genreId
                        ? await getGenreTracks(genre.genreId, 20, 1)
                        : [];
                      setSearchState(prev => ({
                        ...prev,
                        results,
                        isSearching: false,
                        hasMore: results.length > 0,
                        error: results.length === 0 ? 'Нет треков по этому жанру' : null
                      }));
                    } catch (err) {
                      console.error('Genre fetch error:', err);
                      setSearchState(prev => ({
                        ...prev,
                        isSearching: false,
                        error: 'Не удалось загрузить жанр'
                      }));
                    }
                  }}
                  className="aspect-[3/2] border border-lebedev-white relative overflow-hidden group cursor-pointer"
                >
                  <img
                    src={`/genres/${genre.seed}.jpg`}
                    alt={genre.name}
                    className={`absolute inset-0 w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} brightness-50 group-hover:scale-110 group-hover:brightness-75 group-hover:grayscale-0 transition-all duration-700 ease-out`}
                  />
                  < div className="absolute inset-0 flex items-center justify-center z-10" >
                    <span className="font-black uppercase text-xl tracking-tighter text-white mix-blend-difference group-hover:scale-110 transition-transform duration-300">
                      {genre.name}
                    </span>
                  </div >
                  <div className="absolute top-2 right-2 flex gap-0.5 z-20">
                    <div className="w-1 h-1 bg-lebedev-red" />
                    <div className="w-1 h-1 bg-lebedev-white" />
                  </div>
                </div >
              ))}
            </div >
          </div >
        )}

        {
          selectedGenre && (
            <div className="flex flex-col h-full">
              <button
                onClick={() => setSelectedGenre(null)}
                className="p-4 flex items-center gap-2 font-bold uppercase hover:text-lebedev-red transition-colors sticky top-0 bg-lebedev-black z-20 border-b border-lebedev-white"
              >
                <ChevronDownIcon className="w-6 h-6 rotate-90" /> Назад
              </button>
              <div className="p-6 border-b border-lebedev-white bg-lebedev-white text-lebedev-black sticky top-[57px] z-10">
                <h2 className="text-4xl font-black uppercase tracking-tighter">{selectedGenre}</h2>
                <p className="text-xs uppercase tracking-widest font-bold mt-1 opacity-60">
                  {visibleTracks.length} треков
                </p>
              </div>
              <div className="divide-y divide-lebedev-white/20 pb-8">
                {visibleTracks.map((t, i) => renderTrackItem(t, i, visibleTracks))}
              </div>
            </div>
          )
        }
      </div >
    );
  };

  const renderPlaylists = () => {
    const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) || null;
    const playlistTracks = selectedPlaylist
      ? selectedPlaylist.trackIds
        .map(id => allTracks.find(t => t.id === id))
        .filter(Boolean) as Track[]
      : [];

    return (
      <div className="flex flex-col h-full">
        {selectedPlaylist && (
          <div className="p-6 border-b-2 border-lebedev-white flex justify-end items-center bg-lebedev-black sticky top-0 z-10 gap-3">
            <button
              onClick={() => {
                setEditPlaylistTitle(selectedPlaylist.name);
                setEditPlaylistCover(null);
                setIsPlaylistEditOpen(true);
              }}
              className="p-2 rounded-full hover:bg-lebedev-white/10 transition-colors"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
          </div>
        )}

        {!selectedPlaylist ? (
          <div className="p-4 grid grid-cols-2 gap-4">
            {playlists.length === 0 ? (
              <div className="col-span-2 text-center py-12 text-lebedev-gray opacity-50 uppercase font-bold tracking-widest">
                Пусто. Создайте первый плейлист.
              </div>
            ) : (
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="group cursor-pointer"
                  onClick={() => {
                    setSelectedPlaylistId(pl.id);
                  }}
                >
                  <div className="aspect-square border border-lebedev-white mb-2 relative overflow-hidden">
                    {pl.coverUrl ? (
                      <img
                        src={pl.coverUrl}
                        className={`w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} brightness-75 group-hover:scale-110 group-hover:brightness-100 group-hover:grayscale-0 transition-all duration-700 ease-out`}
                      />
                    ) : (
                      <div className="w-full h-full bg-lebedev-white/10 flex items-center justify-center">
                        <PlaylistIcon className="w-12 h-12 text-lebedev-gray" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 bg-lebedev-black/80 px-2 py-1 text-xs font-mono text-lebedev-red">
                      {pl.trackIds.length} треков
                    </div>
                  </div>
                  <h3 className="font-bold uppercase truncate">{pl.name}</h3>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-lebedev-white bg-lebedev-black sticky top-0 z-10 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <PlaylistIcon className="w-5 h-5 text-lebedev-gray" />
                <span className="text-xs font-bold uppercase tracking-widest text-lebedev-gray">
                  {playlistTracks.length} треков
                </span>
              </div>
            </div>
            <div className="divide-y divide-lebedev-white/20">
              {playlistTracks.length === 0 ? (
                <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
                  В этом плейлисте пока нет треков.
                </div>
              ) : (
                playlistTracks.map((track, idx) => renderTrackItem(track, idx, playlistTracks, { playlistId: selectedPlaylist.id }))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLibrary = () => (
    <div className="flex flex-col min-h-full">
      <div className="p-6 border-b-4 border-lebedev-white bg-lebedev-black">
        <div className="flex items-center gap-2 mb-4 text-lebedev-red">
          <YoutubeIcon className="w-6 h-6" />
          <span className="text-sm font-black uppercase tracking-widest">YouTube загрузчик</span>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={youtubeLink}
            onChange={(e) => setYoutubeLink(e.target.value)}
            placeholder="Вставьте ссылку..."
            className="w-full bg-transparent border-2 border-lebedev-white p-3 text-sm uppercase placeholder-lebedev-gray/50 focus:outline-none focus:border-lebedev-red font-bold"
          />
          <button
            onClick={handleYoutubeSearch}
            disabled={!youtubeLink || isYoutubeLoading}
            className={`
              w-full p-4 font-black uppercase tracking-widest text-sm transition-all
              ${!youtubeLink || isYoutubeLoading ? 'bg-lebedev-gray cursor-not-allowed' : 'bg-lebedev-white text-lebedev-black hover:bg-lebedev-red hover:text-white'}
            `}
          >
            {isYoutubeLoading ? 'Поиск...' : 'Найти'}
          </button>
          {youtubeTrack && (
            <div className="border border-lebedev-white/30 p-3 flex items-center gap-3 bg-lebedev-white/5">
              <img src={getCover(youtubeTrack)} alt="cover" className="w-12 h-12 object-cover border border-lebedev-white/30" />
              <div className="flex-1 min-w-0">
                <div className="font-bold uppercase truncate text-sm">{youtubeTrack.title}</div>
                <div className="text-xs uppercase truncate" style={{ color: '#ef4444' }}>{youtubeTrack.artist}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleYoutubeDownload('app')}
                  className="px-3 py-2 bg-lebedev-white text-lebedev-black font-black uppercase text-xs hover:bg-lebedev-red hover:text-white transition-colors"
                >
                  В приложение
                </button>
                <button
                  onClick={() => handleYoutubeDownload('chat')}
                  disabled={isTrackInChatQueue(youtubeTrack.id)}
                  className={`px-3 py-2 border border-lebedev-white font-black uppercase text-xs transition-colors ${isTrackInChatQueue(youtubeTrack.id)
                    ? 'text-lebedev-gray border-lebedev-gray cursor-not-allowed'
                    : 'text-lebedev-white hover:bg-lebedev-white hover:text-lebedev-black'
                    }`}
                >
                  В чат
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-b border-lebedev-white/20 bg-lebedev-black sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LibraryIcon className="w-5 h-5 text-lebedev-gray" />
          <span className="text-xs font-bold uppercase tracking-widest text-lebedev-gray">
            Скачано ({libraryTracks.length})
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {libraryTracks.length === 0 ? (
          <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
            Пусто.
          </div>
        ) : (
          <div className="divide-y divide-lebedev-white/10">
            {libraryTracks.map((track, index) => renderTrackItem(track, index, libraryTracks))}
          </div>
        )}
      </div>
    </div>
  );

  const renderPlaceholder = (title: string, desc: string) => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-60">
      <div className="text-4xl mb-4 font-black uppercase border-b-4 border-lebedev-red pb-2">{title}</div>
      <div className="text-sm font-mono uppercase tracking-widest">{desc}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case ViewState.HOME:
        return renderHome();
      case ViewState.PLAYLISTS:
        return renderPlaylists();
      case ViewState.FAVORITES:
        return favorites.length > 0
          ? favorites.map((t, idx) => renderTrackItem(t, idx, favorites))
          : renderPlaceholder('Избранное', 'Добавьте треки.');
      case ViewState.RADIO:
        return renderRadio();
      case ViewState.LIBRARY:
        return renderLibrary();
      case ViewState.ADMIN:
        return <AdminView onBack={() => setActiveTab(ViewState.HOME)} />;
      case ViewState.SUBSCRIPTION:
        return <SubscriptionView onBack={() => setActiveTab(ViewState.HOME)} userId={user?.id} />;
      default:
        return renderHome();
    }
  };

  const renderMenuContent = () => {
    switch (menuView) {
      case 'subscription':
        return (
          <div className="p-6 space-y-4">
            <h3 className="text-xl font-black uppercase tracking-widest">Подписка</h3>
            <p className="text-sm text-lebedev-gray uppercase tracking-wide">
              {user?.subscription_status?.has_access
                ? `Активна до ${user.subscription_status.premium_expires_at ? new Date(user.subscription_status.premium_expires_at).toLocaleDateString('ru') : ''}`
                : 'Нет активной подписки'}
            </p>
            <button
              onClick={() => {
                setIsMenuOpen(false);
                setMenuView('main');
                setActiveTab(ViewState.SUBSCRIPTION);
              }}
              className="w-full p-4 bg-lebedev-white text-lebedev-black font-black uppercase tracking-widest hover:bg-lebedev-red hover:text-white transition-colors"
            >
              {user?.subscription_status?.has_access ? 'Управление подпиской' : 'Оформить подписку'}
            </button>
          </div>
        );
      case 'referrals':
        return (
          <div className="p-6 space-y-4">
            <h3 className="text-xl font-black uppercase tracking-widest">Рефералы</h3>
            <button
              onClick={handleCopyReferral}
              className="w-full p-4 bg-lebedev-white text-lebedev-black font-black uppercase tracking-widest hover:bg-lebedev-red hover:text-white transition-colors inline-flex items-center justify-center gap-2"
            >
              <CopyIcon className="w-5 h-5" /> Скопировать ссылку
            </button>
          </div>
        );
      default:
        return (
          <div className="py-2">
            <MenuButton icon={StarIcon} label="Подписка" onClick={() => setMenuView('subscription')} />
            <MenuButton icon={UsersIcon} label="Рефералы" onClick={() => setMenuView('referrals')} />
            <MenuButton
              icon={LockIcon}
              label="Админка"
              onClick={() => {
                setIsMenuOpen(false);
                setMenuView('main');
                setActiveTab(ViewState.ADMIN);
              }}
            />
          </div>
        );
    }
  };

  const renderMenuOverlay = () => {
    if (!isMenuOpen) return null;

    return (
      <div className="absolute inset-0 z-[70] bg-black flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-lebedev-white">
          <span className="text-xl font-black uppercase text-lebedev-gray">Меню</span>
          <button onClick={() => setIsMenuOpen(false)}>
            <CloseIcon className="w-8 h-8 text-lebedev-white hover:text-lebedev-red transition-colors" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {menuView !== 'main' && (
            <div className="px-6 pt-4">
              <button
                onClick={() => setMenuView('main')}
                className="text-lebedev-gray text-xs font-bold uppercase hover:text-white"
              >
                ← Назад
              </button>
            </div>
          )}
          {renderMenuContent()}
        </div>
      </div>
    );
  };

  const renderAddToPlaylistOverlay = () => {
    if (!playlistSelectionTrack) return null;
    return (
      <div className="absolute inset-0 z-[75] bg-black/80 backdrop-blur-sm flex flex-col">
        <div className="p-4 flex items-center justify-between border-b border-lebedev-white">
          <span className="text-lg font-black uppercase">Добавить в плейлист</span>
          <button onClick={() => {
            setPlaylistSelectionTrack(null);
            setMoveFromPlaylistId(null);
          }}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="px-6 py-3 border-b border-lebedev-white/10 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold uppercase truncate">{playlistSelectionTrack.title}</div>
            <div className="text-xs uppercase text-lebedev-gray truncate">{playlistSelectionTrack.artist}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {playlists.length === 0 ? (
            <div className="p-6 text-lebedev-gray uppercase text-sm">Сначала создайте плейлист</div>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleAddToPlaylist(pl.id)}
                className="w-full flex items-center justify-between px-6 py-4 border-b border-lebedev-white/10 hover:bg-lebedev-white/10"
              >
                <span className="font-bold uppercase">{pl.name}</span>
                <span className="text-xs text-lebedev-gray">{pl.trackIds.length} треков</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderCreatePlaylistModal = () => {
    if (!isCreatingPlaylist) return null;
    return (
      <div className="absolute inset-0 z-[75] bg-black/90 flex items-center justify-center">
        <div className="bg-lebedev-black border-2 border-lebedev-white p-6 w-[90%] max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black uppercase">Новый плейлист</h3>
            <button onClick={() => {
              setIsCreatingPlaylist(false);
              setNewPlaylistCover(null);
            }}>
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
          <input
            type="text"
            value={newPlaylistTitle}
            onChange={(e) => setNewPlaylistTitle(e.target.value)}
            placeholder="Название"
            className="w-full bg-transparent border-2 border-lebedev-white p-3 text-sm uppercase placeholder-lebedev-gray/50 focus:outline-none focus:border-lebedev-red font-bold mb-4"
          />
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-lebedev-gray mb-2">Обложка</label>
            <label
              htmlFor="playlist-cover-input"
              className="block aspect-square border-2 border-lebedev-white/50 bg-lebedev-white/5 relative overflow-hidden cursor-pointer group"
            >
              {newPlaylistCover ? (
                <img
                  src={URL.createObjectURL(newPlaylistCover)}
                  alt="Новая обложка"
                  className={`absolute inset-0 w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} brightness-75 group-hover:scale-110 group-hover:brightness-100 group-hover:grayscale-0 transition-all duration-500 ease-out`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-lebedev-gray uppercase text-xs font-bold">
                  Нажмите, чтобы выбрать
                </div>
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <div className="w-1 h-1 bg-lebedev-red" />
                <div className="w-1 h-1 bg-lebedev-white" />
              </div>
            </label>
            <input
              id="playlist-cover-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file) setNewPlaylistCover(file);
              }}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreatePlaylist}
              className="flex-1 p-3 bg-lebedev-white text-lebedev-black font-black uppercase tracking-widest hover:bg-lebedev-red hover:text-white transition-colors"
            >
              Создать
            </button>
            <button
              onClick={() => {
                setIsCreatingPlaylist(false);
                setNewPlaylistCover(null);
              }}
              className="flex-1 p-3 border-2 border-lebedev-white text-lebedev-white font-black uppercase tracking-widest hover:bg-lebedev-white hover:text-lebedev-black transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderEditPlaylistModal = () => {
    if (!isPlaylistEditOpen || !selectedPlaylistId) return null;
    const current = playlists.find(p => p.id === selectedPlaylistId);
    if (!current) return null;

    return (
      <div className="absolute inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-lebedev-black border-2 border-lebedev-white p-6 w-[90%] max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black uppercase">Редактировать плейлист</h3>
            <button
              onClick={() => {
                setIsPlaylistEditOpen(false);
                setEditPlaylistCover(null);
              }}
              className="p-2 hover:text-lebedev-red transition-colors"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>

          <input
            type="text"
            value={editPlaylistTitle}
            onChange={(e) => setEditPlaylistTitle(e.target.value)}
            className="w-full bg-transparent border-2 border-lebedev-white p-3 text-sm uppercase placeholder-lebedev-gray/50 focus:outline-none focus:border-lebedev-red font-bold"
            placeholder="Название плейлиста"
          />

          <div>
            <label className="block text-[11px] uppercase font-bold text-lebedev-gray mb-2">Обложка</label>
            <label
              htmlFor="playlist-edit-cover"
              className="block aspect-[3/2] border border-lebedev-white relative overflow-hidden cursor-pointer group"
            >
              {editPlaylistCover ? (
                <img
                  src={URL.createObjectURL(editPlaylistCover)}
                  className={`absolute inset-0 w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} brightness-75 group-hover:scale-110 group-hover:brightness-100 group-hover:grayscale-0 transition-all duration-700 ease-out`}
                />
              ) : current.coverUrl ? (
                <img
                  src={current.coverUrl}
                  className={`absolute inset-0 w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} brightness-75 group-hover:scale-110 group-hover:brightness-100 group-hover:grayscale-0 transition-all duration-700 ease-out`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-lebedev-gray uppercase text-xs font-bold">
                  Нажмите, чтобы выбрать
                </div>
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <div className="w-1 h-1 bg-lebedev-red" />
                <div className="w-1 h-1 bg-lebedev-white" />
              </div>
            </label>
            <input
              id="playlist-edit-cover"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setEditPlaylistCover(e.target.files?.[0] || null)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleUpdateSelectedPlaylist}
              className="flex-1 p-3 bg-lebedev-white text-lebedev-black font-black uppercase tracking-widest hover:bg-lebedev-red hover:text-white transition-colors"
            >
              Сохранить
            </button>
            <button
              onClick={handleDeleteSelectedPlaylist}
              className="flex-1 p-3 border-2 border-lebedev-white text-lebedev-white font-black uppercase tracking-widest hover:bg-lebedev-white hover:text-lebedev-black transition-colors"
            >
              Удалить
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderFullPlayer = () => {
    if (!isPlayerOpen || !safeTrack) return null;

    const isFav = favorites.some((t) => t.id === safeTrack.id);

    const seekFromClientX = (clientX: number) => {
      if (!progressBarRef.current || !duration || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      seek(duration * ratio);
    };

    const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      seekFromClientX(e.clientX);
    };

    const handleBarTouch = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length > 0) {
        seekFromClientX(e.touches[0].clientX);
      }
    };

    return (
      <div className="absolute top-0 left-0 right-0 bottom-16 pb-safe z-50 bg-black flex flex-col animate-in slide-in-from-bottom duration-300 rounded-t-3xl overflow-hidden border-2 border-lebedev-white shadow-[0_-12px_32px_rgba(0,0,0,0.65)]">
        <div className="p-4 pt-6 flex justify-between items-center shrink-0">
          <button onClick={() => setIsPlayerOpen(false)} className="text-lebedev-white hover:text-lebedev-red transition-colors">
            <ChevronDownIcon className="w-8 h-8" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-[0.2em] text-lebedev-gray">Сейчас играет</span>
            <button
              className="text-xs font-bold uppercase"
              style={{ color: '#ef4444' }}
              onClick={handleArtistClick}
            >
              {safeTrack.artist}
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPlaylistSelectionTrack(safeTrack);
            }}
            className="w-8 h-8 flex items-center justify-center hover:text-lebedev-red transition-colors"
          >
            <PlusIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
          {!showLyrics ? (
            <div className="w-full max-w-[480px] aspect-square relative shadow-2xl border-4 border-lebedev-white">
              <img src={getCover(safeTrack)} alt={safeTrack.title} className={`w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} contrast-125`} />
            </div>
          ) : (
            <div className="w-full max-w-[480px] aspect-square border-4 border-lebedev-white shadow-2xl bg-black/70 p-4">
              <div className="w-full h-full overflow-y-auto scrollbar-hidden text-left flex flex-col items-start">
                {lyricsLoading && (
                  <div className="text-sm font-bold uppercase tracking-wider text-lebedev-gray">Загружаем текст...</div>
                )}
                {lyricsError && !lyricsLoading && (
                  <div className="text-sm font-bold uppercase tracking-wider text-lebedev-red">{lyricsError}</div>
                )}
                {lyricsText && !lyricsLoading && !lyricsError && (
                  <pre className="whitespace-pre-wrap text-sm leading-6 font-mono text-lebedev-white">
                    {lyricsText}
                  </pre>
                )}
                {!lyricsText && !lyricsLoading && !lyricsError && (
                  <div className="text-sm font-bold uppercase tracking-wider text-lebedev-gray">Текст пока не найден.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-8 pb-4">
          <div className="flex justify-between items-end mb-1">
            <div className="flex flex-col overflow-hidden mr-4">
              <MarqueeText
                text={safeTrack.title}
                className="w-full text-2xl font-black uppercase leading-none mb-1"
              />
              <button
                className="text-left"
                onClick={handleArtistClick}
                style={{ color: '#ef4444' }}
              >
                <MarqueeText
                  text={safeTrack.artist}
                  className="w-full text-lg font-bold uppercase leading-none"
                />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!safeTrack) return;
                  const nextState = !showLyrics;
                  setShowLyrics(nextState);
                  if (!nextState) return;

                  if (lyricsText && lyricsTrackId === safeTrack.id) return;

                  setLyricsLoading(true);
                  setLyricsError(null);
                  try {
                    try {
                      const res = await fetchLyrics(safeTrack.title, safeTrack.artist);
                      setLyricsText(res.lyrics);
                      setLyricsTrackId(safeTrack.id);
                    } catch {
                      const apiRes = await getLyricsApi(
                        safeTrack.id || `lyrics-${safeTrack.title}-${safeTrack.artist}`,
                        safeTrack.title,
                        safeTrack.artist
                      );
                      const text = (apiRes as any)?.lyrics_text || (apiRes as any)?.lyrics;
                      if (text) {
                        setLyricsText(text);
                        setLyricsTrackId(safeTrack.id);
                      } else {
                        throw new Error('Текст не найден');
                      }
                    }
                  } catch (err: any) {
                    setLyricsText(null);
                    setLyricsError(err?.message || 'Не удалось получить текст.');
                  } finally {
                    setLyricsLoading(false);
                  }
                }}
                className={`${showLyrics ? 'text-lebedev-red' : 'text-lebedev-gray'} hover:text-lebedev-white transition-colors`}
              >
                <LyricsIcon className="w-6 h-6" />
              </button>
              <button
                className="mb-1 text-lebedev-gray hover:text-lebedev-red"
                onClick={() => toggleFavorite(safeTrack)}
                aria-label="Добавить в избранное"
              >
                <HeartIcon className={`w-6 h-6 ${isFav ? 'fill-white text-white' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 pb-12">
          <div className="mb-6">
            <div
              className="w-full h-3 bg-white/10 border border-white/25 cursor-pointer group relative rounded-full overflow-hidden"
              ref={progressBarRef}
              onClick={handleBarClick}
              onTouchStart={handleBarTouch}
            >
              <div
                className="h-full bg-white group-hover:bg-lebedev-red transition-colors"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-mono text-lebedev-gray">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(safeTrack.duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              onClick={toggleShuffle}
              className={`relative p-2 rounded-full transition-all ${isShuffle ? 'text-lebedev-red bg-lebedev-red/10 shadow-[0_0_12px_rgba(255,0,0,0.6)]' : 'text-lebedev-gray hover:text-lebedev-white'
                }`}
              title="Перемешать"
            >
              <ShuffleIcon className="w-7 h-7" />
            </button>

            <div className="flex items-center gap-6 mx-auto">
              <button onClick={prevTrack} className="active:scale-90 transition-transform">
                <SkipBackIcon className="w-8 h-8 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                className="w-20 h-20 bg-lebedev-white text-lebedev-black rounded-full flex items-center justify-center hover:bg-lebedev-red hover:text-white transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                {isPlaying ? <PauseIcon className="w-8 h-8 fill-current" /> : <PlayIcon className="w-8 h-8 ml-1 fill-current" />}
              </button>
              <button onClick={nextTrack} className="active:scale-90 transition-transform">
                <SkipForwardIcon className="w-8 h-8 fill-current" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleRepeat}
                className={`relative p-2 rounded-full transition-all ${repeatMode === 'none'
                  ? 'text-lebedev-gray hover:text-lebedev-white'
                  : 'text-lebedev-red bg-lebedev-red/10 shadow-[0_0_12px_rgba(255,0,0,0.6)]'
                  }`}
                title="Повтор"
              >
                <RepeatIcon className="w-7 h-7" />
                {repeatMode === 'one' && (
                  <span className="absolute -top-1 -right-1 text-[10px] font-bold text-lebedev-red">1</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!hasAccess) {
    return <SubscriptionBlocker user={user} onRefresh={refreshSubscriptionStatus} />;
  }

  return (
    <div className="fixed inset-0 bg-lebedev-black text-lebedev-white font-sans flex justify-center">
      <div className="relative w-full max-w-[480px] h-full flex flex-col overflow-hidden">
        {renderFullPlayer()}
        {renderMenuOverlay()}
        {renderAddToPlaylistOverlay()}
        {renderCreatePlaylistModal()}
        {renderEditPlaylistModal()}

        <div
          className={`
            fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-20px)] max-w-[520px] bg-lebedev-red text-white p-4 z-50 shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]
            transition-transform duration-300 transform
            ${toastMessage ? 'translate-y-0' : '-translate-y-24'}
          `}
          style={{ opacity: 1, backgroundColor: '#ef4444', color: '#fff' }}
        >
          <div className="text-xs font-black uppercase tracking-widest text-center">{toastMessage}</div>
        </div>

        {activeTab !== ViewState.ADMIN && activeTab !== ViewState.SUBSCRIPTION && (
          <header className="p-4 pt-6 border-b-2 border-lebedev-white flex justify-between items-center bg-lebedev-black z-20 shrink-0">
            <h1 className="text-3xl font-black tracking-tighter uppercase leading-none flex items-center gap-1 relative">
              {activeTab === ViewState.HOME ? (
                <>
                  <span className={isCoverColor ? 'text-[#ef4444]' : 'text-white'}>ЗВУК</span>
                  <span className={isCoverColor ? 'text-white' : 'text-[#ef4444]'}>.</span>
                  <span className={isCoverColor ? 'text-[#ef4444]' : 'text-white'}>ЛИ</span>
                  <span className={isCoverColor ? 'text-white' : 'text-[#ef4444]'}>?</span>
                </>
              ) : (
                <>
                  <span className={isCoverColor ? 'text-[#ef4444]' : 'text-white'}>
                    {activeTab === ViewState.PLAYLISTS
                      ? 'Плейлисты'
                      : activeTab === ViewState.FAVORITES
                        ? 'Избранное'
                        : activeTab === ViewState.RADIO
                          ? 'Радио'
                          : activeTab === ViewState.LIBRARY
                            ? 'Загрузки'
                            : 'Звукли'}
                  </span>
                  <span className={isCoverColor ? 'text-white' : 'text-[#ef4444]'} style={{ position: 'relative', top: '4px' }}>•</span>
                </>
              )}
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {activeTab === ViewState.PLAYLISTS && (
                  <button
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="p-2 hover:text-lebedev-red transition-colors"
                  >
                    <PlusIcon className="w-8 h-8" />
                  </button>
                )}
                <label className="relative inline-flex items-center cursor-pointer select-none" title="Переключить цвет обложек">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isCoverColor}
                    onChange={(e) => setIsCoverColor(e.target.checked)}
                  />
                  <span
                    className="w-12 h-6 rounded-full flex items-center px-1 transition-all border"
                    style={{
                      backgroundColor: isCoverColor ? 'rgba(255,255,255,0.12)' : '#ef4444',
                      borderColor: isCoverColor ? 'rgba(255,255,255,0.3)' : '#ef4444'
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ transform: isCoverColor ? 'translateX(24px)' : 'translateX(0px)' }}
                    />
                  </span>
                </label>
              </div>
              <button onClick={() => setIsMenuOpen(true)}>
                <MenuIcon className="w-8 h-8 text-lebedev-white hover:text-lebedev-red transition-colors" />
              </button>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto pb-48 overscroll-none scroll-smooth custom-scrollbar scrollbar-hidden">{renderContent()}</main>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-30 flex flex-col">
          {miniTrack && !isPlayerOpen && (
            <div
              onClick={() => setIsPlayerOpen(prev => !prev)}
              className="bg-black border-t-2 border-lebedev-white cursor-pointer transition-colors text-white shadow-[0_-12px_32px_rgba(0,0,0,0.65)]"
            >
              <div className="w-full h-1 bg-gray-800 relative">
                <div className="h-full bg-lebedev-red" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="flex items-center justify-between p-3 h-16">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <img
                    src={getCover(miniTrack)}
                    alt="cover"
                    className={`w-10 h-10 object-cover border border-lebedev-white/30 shrink-0 ${isCoverColor ? '' : 'grayscale'}`}
                  />
                  <div className="min-w-0 flex flex-col">
                    <MarqueeText
                      text={miniTrack.title}
                      className="w-full text-sm font-bold uppercase leading-none mb-1 text-white"
                    />
                    <MarqueeText
                      text={miniTrack.artist}
                      className="w-full text-[10px] uppercase leading-none text-[#ef4444]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 px-2">
                  <button
                    className="active:scale-90 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      prevTrack();
                    }}
                  >
                    <SkipBackIcon className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                    className="w-10 h-10 bg-lebedev-white text-lebedev-black flex items-center justify-center hover:bg-lebedev-red hover:text-white transition-colors"
                  >
                    {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nextTrack();
                    }}
                    className="active:scale-90 transition-transform"
                  >
                    <SkipForwardIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab !== ViewState.ADMIN && activeTab !== ViewState.SUBSCRIPTION && (
            <nav className="h-16 bg-black border-t-2 border-lebedev-white grid grid-cols-5 pb-safe shadow-[0_-12px_32px_rgba(0,0,0,0.65)]">
              {[
                { id: ViewState.HOME, icon: HomeIcon, label: 'Главная' },
                { id: ViewState.PLAYLISTS, icon: PlaylistIcon, label: 'Плейлисты' },
                { id: ViewState.FAVORITES, icon: HeartIcon, label: 'Избранное' },
                { id: ViewState.RADIO, icon: RadioIcon, label: 'Радио' },
                { id: ViewState.LIBRARY, icon: LibraryIcon, label: 'Загрузки' }
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setIsPlayerOpen(false);
                      if (tab.id === ViewState.HOME && activeTab === ViewState.HOME) {
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
                        setSelectedGenre(null);
                      } else if (tab.id === ViewState.PLAYLISTS && activeTab === ViewState.PLAYLISTS) {
                        setSelectedPlaylistId(null);
                      }
                      setActiveTab(tab.id);
                    }}
                    className={`
                    flex flex-col items-center justify-center gap-1 transition-all duration-200 h-full
                    ${isActive ? 'bg-white text-black shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)]' : 'text-lebedev-gray hover:text-white hover:bg-white/10'}
                  `}
                  >
                    <Icon className={`w-6 h-6 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} />
                    <span className="text-[9px] font-bold uppercase tracking-wider scale-90">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <InstallPrompt />
        <ArtistSelectorModal
          isOpen={showArtistSelector}
          onClose={() => setShowArtistSelector(false)}
          artists={artistOptions}
          onSelectArtist={handleSelectArtist}
        />
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <PlayerProvider>
    <NotificationProvider>
      <NewDesignApp />
    </NotificationProvider>
  </PlayerProvider>
);

export default App;

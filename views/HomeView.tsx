import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Play, Pause, SkipForward, SkipBack, Heart, Download, Check, RefreshCw, Loader, Settings, MoreVertical } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track, ViewState } from '../types';
import { searchTracks, getGenreTracks, downloadToChat } from '../utils/api';
import { hapticFeedback, getTelegramUser } from '../utils/telegram';
import { deduplicateTracks } from '../utils/deduplication';
import SubscriptionBadge from '../components/SubscriptionBadge';
import PaymentView from '../views/PaymentView';

interface HomeViewProps {
  onNavigate: (view: ViewState) => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const {
    playTrack,
    playRadio,
    currentTrack,
    currentRadio,
    isRadioMode,
    isPlaying,
    allTracks,
    downloadTrack,
    downloadedTracks,
    isDownloading,
    togglePlay,
    searchState,
    setSearchState,
    user,
    favorites,
    favoriteRadios,
    toggleFavoriteRadio
  } = usePlayer();

  const [showActionModal, setShowActionModal] = useState(false);
  const [trackToAction, setTrackToAction] = useState<Track | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  console.log('HomeView Render:', { user, isAdmin: user?.is_admin, subStatus: user?.subscription_status });

  // Scroll restoration
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('homeScroll');
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll));
    }

    const handleScroll = () => {
      sessionStorage.setItem('homeScroll', window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const { playlists, addToPlaylist, downloadToChat: downloadToChatContext } = usePlayer();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [trackToDownload, setTrackToDownload] = useState<Track | null>(null);


  // Отображаемые треки: результаты поиска или все треки (с дедупликацией)
  const rawDisplayTracks = searchState.results.length > 0 ? searchState.results : (searchState.query.trim() ? [] : allTracks);
  const displayTracks = deduplicateTracks(rawDisplayTracks);

  // Search with debounce
  useEffect(() => {
    // If no query, clear results
    if (!searchState.query.trim()) {
      if (searchState.results.length > 0) {
        setSearchState(prev => ({ ...prev, results: [], hasMore: true, error: null }));
      }
      return;
    }

    // Store current search mode to check if it changed
    const currentSearchMode = searchState.searchMode;

    const timeoutId = setTimeout(async () => {
      setSearchState(prev => ({ ...prev, isSearching: true, error: null, page: 1, genreId: null }));

      try {
        const results = await searchTracks(searchState.query, 20, 1, searchState.searchMode);

        // Only update results if search mode hasn't changed
        setSearchState(prev => {
          if (prev.searchMode !== currentSearchMode) {
            // Search mode changed, ignore these results
            return prev;
          }
          return {
            ...prev,
            results,
            hasMore: results.length >= 20,
            isSearching: false,
            error: results.length === 0 ? 'Ничего не найдено' : null
          };
        });
      } catch (err) {
        console.error('Search error:', err);
        setSearchState(prev => ({
          ...prev,
          isSearching: false,
          error: 'Ошибка при поиске. Проверьте подключение к серверу.'
        }));
      }
    }, 1500); // 1.5 seconds debounce

    return () => clearTimeout(timeoutId);
  }, [searchState.query, searchState.searchMode, setSearchState]);

  const loadMore = async () => {
    if (isLoadingMore || !searchState.hasMore) return;

    setIsLoadingMore(true);
    const nextPage = searchState.page + 1;

    try {
      let newResults: Track[] = [];

      if (searchState.genreId) {
        newResults = await getGenreTracks(searchState.genreId, 20, nextPage);
      } else {
        newResults = await searchTracks(searchState.query, 20, nextPage, searchState.searchMode);
      }

      if (newResults.length === 0) {
        setSearchState(prev => ({ ...prev, hasMore: false }));
      } else {
        setSearchState(prev => ({
          ...prev,
          results: [...prev.results, ...newResults],
          page: nextPage,
          hasMore: newResults.length >= 20
        }));
      }
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handlePlay = (track: Track) => {
    hapticFeedback.light();
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, displayTracks);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;

    // Immediately clear results and reset state when starting a new search
    if (query.trim().length > 0) {
      setSearchState(prev => ({
        ...prev,
        query,
        searchMode: prev.searchMode, // Keep current mode
        genreId: null,
        results: [], // Clear results immediately
        error: null
      }));
    } else {
      // If query is empty, clear everything
      setSearchState(prev => ({
        ...prev,
        query,
        searchMode: 'all', // Reset to all
        genreId: null,
        results: [],
        hasMore: true,
        error: null
      }));
    }
  };





  return (
    <div className="px-4 py-8 space-y-8 animate-fade-in-up pb-24">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            Музыка
          </h1>
          {user?.is_premium_pro && (
            <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 text-[9px] font-medium uppercase tracking-wider border border-purple-500/30 backdrop-blur-sm">
              Pro
            </span>
          )}
          {user?.is_premium && !user?.is_premium_pro && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white/50 text-[9px] font-medium uppercase tracking-wider border border-white/5 backdrop-blur-sm">
              Premium
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {user?.is_admin && (
            <button
              onClick={() => onNavigate(ViewState.ADMIN)}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <Settings size={20} />
            </button>
          )}

          <button
            onClick={() => onNavigate(ViewState.REFERRAL)}
            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 text-white text-xs font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-1"
          >
            🎁
          </button>

          <button
            onClick={() => setShowPayment(true)}
            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-1"
          >
            <span className="text-yellow-300">★</span>
          </button>
        </div>
      </div>

      {showPayment && (
        <PaymentView
          user={user}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Subscription Badge - только для пробного периода */}
      <SubscriptionBadge user={user} />

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
          {searchState.isSearching ? (
            <Loader size={18} className="animate-spin" />
          ) : (
            <Search size={18} />
          )}
        </div>
        <input
          type="text"
          placeholder="Поиск музыки..."
          value={searchState.query}
          onChange={handleSearchChange}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Search Filters */}
      {searchState.query.trim() && (
        <div className="flex gap-2 animate-fade-in overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => {
              hapticFeedback.light();
              setSearchState(prev => ({ ...prev, searchMode: 'all', results: [], page: 1 }));
            }}
            className={`flex-1 min-w-[60px] py-2 px-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap glass-panel ${searchState.searchMode === 'all'
              ? 'bg-white/20 text-white border-white/20'
              : 'text-gray-300 hover:bg-white/10'
              }`}
          >
            Все
          </button>
          <button
            onClick={() => {
              hapticFeedback.light();
              setSearchState(prev => ({ ...prev, searchMode: 'artist', results: [], page: 1 }));
            }}
            className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap glass-panel ${searchState.searchMode === 'artist'
              ? 'bg-white/20 text-white border-white/20'
              : 'text-gray-300 hover:bg-white/10'
              }`}
          >
            Исполнитель
          </button>
          <button
            onClick={() => {
              hapticFeedback.light();
              setSearchState(prev => ({ ...prev, searchMode: 'track', results: [], page: 1 }));
            }}
            className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap glass-panel ${searchState.searchMode === 'track'
              ? 'bg-white/20 text-white border-white/20'
              : 'text-gray-300 hover:bg-white/10'
              }`}
          >
            Название
          </button>
        </div>
      )}

      {/* Error Message */}
      {searchState.error && (
        <div className="text-center py-4 text-gray-400 text-sm">
          {searchState.error}
        </div>
      )}

      {/* Genres Section - Only show when not searching and no results */}
      {!searchState.query.trim() && searchState.results.length === 0 && !searchState.isSearching && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-100">Жанры</h3>
            <button
              onClick={() => setShowAllGenres(!showAllGenres)}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showAllGenres ? 'Свернуть' : 'Все'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'Рок', genreId: 6 },
              { name: 'Поп', genreId: 2 },
              { name: 'Хип-хоп', genreId: 3 },
              { name: 'Электроника', genreId: 8 },
              { name: 'Нью-эйдж', genreId: 51 },
              { name: 'Танцевальная', genreId: 11 },
              { name: 'Альтернатива', genreId: 7 },
              { name: 'Металл', genreId: 10 },
              { name: 'Дабстеп', genreId: 29 },
              { name: 'Драм-н-бэйс', genreId: 31 },
              { name: 'Транс', genreId: 1 },
              { name: 'Шансон', genreId: 14 },
              { name: 'Классика', genreId: 28 },
              { name: 'Джаз', genreId: 39 },
              { name: 'Регги', genreId: 30 },
              { name: 'Кантри', genreId: 42 },
              { name: 'Латино', genreId: 32 },
              { name: 'Блюз', genreId: 17 },
            ].slice(0, showAllGenres ? undefined : 6).map((genre) => (
              <button
                key={genre.name}
                onClick={async () => {
                  hapticFeedback.light();
                  setSearchState(prev => ({ ...prev, isSearching: true, results: [], genreId: genre.genreId, page: 1 }));

                  try {
                    const results = await getGenreTracks(genre.genreId, 20, 1);
                    setSearchState(prev => ({
                      ...prev,
                      results,
                      isSearching: false,
                      hasMore: results.length >= 20,
                      error: results.length === 0 ? 'Ничего не найдено' : null
                    }));
                  } catch (err) {
                    console.error('Genre error:', err);
                    setSearchState(prev => ({
                      ...prev,
                      isSearching: false,
                      error: 'Ошибка при загрузке жанра'
                    }));
                  }
                }}
                className="p-4 rounded-xl glass-panel text-white font-semibold hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center text-center h-20"
              >
                {genre.name}
              </button>
            ))}
          </div>

          {!showAllGenres && (
            <button
              onClick={() => setShowAllGenres(true)}
              className="w-full py-3 bg-white/5 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors"
            >
              Показать все жанры
            </button>
          )}
        </div>
      )}

      {/* Artist Recommendations - Only show when playing and not searching and no results */}
      {!searchState.query.trim() && searchState.results.length === 0 && !searchState.isSearching && currentTrack && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Рекомендации</h3>
          <button
            onClick={() => {
              setSearchState(prev => ({ ...prev, query: currentTrack.artist, isArtistSearch: true }));
              hapticFeedback.light();
            }}
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center space-x-4"
          >
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.artist}
              className="w-12 h-12 rounded-lg object-cover"
            />
            <div className="flex-1 text-left">
              <p className="text-sm text-gray-400">Еще от</p>
              <p className="text-white font-semibold">{currentTrack.artist}</p>
            </div>
            <div className="text-blue-400">→</div>
          </button>
        </div>
      )}



      {/* Track List - Only show when searching */}
      {
        (searchState.query.trim() || searchState.results.length > 0) && (
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-100">
              {searchState.query.trim() ? 'Результаты поиска' : 'Популярное'}
            </h3>
            <div className="space-y-3">
              {displayTracks.length === 0 && !searchState.isSearching && !searchState.error && (
                <div className="text-center py-8 text-gray-400">
                  Начните поиск, чтобы найти музыку
                </div>
              )}

              {displayTracks.map((track) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`flex items-center p-3 rounded-xl transition-all cursor-pointer ${isCurrent ? 'bg-white/10 border border-white/5' : 'hover:bg-white/5'
                      }`}
                    onClick={() => handlePlay(track)}
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 mr-4 group">
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback image on error
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(track.artist)}&size=200&background=random`;
                        }}
                      />
                      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                        {isCurrent && isPlaying ? (
                          <div className="flex space-x-[2px] items-end h-4">
                            <div className="w-[3px] bg-blue-400 animate-bounce h-2"></div>
                            <div className="w-[3px] bg-blue-400 animate-bounce h-4 delay-75"></div>
                            <div className="w-[3px] bg-blue-400 animate-bounce h-3 delay-150"></div>
                          </div>
                        ) : (
                          <Play size={16} fill="white" />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-medium truncate ${isCurrent ? 'text-blue-400' : 'text-white'
                        }`}>
                        {track.title}
                      </h4>
                      <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Download Button */}
                      <button
                        className={`p-2 transition-colors ${downloadedTracks.has(track.id)
                          ? 'text-blue-400'
                          : isDownloading === track.id
                            ? 'text-blue-400 animate-pulse'
                            : 'text-gray-500 hover:text-white'
                          }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (downloadedTracks.has(track.id)) {
                            // Already downloaded
                          } else {
                            // Show download choice modal
                            setTrackToDownload(track);
                            setShowDownloadModal(true);
                          }
                        }}
                        disabled={isDownloading === track.id}
                      >
                        {isDownloading === track.id ? (
                          <Loader size={16} className="animate-spin" />
                        ) : downloadedTracks.has(track.id) ? (
                          <div className="relative">
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          </div>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        )}
                      </button>

                      <button
                        className="p-2 text-gray-500 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticFeedback.selection();
                          setTrackToAction(track);
                          setShowActionModal(true);
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load More Button */}
            {searchState.results.length > 0 && searchState.hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-medium transition-colors flex items-center space-x-2"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      <span>Загрузка...</span>
                    </>
                  ) : (
                    <span>Показать еще</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )
      }

      {/* Action Modal (Add to Playlist) */}
      {
        showActionModal && trackToAction && (
          <div
            className={`fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-fade-in ${currentTrack ? 'pb-40' : 'pb-20'}`}
            onClick={() => setShowActionModal(false)}
          >
            <div className="bg-gray-900 w-full max-w-sm p-6 rounded-t-2xl sm:rounded-2xl border-t sm:border border-white/10 shadow-2xl transform transition-transform" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4 text-white">Добавить в плейлист</h3>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {playlists.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    Нет плейлистов. Создайте первый!
                  </div>
                ) : (
                  playlists.map(playlist => (
                    <button
                      key={playlist.id}
                      className="w-full flex items-center p-3 rounded-xl hover:bg-white/5 transition-colors text-left"
                      onClick={() => {
                        addToPlaylist(playlist.id, trackToAction);
                        setShowActionModal(false);
                        setTrackToAction(null);
                        hapticFeedback.success();
                      }}
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden mr-3">
                        <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-white font-medium">{playlist.name}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-4 space-y-2">
                <button
                  className="w-full py-3 bg-blue-600 rounded-xl font-medium text-white hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
                  onClick={() => {
                    if (trackToAction) {
                      downloadTrack(trackToAction);
                      setShowActionModal(false);
                      setTrackToAction(null);
                      hapticFeedback.success();
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Скачать трек
                </button>

                <button
                  className="w-full py-3 bg-gray-800 rounded-xl font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                  onClick={() => setShowActionModal(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Download Choice Modal */}
      {showDownloadModal && trackToDownload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 animate-fade-in" onClick={() => setShowDownloadModal(false)}>
          <div className="bg-gray-900 w-full max-w-sm p-6 rounded-2xl border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-white">Куда скачать?</h3>

            <div className="space-y-3">
              <button
                className="w-full py-4 bg-blue-600 rounded-xl font-medium text-white hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
                onClick={async () => {
                  downloadTrack(trackToDownload);
                  setShowDownloadModal(false);
                  setTrackToDownload(null);
                  hapticFeedback.success();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                В приложение
              </button>

              <button
                className="w-full py-4 bg-purple-600 rounded-xl font-medium text-white hover:bg-purple-500 transition-colors flex items-center justify-center gap-2"
                onClick={() => {
                  // Use context downloadToChat queue
                  downloadToChatContext(trackToDownload);
                  setShowDownloadModal(false);
                  setTrackToDownload(null);
                  hapticFeedback.success();

                  if (window.Telegram?.WebApp?.showAlert) {
                    window.Telegram.WebApp.showAlert('Трек добавлен в очередь отправки!');
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                В чат (Бот)
              </button>

              <button
                className="w-full py-3 bg-gray-800 rounded-xl font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                onClick={() => {
                  setShowDownloadModal(false);
                  setTrackToDownload(null);
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default HomeView;
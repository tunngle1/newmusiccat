import React, { useState, useEffect } from 'react';
import { Play, MoreVertical, Search, Loader, Radio } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track, RadioStation } from '../types';
import { searchTracks, getGenreTracks, getRadioStations, downloadToChat } from '../utils/api';
import { hapticFeedback, getTelegramUser } from '../utils/telegram';

const HomeView: React.FC = () => {
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
    setSearchState
  } = usePlayer();

  const [showActionModal, setShowActionModal] = useState(false);
  const [trackToAction, setTrackToAction] = useState<Track | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [isLoadingRadio, setIsLoadingRadio] = useState(false);
  const [showAllRadio, setShowAllRadio] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const { playlists, addToPlaylist } = usePlayer();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [trackToDownload, setTrackToDownload] = useState<Track | null>(null);

  // Отображаемые треки: результаты поиска или все треки
  const displayTracks = searchState.results.length > 0 ? searchState.results : (searchState.query.trim() ? [] : allTracks);

  // Поиск с debounce
  useEffect(() => {
    if (!searchState.query.trim()) {
      // Clear results only if query is empty and we're not in genre mode
      if (!searchState.genreId) {
        setSearchState(prev => ({ ...prev, results: [], hasMore: true, error: null }));
      }
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearchState(prev => ({ ...prev, isSearching: true, error: null, page: 1, genreId: null }));

      try {
        const results = await searchTracks(searchState.query, 20, 1, searchState.isArtistSearch);
        setSearchState(prev => ({
          ...prev,
          results,
          hasMore: results.length >= 20,
          isSearching: false,
          error: results.length === 0 ? 'Ничего не найдено' : null
        }));
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
  }, [searchState.query, searchState.isArtistSearch, setSearchState]);

  const loadMore = async () => {
    if (isLoadingMore || !searchState.hasMore) return;

    setIsLoadingMore(true);
    const nextPage = searchState.page + 1;

    try {
      let newResults: Track[] = [];

      if (searchState.genreId) {
        newResults = await getGenreTracks(searchState.genreId, 20, nextPage);
      } else {
        newResults = await searchTracks(searchState.query, 20, nextPage, searchState.isArtistSearch);
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
        isArtistSearch: false,
        genreId: null,
        results: [], // Clear results immediately
        error: null
      }));
    } else {
      // If query is empty, clear everything
      setSearchState(prev => ({
        ...prev,
        query,
        isArtistSearch: false,
        genreId: null,
        results: [],
        hasMore: true,
        error: null
      }));
    }
  };

  // Load radio stations on mount
  useEffect(() => {
    const loadRadio = async () => {
      setIsLoadingRadio(true);
      try {
        const stations = await getRadioStations();
        setRadioStations(stations);
      } catch (err) {
        console.error('Failed to load radio stations:', err);
      } finally {
        setIsLoadingRadio(false);
      }
    };
    loadRadio();
  }, []);

  const handleRadioPlay = (station: RadioStation) => {
    hapticFeedback.light();
    if (isRadioMode && currentRadio?.id === station.id) {
      togglePlay();
    } else {
      playRadio(station);
    }
  };

  return (
    <div className="px-4 py-8 space-y-8 animate-fade-in-up pb-24">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          Музыка
        </h1>
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">
          TG
        </div>
      </div>

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
              { name: 'Рок', genreId: 6, gradient: 'from-red-500 to-orange-500' },
              { name: 'Поп', genreId: 2, gradient: 'from-pink-500 to-purple-500' },
              { name: 'Хип-хоп', genreId: 99, gradient: 'from-yellow-500 to-green-500' },
              { name: 'Электроника', genreId: 8, gradient: 'from-blue-500 to-cyan-500' },
              { name: 'Релакс', genreId: 51, gradient: 'from-green-500 to-teal-500' },
              { name: 'Танцевальная', genreId: 11, gradient: 'from-orange-500 to-red-600' },
              { name: 'Альтернатива', genreId: 5, gradient: 'from-purple-600 to-indigo-600' },
              { name: 'Метал', genreId: 7, gradient: 'from-gray-700 to-black' },
              { name: 'Дабстеп', genreId: 10, gradient: 'from-indigo-500 to-purple-500' },
              { name: 'Драм-н-бэйс', genreId: 12, gradient: 'from-yellow-600 to-red-600' },
              { name: 'Транс', genreId: 13, gradient: 'from-cyan-500 to-blue-600' },
              { name: 'Шансон', genreId: 15, gradient: 'from-yellow-700 to-orange-700' },
              { name: 'Классика', genreId: 17, gradient: 'from-yellow-200 to-yellow-500' },
              { name: 'Джаз', genreId: 19, gradient: 'from-indigo-400 to-purple-400' },
              { name: 'Фолк', genreId: 22, gradient: 'from-green-600 to-emerald-600' },
              { name: 'Кантри', genreId: 23, gradient: 'from-orange-400 to-amber-600' },
              { name: 'Латино', genreId: 24, gradient: 'from-red-500 to-pink-600' },
              { name: 'Блюз', genreId: 25, gradient: 'from-blue-700 to-indigo-800' },
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
                className={`p-4 rounded-xl bg-gradient-to-br ${genre.gradient} text-white font-semibold shadow-lg hover:scale-105 transition-transform active:scale-95`}
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

      {/* Radio Stations Section - Only show when not searching */}
      {!searchState.query.trim() && searchState.results.length === 0 && !searchState.isSearching && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-100 flex items-center gap-2">
            <Radio size={20} className="text-blue-400" />
            Радио
          </h3>

          {isLoadingRadio ? (
            <div className="flex justify-center py-8">
              <Loader size={32} className="animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {radioStations.slice(0, showAllRadio ? undefined : 6).map((station) => {
                  const isCurrentStation = isRadioMode && currentRadio?.id === station.id;
                  return (
                    <button
                      key={station.id}
                      onClick={() => handleRadioPlay(station)}
                      className={`relative p-4 rounded-xl transition-all ${isCurrentStation
                        ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-2 border-blue-400'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                        }`}
                    >
                      <div className="aspect-square rounded-lg overflow-hidden mb-3 relative">
                        <img
                          src={station.image}
                          alt={station.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(station.name)}&size=200&background=random`;
                          }}
                        />
                        {isCurrentStation && isPlaying && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="flex space-x-1 items-end h-4">
                              <div className="w-1 bg-blue-400 animate-pulse h-2"></div>
                              <div className="w-1 bg-blue-400 animate-pulse h-4" style={{ animationDelay: '0.2s' }}></div>
                              <div className="w-1 bg-blue-400 animate-pulse h-3" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                          </div>
                        )}
                      </div>
                      <h4 className={`text-sm font-semibold truncate ${isCurrentStation ? 'text-blue-400' : 'text-white'
                        }`}>
                        {station.name}
                      </h4>
                      <p className="text-xs text-gray-400 truncate">{station.genre}</p>
                      {isCurrentStation && (
                        <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                          LIVE
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {radioStations.length > 6 && (
                <button
                  onClick={() => setShowAllRadio(!showAllRadio)}
                  className="w-full py-3 bg-white/5 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors"
                >
                  {showAllRadio ? 'Свернуть' : 'Показать все станции'}
                </button>
              )}
            </div>
          )}
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
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => setShowActionModal(false)}>
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
                onClick={async () => {
                  try {
                    const user = getTelegramUser();
                    if (!user) {
                      if (window.Telegram?.WebApp?.showAlert) {
                        window.Telegram.WebApp.showAlert('Не удалось получить данные пользователя');
                      }
                      return;
                    }
                    await downloadToChat(user.id, trackToDownload);
                    setShowDownloadModal(false);
                    setTrackToDownload(null);
                    hapticFeedback.success();
                    if (window.Telegram?.WebApp?.showAlert) {
                      window.Telegram.WebApp.showAlert('Трек отправлен в чат!');
                    }
                  } catch (error) {
                    console.error('Download to chat error:', error);
                    if (window.Telegram?.WebApp?.showAlert) {
                      window.Telegram.WebApp.showAlert('Ошибка при отправке в чат');
                    }
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
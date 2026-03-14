import React, { useEffect } from 'react';
import { SearchIcon, PlayIcon, ChevronDownIcon } from '../components/newdesign/Icons';
import { Track, SearchMode } from '../types';
import { formatDuration, getGenreTracks } from '../utils/api';

const formatSeconds = (seconds: number | undefined) => {
  if (seconds === undefined || Number.isNaN(seconds)) return '0:00';
  return formatDuration(Math.max(0, Math.floor(seconds)));
};

const getCover = (track?: Track | null) =>
  track?.coverUrl || 'https://picsum.photos/seed/tg-music/400/400';

interface Genre {
  name: string;
  genreId: number;
  seed: string;
}

interface HomeTabViewProps {
  searchState: {
    query: string;
    results: Track[];
    isSearching: boolean;
    error: string | null;
    page: number;
    hasMore: boolean;
    searchMode: SearchMode;
    genreId: number | null;
  };
  setSearchState: React.Dispatch<React.SetStateAction<HomeTabViewProps['searchState']>>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  allTracks: Track[];
  recentTracks: Track[];
  genres: Genre[];
  selectedGenre: string | null;
  setSelectedGenre: (genre: string | null) => void;
  isCoverColor: boolean;
  isLoadMoreLoading: boolean;
  loadMoreSearch: () => void;
  handleTrackSelect: (track: Track, queue?: Track[]) => void;
  renderTrackItem: (track: Track, index: number, list: Track[]) => React.ReactNode;
  // Recommendations
  waveTracks?: Track[];
  waveLoading?: boolean;
  waveError?: string | null;
  onLoadWave?: () => void;
  onStartWave?: () => void;
}

const HomeTabView: React.FC<HomeTabViewProps> = ({
  searchState,
  setSearchState,
  searchInputRef,
  allTracks,
  recentTracks,
  genres,
  selectedGenre,
  setSelectedGenre,
  isCoverColor,
  isLoadMoreLoading,
  loadMoreSearch,
  handleTrackSelect,
  renderTrackItem,
  waveTracks = [],
  waveLoading = false,
  waveError = null,
  onLoadWave,
  onStartWave,
}) => {
  // Auto-load wave on mount if empty
  useEffect(() => {
    if (waveTracks.length === 0 && !waveLoading && onLoadWave) {
      onLoadWave();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const isSearching = Boolean(searchState.query.trim()) || Boolean(searchState.genreId);
  const searchResults = searchState.results;
  const allTracksSafe = allTracks || [];
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
    <div className="flex flex-col h-full">
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

      {/* --- Моя волна --- */}
      <div className="mb-2 px-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="w-2 h-2 bg-lebedev-red rounded-full" />
          <h2 className="text-xl font-black uppercase tracking-widest">Моя волна</h2>
        </div>

        <div className="border border-lebedev-white bg-lebedev-white/5 overflow-hidden">
          <div className="relative aspect-[16/9] bg-lebedev-black">
            {waveTracks[0] ? (
              <img
                src={getCover(waveTracks[0])}
                className={`absolute inset-0 w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} opacity-35`}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20" />
            <div className="absolute inset-0 flex flex-col justify-end p-4 gap-3">
              <div>
                <div className="text-2xl font-black uppercase tracking-widest">Поток по вашим интересам</div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-lebedev-gray mt-2">
                  На основе истории, лайков и прослушиваний
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => onStartWave?.()}
                  disabled={waveLoading || waveTracks.length === 0}
                  className="px-4 py-2 bg-lebedev-white text-lebedev-black font-black uppercase tracking-widest hover:bg-lebedev-red hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {waveLoading ? 'Загрузка' : 'Слушать волну'}
                </button>
                <button
                  onClick={() => onLoadWave?.()}
                  disabled={waveLoading}
                  className="px-4 py-2 border border-lebedev-white text-white font-black uppercase tracking-widest hover:border-lebedev-red hover:text-lebedev-red transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Обновить
                </button>
              </div>
            </div>
          </div>
        </div>

        {waveLoading && waveTracks.length === 0 && (
          <div className="pt-3 text-lebedev-gray text-sm uppercase font-bold tracking-widest opacity-60">
            <span className="inline-flex items-center gap-2">
              Подбираем треки
              <span className="loading-dots-bounce">
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
              </span>
            </span>
          </div>
        )}

        {waveError && (
          <div className="pt-3 text-lebedev-red text-xs uppercase font-bold tracking-widest opacity-80">
            {waveError}
          </div>
        )}
      </div>

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

export default HomeTabView;

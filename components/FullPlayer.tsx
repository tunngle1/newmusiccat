import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Download, Share2, Shuffle, FileText, Heart } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/format';
import { getLyrics, downloadToChat } from '../utils/api';
import LyricsModal from './LyricsModal';
import MarqueeText from './MarqueeText';
import ArtistSelectorModal from './ArtistSelectorModal';
import DownloadModal from './DownloadModal';
import { hapticFeedback } from '../utils/telegram';
import { getDominantColor } from '../utils/colors';


interface FullPlayerProps {
  onCollapse: () => void;
}

const FullPlayer: React.FC<FullPlayerProps> = ({ onCollapse }) => {
  const {
    currentTrack,
    currentRadio,
    isRadioMode,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    currentTime,
    duration,
    seek,
    repeatMode,
    toggleRepeat,
    isShuffle,
    toggleShuffle,
    downloadTrack,
    setSearchState,
    favorites,
    toggleFavorite,
    user
  } = usePlayer();

  // Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  // Artist selector state
  const [showArtistSelector, setShowArtistSelector] = useState(false);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Gesture state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lastTap = useRef<number>(0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  // Dynamic Background State
  const [backgroundColor, setBackgroundColor] = useState<string>('#1a1a1a');

  const title = isRadioMode ? currentRadio?.name : currentTrack?.title;
  const subtitle = isRadioMode ? currentRadio?.genre : currentTrack?.artist;
  const coverUrl = isRadioMode ? currentRadio?.image : currentTrack?.coverUrl;

  // Update background color when cover changes
  useEffect(() => {
    if (coverUrl) {
      getDominantColor(coverUrl).then(color => {
        setBackgroundColor(color);
      });
    }
  }, [coverUrl]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;

    const diffX = touchStartX.current - currentX;
    const diffY = touchStartY.current - currentY;

    // Only track vertical drag down
    if (diffY < 0 && Math.abs(diffX) < 50) {
      isDragging.current = true;
      const offset = Math.abs(diffY);
      setDragOffset(offset);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchStartX.current || !touchStartY.current) {
      setDragOffset(0);
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX.current - touchEndX;
    const diffY = touchStartY.current - touchEndY;

    // If was dragging down
    if (isDragging.current && diffY < 0) {
      const swipeDistance = Math.abs(diffY);
      const threshold = 150; // Distance to trigger close

      if (swipeDistance > threshold) {
        // Close player
        onCollapse();
      } else {
        // Snap back
        setDragOffset(0);
      }
    } else {
      // Horizontal Swipe (Next/Prev)
      const minSwipeDistance = 50;
      const maxVerticalForHorizontalSwipe = 50;

      if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffY) < maxVerticalForHorizontalSwipe) {
        if (diffX > 0) {
          nextTrack();
        } else {
          prevTrack();
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    isDragging.current = false;
    setDragOffset(0);
  };

  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (currentTrack) {
        toggleFavorite(currentTrack);
        setShowHeartAnimation(true);
        setTimeout(() => setShowHeartAnimation(false), 800);
      }
    }
    lastTap.current = now;
  };

  const handleShowLyrics = async () => {
    if (!currentTrack) return;

    setShowLyrics(true);
    setLyricsLoading(true);
    setLyricsError(null);

    try {
      const response = await getLyrics(currentTrack.id, currentTrack.title, currentTrack.artist);
      setLyrics(response.lyrics_text);
    } catch (error: any) {
      setLyricsError(error.message || 'Не удалось загрузить текст песни');
    } finally {
      setLyricsLoading(false);
    }
  };

  if (!currentTrack && !currentRadio) return null;

  const isFavorite = currentTrack ? favorites.some(f => f.id === currentTrack.id) : false;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  return (
    <div
      className="fixed top-0 left-0 w-full h-[var(--tg-viewport-height,100vh)] z-50 flex flex-col items-center pt-safe pb-safe overflow-hidden transition-colors duration-700"
      style={{
        backgroundColor,
        transform: `translateY(${dragOffset}px)`,
        transition: isDragging.current
          ? 'none'
          : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.7s ease'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        {/* Reduced opacity of black overlay to let color show through */}
        <div className="absolute inset-0 bg-black/30 z-10" />
        <img
          src={coverUrl}
          alt="Background"
          className="w-full h-full object-cover blur-3xl scale-110 opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 z-20" />
      </div>

      {/* Content */}
      <div className="relative z-30 w-full h-full flex flex-col">
        {/* Header */}
        <div className="w-full flex justify-between items-center px-6 py-6">
          <div className="flex items-center gap-2">
            <button onClick={onCollapse} className="text-white/80 hover:text-white transition-colors p-2 glass-button rounded-full">
              <ChevronDown size={24} />
            </button>
            {!isRadioMode && currentTrack && (
              <>
                <button
                  onClick={() => currentTrack && toggleFavorite(currentTrack)}
                  className={`p-2 rounded-full transition-all ${isFavorite ? 'text-red-500' : 'text-white/60 hover:text-white'}`}
                >
                  <Heart size={24} className={isFavorite ? 'fill-red-500' : ''} />
                </button>

                <button
                  onClick={handleShowLyrics}
                  className="p-2 text-white/60 hover:text-white transition-colors"
                >
                  <FileText size={24} />
                </button>
              </>
            )}
          </div>
          <div className="text-xs font-medium tracking-[0.2em] text-white/60 uppercase text-glow">Сейчас играет</div>
          <button className="text-white/80 hover:text-white transition-colors p-2 glass-button rounded-full">
            <Share2 size={20} />
          </button>
        </div>

        {/* Cover Art */}
        <div className="flex-1 flex items-center justify-center w-full px-8 py-4 min-h-0">
          <div
            className="relative max-h-full max-w-full aspect-square rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/10 active:scale-95 transition-transform duration-200"
            onClick={handleDoubleTap}
          >
            <img
              src={coverUrl}
              alt={title}
              className={`w-full h-full object-cover transform transition-transform duration-700 ${isRadioMode && isPlaying ? 'animate-pulse-slow' : ''}`}
            />
            {/* Heart Animation Overlay */}
            {showHeartAnimation && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 animate-fade-in">
                <Heart size={80} className="text-red-500 fill-red-500 animate-bounce" />
              </div>
            )}
            {isRadioMode && (
              <div className="absolute top-4 right-4 px-3 py-1 glass rounded-full text-xs font-bold text-white flex items-center gap-2 shadow-lg animate-pulse">
                <span className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.6)]"></span>
                LIVE
              </div>
            )}
          </div>
        </div>

        {/* Track Info & Controls */}
        <div className="w-full px-8 pb-12 flex flex-col space-y-8">

          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <MarqueeText
                text={title || ''}
                className="text-2xl font-bold text-white leading-tight text-glow mb-1"
              />
              <div
                onClick={() => {
                  if (!isRadioMode && currentTrack) {
                    // Split artists by comma and filter
                    const artists = currentTrack.artist.split(',').map(a => a.trim()).filter(a => a);

                    if (artists.length > 1) {
                      // Multiple artists - show selector
                      setShowArtistSelector(true);
                    } else {
                      // Single artist - search directly
                      onCollapse();
                      setSearchState(prev => ({
                        ...prev,
                        query: currentTrack.artist,
                        searchMode: 'artist',
                        results: [],
                        genreId: null
                      }));
                    }
                  }
                }}
                className={!isRadioMode ? "cursor-pointer hover:text-blue-400 transition-colors" : ""}
              >
                <MarqueeText
                  text={subtitle || ''}
                  className="text-lg text-white/60 font-medium"
                />
              </div>
            </div>
            {!isRadioMode && currentTrack && (
              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={() => setShowDownloadModal(true)}
                  className="p-3 rounded-full glass-button text-white/80 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                  title="Скачать"
                >
                  <Download size={20} />
                </button>
              </div>
            )}
          </div>

          {/* Progress Bar - Hidden for Radio */}
          {!isRadioMode ? (
            <div className="w-full space-y-3 group">
              <div className="relative h-1.5 w-full bg-white/10 rounded-full overflow-hidden cursor-pointer group-hover:h-2 transition-all duration-300">
                <div
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-xs font-medium text-white/40">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          ) : (
            <div className="w-full py-4 flex items-center justify-center space-x-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce delay-100 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce delay-200 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
              <span className="text-red-400 font-medium text-sm ml-2 tracking-wide">ПРЯМОЙ ЭФИР</span>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-between items-center px-2">
            <button
              onClick={toggleRepeat}
              className={`transition-all duration-300 ${repeatMode !== 'none' ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]' : 'text-white/40 hover:text-white/80'} ${isRadioMode ? 'opacity-0 pointer-events-none' : ''}`}
              disabled={isRadioMode}
            >
              {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
            </button>

            <div className="flex items-center gap-8">
              <button
                onClick={prevTrack}
                className={`text-white hover:text-white/80 transition-all active:scale-90 ${isRadioMode ? 'opacity-30 pointer-events-none' : ''}`}
                disabled={isRadioMode}
              >
                <SkipBack size={36} fill="currentColor" className="drop-shadow-lg" />
              </button>

              <button
                onClick={togglePlay}
                className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.5)] transition-all active:scale-95"
              >
                {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
              </button>

              <button
                onClick={nextTrack}
                className={`text-white hover:text-white/80 transition-all active:scale-90 ${isRadioMode ? 'opacity-30 pointer-events-none' : ''}`}
                disabled={isRadioMode}
              >
                <SkipForward size={36} fill="currentColor" className="drop-shadow-lg" />
              </button>
            </div>

            <button
              onClick={toggleShuffle}
              className={`transition-all duration-300 ${isShuffle ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]' : 'text-white/40 hover:text-white/80'} ${isRadioMode ? 'opacity-0 pointer-events-none' : ''}`}
              disabled={isRadioMode}
            >
              <Shuffle size={22} />
            </button>
          </div>
        </div>
      </div>

      {/* Lyrics Modal */}
      <LyricsModal
        isOpen={showLyrics}
        onClose={() => setShowLyrics(false)}
        title={currentTrack?.title || ''}
        artist={currentTrack?.artist || ''}
        lyrics={lyrics}
        isLoading={lyricsLoading}
        error={lyricsError}
      />

      {/* Artist Selector Modal */}
      <ArtistSelectorModal
        isOpen={showArtistSelector}
        onClose={() => setShowArtistSelector(false)}
        artists={currentTrack?.artist.split(',').map(a => a.trim()).filter(a => a) || []}
        onSelectArtist={(artist) => {
          onCollapse();
          setSearchState(prev => ({
            ...prev,
            query: artist,
            searchMode: 'artist',
            results: [],
            genreId: null
          }));
        }}
      />

      {/* Download Modal */}
      {currentTrack && (
        <DownloadModal
          isOpen={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
          trackTitle={currentTrack.title}
          onDownloadToApp={() => downloadTrack(currentTrack)}
          onDownloadToChat={async () => {
            if (user) {
              try {
                await downloadToChat(user.id, currentTrack);
                hapticFeedback.success();
              } catch (error) {
                console.error('Download to chat error:', error);
                hapticFeedback.error();
              }
            }
          }}
        />
      )}
    </div>
  );
};

export default FullPlayer;
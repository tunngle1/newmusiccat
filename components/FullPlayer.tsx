import React, { useState } from 'react';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Download, Share2, Shuffle, FileText } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/format';
import { getLyrics } from '../utils/api';
import LyricsModal from './LyricsModal';
import MarqueeText from './MarqueeText';


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
    setSearchState
  } = usePlayer();

  // Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

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

  const title = isRadioMode ? currentRadio?.name : currentTrack?.title;
  const subtitle = isRadioMode ? currentRadio?.genre : currentTrack?.artist;
  const coverUrl = isRadioMode ? currentRadio?.image : currentTrack?.coverUrl;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center pt-safe pb-safe animate-fade-in overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black/60 z-10" />
        <img
          src={coverUrl}
          alt="Background"
          className="w-full h-full object-cover blur-3xl scale-110 opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-20" />
      </div>

      {/* Content */}
      <div className="relative z-30 w-full h-full flex flex-col">
        {/* Header */}
        <div className="w-full flex justify-between items-center px-6 py-6">
          <button onClick={onCollapse} className="text-white/80 hover:text-white transition-colors p-2 glass-button rounded-full">
            <ChevronDown size={24} />
          </button>
          <div className="text-xs font-medium tracking-[0.2em] text-white/60 uppercase text-glow">Сейчас играет</div>
          <button className="text-white/80 hover:text-white transition-colors p-2 glass-button rounded-full">
            <Share2 size={20} />
          </button>
        </div>

        {/* Cover Art */}
        <div className="flex-1 flex items-center justify-center w-full px-8 py-4">
          <div className="relative w-full aspect-square max-w-sm rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/10">
            <img
              src={coverUrl}
              alt="Album Art"
              className={`w-full h-full object-cover transform transition-transform duration-700 ${isRadioMode && isPlaying ? 'animate-pulse-slow' : ''}`}
            />
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
            <div className="space-y-2 flex-1 min-w-0">
              <MarqueeText
                text={title || ''}
                className="text-2xl font-bold text-white leading-tight text-glow"
              />
              <div
                onClick={() => {
                  if (!isRadioMode && currentTrack) {
                    onCollapse();
                    setSearchState(prev => ({
                      ...prev,
                      query: currentTrack.artist,
                      isArtistSearch: true,
                      results: [],
                      genreId: null
                    }));
                  }
                }}
                className={!isRadioMode ? "cursor-pointer hover:text-blue-400 transition-colors" : ""}
              >
                <MarqueeText
                  text={subtitle || ''}
                  className="text-lg text-white/60 font-medium leading-snug"
                />
              </div>
            </div>
            {!isRadioMode && currentTrack && (
              <div className="flex gap-3 flex-shrink-0">
                <button
                  onClick={handleShowLyrics}
                  className="p-3 rounded-full glass-button text-white/80 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                  title="Текст песни"
                >
                  <FileText size={20} />
                </button>
                <button
                  onClick={() => downloadTrack(currentTrack)}
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
    </div>
  );
};

export default FullPlayer;
import React from 'react';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Download, Share2, Shuffle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/format';

interface FullPlayerProps {
  onCollapse: () => void;
}

const FullPlayer: React.FC<FullPlayerProps> = ({ onCollapse }) => {
  const {
    currentTrack,
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
    downloadTrack
  } = usePlayer();

  if (!currentTrack) return null;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 z-50 flex flex-col items-center pt-safe pb-safe animate-fade-in">
      {/* Header */}
      <div className="w-full flex justify-between items-center px-6 py-6">
        <button onClick={onCollapse} className="text-white/80 hover:text-white">
          <ChevronDown size={32} />
        </button>
        <div className="text-xs font-medium tracking-widest text-gray-400 uppercase">Сейчас играет</div>
        <button className="text-white/80 hover:text-white" onClick={() => { }}>
          <Share2 size={24} />
        </button>
      </div>

      {/* Cover Art */}
      <div className="flex-1 flex items-center justify-center w-full px-8">
        <div className="relative w-full aspect-square max-w-sm rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/10">
          <img
            src={currentTrack.coverUrl}
            alt="Album Art"
            className="w-full h-full object-cover transform transition-transform duration-700 hover:scale-105"
          />
        </div>
      </div>

      {/* Track Info & Controls */}
      <div className="w-full px-8 pb-12 flex flex-col space-y-6">

        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white truncate max-w-[250px]">{currentTrack.title}</h2>
            <p className="text-lg text-gray-400">{currentTrack.artist}</p>
          </div>
          <button
            onClick={() => downloadTrack(currentTrack)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Download size={20} className="text-blue-400" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full space-y-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${(currentTime / duration) * 100}%, #374151 ${(currentTime / duration) * 100}%)`
            }}
          />
          <div className="flex justify-between text-xs font-medium text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center px-4">
          <button onClick={toggleRepeat} className={`transition-colors ${repeatMode !== 'none' ? 'text-blue-500' : 'text-gray-500'}`}>
            {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>

          <div className="flex items-center space-x-6">
            <button onClick={prevTrack} className="text-white hover:text-gray-300 transition-transform active:scale-95">
              <SkipBack size={32} fill="currentColor" />
            </button>

            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 hover:bg-blue-400 transition-all active:scale-95"
            >
              {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>

            <button onClick={nextTrack} className="text-white hover:text-gray-300 transition-transform active:scale-95">
              <SkipForward size={32} fill="currentColor" />
            </button>
          </div>

          <button onClick={toggleShuffle} className={`transition-colors ${isShuffle ? 'text-blue-500' : 'text-gray-500'}`}>
            <Shuffle size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FullPlayer;
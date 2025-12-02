import React, { useState } from 'react';
import { Play, Pause, Radio } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import MarqueeText from './MarqueeText';
import ArtistSelectorModal from './ArtistSelectorModal';

interface MiniPlayerProps {
  onExpand: () => void;
}

const MiniPlayer: React.FC<MiniPlayerProps> = ({ onExpand }) => {
  const { currentTrack, currentRadio, isRadioMode, isPlaying, togglePlay, duration, currentTime, setSearchState } = usePlayer();
  const [showArtistSelector, setShowArtistSelector] = useState(false);

  if (!currentTrack && !currentRadio) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 rounded-2xl p-3 flex items-center z-30 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 animate-slide-up mini-player-base ${isPlaying ? 'mini-player-opaque' : ''}`}
      style={{ position: 'fixed', bottom: '5rem' }}
      onClick={onExpand}
    >
      {/* Прогресс бар - интегрирован в фон */}
      {!isRadioMode && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden rounded-b-2xl">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-300 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="relative">
        <img
          src={isRadioMode ? currentRadio?.image : currentTrack?.coverUrl}
          alt="Cover"
          className={`w-12 h-12 rounded-xl object-cover mr-4 shadow-lg ${isPlaying ? 'animate-spin-slow' : ''}`}
          style={{ animationDuration: '10s' }}
        />
        {isRadioMode && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black animate-pulse shadow-md" />
        )}
      </div>

      <div className="flex-1 min-w-0 pr-4" onClick={onExpand}>
        <MarqueeText
          text={isRadioMode ? currentRadio?.name || '' : currentTrack?.title || ''}
          className="text-white text-sm font-bold text-glow"
        />
        <MarqueeText
          text={isRadioMode ? currentRadio?.genre || '' : currentTrack?.artist || ''}
          className="text-white/60 text-xs font-medium"
        />
      </div>

      <button
        className="w-10 h-10 flex items-center justify-center rounded-full glass-button text-white hover:bg-white/10 transition-all active:scale-90"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
      >
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
      </button>

      {/* Artist Selector Modal */}
      <ArtistSelectorModal
        isOpen={showArtistSelector}
        onClose={() => setShowArtistSelector(false)}
        artists={currentTrack?.artist.split(',').map(a => a.trim()).filter(a => a) || []}
        onSelectArtist={(artist) => {
          onExpand();
          setSearchState(prev => ({
            ...prev,
            query: artist,
            isArtistSearch: true,
            results: [],
            genreId: null
          }));
        }}
      />
    </div>
  );
};

export default MiniPlayer;

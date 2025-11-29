import React, { useState } from 'react';
import { Play, Heart, MoreVertical } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { hapticFeedback } from '../utils/telegram';

const FavoritesView: React.FC = () => {
    const { favorites, playTrack, toggleFavorite, currentTrack, isPlaying } = usePlayer();
    const [showActionModal, setShowActionModal] = useState(false);
    const [trackToAction, setTrackToAction] = useState<any>(null);

    const handlePlay = (track: any) => {
        hapticFeedback.light();
        playTrack(track, favorites);
    };

    if (favorites.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
                <Heart size={64} className="text-gray-600 mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Нет избранных треков</h2>
                <p className="text-gray-400">Добавьте треки в избранное, чтобы они появились здесь</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <h2 className="text-2xl font-bold text-white mb-4">Избранное</h2>

            <div className="space-y-3">
                {favorites.map((track) => {
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
                                <button
                                    className="p-2 text-red-500 hover:text-red-400 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(track);
                                    }}
                                >
                                    <Heart size={18} fill="currentColor" />
                                </button>
                                <button
                                    className="p-2 text-gray-500 hover:text-white transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTrackToAction(track);
                                        setShowActionModal(true);
                                    }}
                                >
                                    <MoreVertical size={18} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FavoritesView;

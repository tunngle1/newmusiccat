import React, { useState } from 'react';
import { Play, Heart, MoreVertical, Download } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { hapticFeedback } from '../utils/telegram';

const FavoritesView: React.FC = () => {
    const { favorites, playTrack, toggleFavorite, currentTrack, isPlaying, playlists, addToPlaylist, downloadTrack } = usePlayer();
    const [showActionModal, setShowActionModal] = useState(false);
    const [trackToAction, setTrackToAction] = useState<any>(null);

    // Scroll to top on mount
    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

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

            {/* Action Modal (Add to Playlist / Download) */}
            {showActionModal && trackToAction && (
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
                                <Download size={20} />
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
            )}
        </div>
    );
};

export default FavoritesView;

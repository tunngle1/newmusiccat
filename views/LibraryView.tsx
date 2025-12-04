import React, { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';
import { API_BASE_URL } from '../constants';
import { storage } from '../utils/storage';
import { Loader2, FileAudio, Upload, Music2, Play, Clock, Trash2 } from 'lucide-react';

const LibraryView: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    removeDownloadedTrack,
    togglePlay,
    downloadProgress,
    downloadTrack,
    downloadedTracks,
    downloadQueue,
    isDownloading: isDownloadingId,
    downloadToChat,
    downloadToChatQueue,
    isDownloadingToChat,
    addTrack,
    playTrack
  } = usePlayer();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);
  const [foundYoutubeTrack, setFoundYoutubeTrack] = useState<Track | null>(null);

  const loadLibraryTracks = async () => {
    const storedTracks = await storage.getAllTracks();
    // Filter only downloaded tracks (isLocal = true)
    const storedDownloadedTracks = storedTracks.filter(t => t.isLocal);

    // Merge with downloadQueue
    // Create a map by ID to avoid duplicates
    const allTracksMap = new Map<string, Track>();

    // First add stored tracks
    storedDownloadedTracks.forEach(track => {
      allTracksMap.set(track.id, track);
    });

    // Then add queue tracks if not present
    if (downloadQueue && Array.isArray(downloadQueue)) {
      downloadQueue.forEach(track => {
        if (!allTracksMap.has(track.id)) {
          allTracksMap.set(track.id, track);
        }
      });
    }

    const combinedTracks = Array.from(allTracksMap.values());
    setLibraryTracks(combinedTracks.reverse());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file: File) => {
        // Создаем временный URL для локального файла
        const objectUrl = URL.createObjectURL(file);

        // Попытка извлечь метаданные (здесь упрощенно используем имя файла)
        const nameParts = file.name.replace(/\.[^/.]+$/, "").split('-');
        const artist = nameParts.length > 1 ? nameParts[0].trim() : 'Неизвестный исполнитель';
        const title = nameParts.length > 1 ? nameParts[1].trim() : nameParts[0].trim();

        const newTrack: Track = {
          id: `local_${Date.now()}_${Math.random()}`,
          title,
          artist,
          coverUrl: `https://picsum.photos/400/400?random=${Date.now()}`,
          audioUrl: objectUrl,
          duration: 0,
          isLocal: true
        };

        addTrack(newTrack);
        // Можно также сохранять загруженные файлы в storage, но пока оставим только в памяти
      });
    }
  };

  useEffect(() => {
    loadLibraryTracks();
  }, []);

  // Sync library tracks with downloadedTracks and downloadQueue from context
  useEffect(() => {
    loadLibraryTracks();
  }, [downloadedTracks, downloadQueue]);

  const handleYoutubeSearch = async () => {
    if (!youtubeUrl.trim()) return;
    setIsYoutubeLoading(true);
    setFoundYoutubeTrack(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/youtube/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      });
      if (!response.ok) throw new Error('Не удалось найти видео');
      const trackData = await response.json();

      // Map backend response to Track interface
      // IMPORTANT: Map 'url' (from backend) to 'audioUrl' (expected by frontend)
      const track: Track = {
        ...trackData,
        audioUrl: trackData.url,
        coverUrl: trackData.image
      };

      setFoundYoutubeTrack(track);
    } catch (e) {
      alert('Ошибка: ' + e);
    } finally {
      setIsYoutubeLoading(false);
    }
  };

  const handleYoutubeDownload = async (target: 'app' | 'chat') => {
    if (!foundYoutubeTrack) return;

    try {
      if (target === 'app') {
        // Use downloadTrack from context - it handles progress tracking
        downloadTrack(foundYoutubeTrack);
        setYoutubeUrl('');
        setFoundYoutubeTrack(null);
      } else {
        // Download to Chat using context queue
        downloadToChat(foundYoutubeTrack);
        alert('Трек добавлен в очередь отправки в чат!');
        setYoutubeUrl('');
        setFoundYoutubeTrack(null);
      }
    } catch (e) {
      alert('Ошибка: ' + e);
    }
  };

  const handleDelete = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (confirm('Удалить этот трек из загрузок?')) {
      await removeDownloadedTrack(trackId);
      setLibraryTracks(prev => prev.filter(t => t.id !== trackId));
    }
  };

  // Helper to check if a track is in the chat download queue
  const isTrackInChatQueue = (trackId: string) => {
    return isDownloadingToChat === trackId || downloadToChatQueue.some(t => t.id === trackId);
  };

  return (
    <div className="px-4 py-8 space-y-6 animate-fade-in-up pb-24">
      <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
        Медиатека
      </h1>

      {/* YouTube Download Section */}
      <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="text-red-500">▶</span> Скачать с YouTube
        </h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Ссылка на видео..."
            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50"
          />
          <button
            onClick={handleYoutubeSearch}
            disabled={isYoutubeLoading || !youtubeUrl}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isYoutubeLoading ? <Loader2 size={16} className="animate-spin" /> : 'Найти'}
          </button>
        </div>

        {foundYoutubeTrack && (
          <div className="bg-black/20 rounded-lg p-3 flex items-center gap-3 mt-2">
            <img src={foundYoutubeTrack.image} alt="Cover" className="w-10 h-10 rounded object-cover" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{foundYoutubeTrack.title}</div>
              <div className="text-xs text-gray-400 truncate">{foundYoutubeTrack.artist}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleYoutubeDownload('app')}
                className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50"
                title="Скачать в приложение"
              >
                <FileAudio size={18} />
              </button>
              <button
                onClick={() => handleYoutubeDownload('chat')}
                disabled={isTrackInChatQueue(foundYoutubeTrack.id)}
                className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-50"
                title="Отправить в чат"
              >
                {isTrackInChatQueue(foundYoutubeTrack.id) ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="w-full h-24 border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center bg-gray-900/30 hover:bg-gray-800/50 transition-colors cursor-pointer group"
      >
        <Upload size={24} className="text-gray-500 group-hover:text-blue-400 mb-2 transition-colors" />
        <span className="text-sm font-medium text-gray-400 group-hover:text-gray-300">Загрузить файл</span>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="audio/*"
          multiple
          className="hidden"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-200">
          <Music2 size={20} className="text-blue-500" />
          <span>Скачанные треки</span>
          <span className="text-xs text-gray-500 font-normal ml-2">({libraryTracks.length})</span>
        </h2>

        {libraryTracks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm bg-white/5 rounded-2xl">
            <Music2 size={32} className="mx-auto mb-3 opacity-20" />
            <p>Здесь пока пусто.</p>
            <p className="text-xs mt-1">Скачивайте музыку, чтобы слушать её офлайн.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {libraryTracks.map(track => {
              const isCurrent = currentTrack?.id === track.id;
              const progress = downloadProgress.get(track.id);
              // It is downloading if progress is defined and < 100
              const isDownloading = progress !== undefined && progress < 100;

              // It is pending if it is in the queue, but NOT the one currently downloading (isDownloadingId)
              // AND it doesn't have active progress yet.
              // Actually, simpler check: if it's in downloadQueue but progress is undefined
              const isInQueue = downloadQueue.some(t => t.id === track.id);
              const isPending = isInQueue && progress === undefined && track.id !== isDownloadingId;

              return (
                <div
                  key={track.id}
                  onClick={() => {
                    if (!isDownloading && !isPending) {
                      if (currentTrack?.id === track.id) {
                        togglePlay();
                      } else {
                        playTrack(track, libraryTracks);
                      }
                    }
                  }}
                  className={`flex items-center p-3 rounded-xl transition-all ${isDownloading || isPending ? 'cursor-default' : 'cursor-pointer'} ${isCurrent ? 'bg-white/10 border border-white/5' : 'bg-gray-800/30 border border-transparent hover:bg-gray-800/50'
                    }`}
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 mr-3">
                    <img
                      src={track.coverUrl || track.image}
                      alt={track.title}
                      className={`w-full h-full object-cover ${(isDownloading || isPending) ? 'opacity-50' : ''}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(track.artist)}&size=200&background=random`;
                      }}
                    />
                    {!isDownloading && !isPending && (
                      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
                        {isCurrent && isPlaying ? (
                          <div className="flex space-x-[2px] items-end h-3">
                            <div className="w-[2px] bg-white animate-bounce h-2"></div>
                            <div className="w-[2px] bg-white animate-bounce h-3 delay-75"></div>
                            <div className="w-[2px] bg-white animate-bounce h-2 delay-150"></div>
                          </div>
                        ) : (
                          <Play size={16} fill="white" />
                        )}
                      </div>
                    )}

                    {isPending && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Clock size={20} className="text-white/80" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{track.title}</div>
                    <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                  </div>
                  {!isDownloading && !isPending && (
                    <button onClick={(e) => handleDelete(e, track.id)} className="p-2 text-gray-500 hover:text-red-400">
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryView;
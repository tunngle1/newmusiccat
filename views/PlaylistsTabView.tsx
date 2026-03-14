import React from 'react';
import { SendIcon, MenuIcon, PlaylistIcon } from '../components/newdesign/Icons';
import { Track, Playlist } from '../types';

interface PlaylistsTabViewProps {
  playlists: Playlist[];
  allTracks: Track[];
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;
  isCoverColor: boolean;
  downloadPlaylistToChat: (name: string, tracks: Track[]) => void;
  setEditPlaylistTitle: (title: string) => void;
  setEditPlaylistCover: (cover: Blob | null) => void;
  setIsPlaylistEditOpen: (open: boolean) => void;
  renderTrackItem: (track: Track, index: number, list: Track[], context?: { playlistId: string }) => React.ReactNode;
}

const PlaylistsTabView: React.FC<PlaylistsTabViewProps> = ({
  playlists,
  allTracks,
  selectedPlaylistId,
  setSelectedPlaylistId,
  isCoverColor,
  downloadPlaylistToChat,
  setEditPlaylistTitle,
  setEditPlaylistCover,
  setIsPlaylistEditOpen,
  renderTrackItem
}) => {
  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) || null;
  const playlistTracks = selectedPlaylist
    ? selectedPlaylist.trackIds
      .map(id => allTracks.find(t => t.id === id))
      .filter(Boolean) as Track[]
    : [];

  return (
    <div className="flex flex-col h-full">
      {selectedPlaylist && (
        <div className="p-6 border-b-2 border-lebedev-white flex justify-end items-center bg-lebedev-black sticky top-0 z-10 gap-3">
          {playlistTracks.length > 0 && (
            <button
              onClick={() => {
                downloadPlaylistToChat(selectedPlaylist.name, playlistTracks);
              }}
              className="p-2 rounded-full hover:bg-lebedev-red/20 transition-colors group"
              title="Скачать плейлист в чат"
            >
              <SendIcon className="w-6 h-6 text-lebedev-red group-hover:scale-110 transition-transform" />
            </button>
          )}
          <button
            onClick={() => {
              setEditPlaylistTitle(selectedPlaylist.name);
              setEditPlaylistCover(null);
              setIsPlaylistEditOpen(true);
            }}
            className="p-2 rounded-full hover:bg-lebedev-white/10 transition-colors"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
        </div>
      )}

      {!selectedPlaylist ? (
        <div className="p-4 grid grid-cols-2 gap-4">
          {playlists.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-lebedev-gray opacity-50 uppercase font-bold tracking-widest">
              Пусто. Создайте первый плейлист.
            </div>
          ) : (
            playlists.map((pl) => (
              <div
                key={pl.id}
                className="group cursor-pointer"
                onClick={() => {
                  setSelectedPlaylistId(pl.id);
                }}
              >
                <div className="aspect-square border border-lebedev-white mb-2 relative overflow-hidden">
                  {pl.coverUrl ? (
                    <img
                      src={pl.coverUrl}
                      className={`w-full h-full object-cover ${isCoverColor ? '' : 'grayscale'} brightness-75 group-hover:scale-110 group-hover:brightness-100 group-hover:grayscale-0 transition-all duration-700 ease-out`}
                    />
                  ) : (
                    <div className="w-full h-full bg-lebedev-white/10 flex items-center justify-center">
                      <PlaylistIcon className="w-12 h-12 text-lebedev-gray" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 bg-lebedev-black/80 px-2 py-1 text-xs font-mono text-lebedev-red">
                    {pl.trackIds.length} треков
                  </div>
                </div>
                <h3 className="font-bold uppercase truncate">{pl.name}</h3>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-4 border-b border-lebedev-white bg-lebedev-black sticky top-0 z-10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <PlaylistIcon className="w-5 h-5 text-lebedev-gray" />
              <span className="text-xs font-bold uppercase tracking-widest text-lebedev-gray">
                {playlistTracks.length} треков
              </span>
            </div>
          </div>
          <div className="divide-y divide-lebedev-white/20">
            {playlistTracks.length === 0 ? (
              <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
                В этом плейлисте пока нет треков.
              </div>
            ) : (
              playlistTracks.map((track, idx) => renderTrackItem(track, idx, playlistTracks, { playlistId: selectedPlaylist.id }))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaylistsTabView;

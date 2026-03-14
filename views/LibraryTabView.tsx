import React from 'react';
import { YoutubeIcon, LibraryIcon } from '../components/newdesign/Icons';
import { Track } from '../types';

interface LibraryTabViewProps {
  youtubeLink: string;
  setYoutubeLink: (value: string) => void;
  libraryTracks: Track[];
  renderTrackItem: (track: Track, index: number, list: Track[]) => React.ReactNode;
}

const LibraryTabView: React.FC<LibraryTabViewProps> = ({
  youtubeLink,
  setYoutubeLink,
  libraryTracks,
  renderTrackItem
}) => (
  <div className="flex flex-col min-h-full">
    {/* YouTube Section with "Coming Soon" overlay */}
    <div className="relative p-6 border-b-4 border-lebedev-white bg-lebedev-black">
      {/* Blurred overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-black uppercase tracking-widest text-lebedev-white mb-2">Скоро</div>
          <div className="text-xs uppercase tracking-widest text-lebedev-gray">Скачивание с YouTube появится позже</div>
        </div>
      </div>

      {/* Original YouTube content (blurred behind) */}
      <div className="flex items-center gap-2 mb-4 text-lebedev-red">
        <YoutubeIcon className="w-6 h-6" />
        <span className="text-sm font-black uppercase tracking-widest">YouTube загрузчик</span>
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={youtubeLink}
          onChange={(e) => setYoutubeLink(e.target.value)}
          placeholder="Вставьте ссылку..."
          className="w-full bg-transparent border-2 border-lebedev-white p-3 text-sm uppercase placeholder-lebedev-gray/50 focus:outline-none focus:border-lebedev-red font-bold"
          disabled
        />
        <button
          disabled
          className="w-full p-4 font-black uppercase tracking-widest text-sm bg-lebedev-gray cursor-not-allowed"
        >
          Найти
        </button>
      </div>
    </div>

    <div className="p-4 border-b border-lebedev-white/20 bg-lebedev-black sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <LibraryIcon className="w-5 h-5 text-lebedev-gray" />
        <span className="text-xs font-bold uppercase tracking-widest text-lebedev-gray">
          Скачано ({libraryTracks.length})
        </span>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto">
      {libraryTracks.length === 0 ? (
        <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
          Пусто.
        </div>
      ) : (
        <div className="divide-y divide-lebedev-white/10">
          {libraryTracks.map((track, index) => renderTrackItem(track, index, libraryTracks))}
        </div>
      )}
    </div>
  </div>
);

export default LibraryTabView;

import React from 'react';
import { HeartIcon } from '../components/newdesign/Icons';
import { RadioStation } from '../types';

interface RadioTabViewProps {
  radioStations: RadioStation[];
  radioLoading: boolean;
  radioError: string | null;
  favoriteRadios: Set<string>;
  currentRadio: RadioStation | null;
  isRadioMode: boolean;
  isPlaying: boolean;
  togglePlay: () => void;
  playRadio: (station: RadioStation) => void;
  toggleFavoriteRadio: (radioId: string) => void | Promise<void>;
}

const RadioTabView: React.FC<RadioTabViewProps> = ({
  radioStations,
  radioLoading,
  radioError,
  favoriteRadios,
  currentRadio,
  isRadioMode,
  isPlaying,
  togglePlay,
  playRadio,
  toggleFavoriteRadio
}) => {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pb-4 space-y-4">
        {radioLoading && (
          <div className="text-center text-lebedev-gray uppercase font-bold tracking-widest">Загружаем станции...</div>
        )}
        {radioError && (
          <div className="text-center text-lebedev-red uppercase font-bold tracking-widest">{radioError}</div>
        )}
        {!radioLoading && !radioError && radioStations.length === 0 && (
          <div className="text-center text-lebedev-gray uppercase font-bold tracking-widest opacity-60">Станций нет</div>
        )}

        <div className="-mx-4 w-[calc(100%+32px)] divide-y divide-lebedev-white/20">
          {[...radioStations]
            .sort((a, b) => {
              const favA = favoriteRadios.has(a.id) ? 1 : 0;
              const favB = favoriteRadios.has(b.id) ? 1 : 0;
              return favB - favA;
            })
            .map((station, idx, arr) => {
              const isFav = favoriteRadios.has(station.id);
              const isActive = currentRadio?.id === station.id && isRadioMode;
              const isLast = idx === arr.length - 1;
              return (
                <div
                  key={station.id}
                  className={`flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-lebedev-white/10 transition-colors border-b border-lebedev-white/20 ${isActive ? 'bg-lebedev-white/10' : ''} ${isLast ? 'border-b-0' : ''}`}
                  onClick={() => {
                    if (isActive && isPlaying) {
                      togglePlay();
                    } else {
                      playRadio(station);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 px-4">
                    <div className="flex flex-col min-w-0">
                      <div className="text-sm font-black uppercase truncate">{station.name}</div>
                      <div className="text-[11px] uppercase text-lebedev-gray truncate">{station.genre}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 min-w-[200px] justify-end">
                    <span className={`text-[11px] font-black uppercase min-w-[38px] text-center ${isActive && isPlaying ? 'text-[#ef4444]' : 'text-transparent'}`}>
                      Live
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteRadio(station.id);
                      }}
                      className={`p-2 rounded-full transition-colors shrink-0 ${isFav ? 'text-white' : 'text-lebedev-gray hover:text-white'}`}
                      title="Избранное радио"
                    >
                      <HeartIcon className={`w-4 h-4 ${isFav ? 'fill-white' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive && isPlaying) {
                          togglePlay();
                        } else {
                          playRadio(station);
                        }
                      }}
                      className="px-3 py-1 text-[11px] font-bold uppercase bg-lebedev-white text-lebedev-black hover:bg-lebedev-red hover:text-white transition-colors min-w-[82px] text-center"
                    >
                      {isActive && isPlaying ? 'Пауза' : 'Слушать'}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default RadioTabView;

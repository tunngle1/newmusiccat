import React from 'react';
import { Home, Library, ListMusic, Heart, Radio } from 'lucide-react';
import { ViewState } from '../types';

interface BottomNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate }) => {
  const getItemClass = (view: ViewState) =>
    `flex flex-col items-center justify-center space-y-1 w-full h-full rounded-xl transition-all ${
      currentView === view
        ? 'bg-white text-black shadow-lg scale-[1.03]'
        : 'text-gray-300 hover:text-white'
    }`;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#0c0c12] border-t border-white/15 shadow-[0_-10px_30px_rgba(0,0,0,0.45)] flex justify-between items-center px-6 z-40 pb-safe">
      <button className={getItemClass(ViewState.HOME)} onClick={() => onNavigate(ViewState.HOME)}>
        <Home size={24} />
        <span className="text-[10px] font-medium">Главная</span>
      </button>
      <button className={getItemClass(ViewState.PLAYLISTS)} onClick={() => onNavigate(ViewState.PLAYLISTS)}>
        <ListMusic size={24} />
        <span className="text-[10px] font-medium">Плейлисты</span>
      </button>
      <button className={getItemClass(ViewState.FAVORITES)} onClick={() => onNavigate(ViewState.FAVORITES)}>
        <Heart size={24} />
        <span className="text-[10px] font-medium">Избранное</span>
      </button>
      <button className={getItemClass(ViewState.RADIO)} onClick={() => onNavigate(ViewState.RADIO)}>
        <Radio size={24} />
        <span className="text-[10px] font-medium">Радио</span>
      </button>
      <button className={getItemClass(ViewState.LIBRARY)} onClick={() => onNavigate(ViewState.LIBRARY)}>
        <Library size={24} />
        <span className="text-[10px] font-medium">Медиатека</span>
      </button>
    </div>
  );
};

export default BottomNav;

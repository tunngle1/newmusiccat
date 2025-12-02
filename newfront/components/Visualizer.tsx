import React from 'react';

export const Visualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  return (
    <div className="flex items-end gap-[2px] h-8 w-12 opacity-80">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-full bg-lebedev-red transition-all duration-300 ease-linear ${
            isPlaying ? 'animate-pulse' : 'h-1'
          }`}
          style={{
            height: isPlaying ? `${Math.random() * 80 + 20}%` : '10%',
            animationDuration: `${0.4 + i * 0.1}s`
          }}
        />
      ))}
    </div>
  );
};

import React from 'react';

interface ArtistSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    artists: string[];
    onSelectArtist: (artist: string) => void;
}

const ArtistSelectorModal: React.FC<ArtistSelectorModalProps> = ({
    isOpen,
    onClose,
    artists,
    onSelectArtist
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md border-2 border-lebedev-white bg-lebedev-black text-lebedev-white shadow-[0_-16px_40px_rgba(0,0,0,0.6)] animate-slide-up p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black uppercase tracking-wider">Выберите артиста</h3>
                    <button className="text-lebedev-gray hover:text-lebedev-red transition-colors" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="max-h-80 overflow-y-auto scrollbar-hidden divide-y divide-lebedev-white/20">
                    {artists.map((artist, index) => (
                        <button
                            key={index}
                            className="w-full p-4 text-left hover:bg-lebedev-white/10 transition-all"
                            onClick={() => {
                                onSelectArtist(artist);
                                onClose();
                            }}
                        >
                            <span className="text-lebedev-white font-bold uppercase tracking-wider">{artist}</span>
                        </button>
                    ))}
                </div>

                <button
                    className="w-full mt-4 py-3 border border-lebedev-white font-bold uppercase tracking-widest text-lebedev-white hover:bg-lebedev-white hover:text-lebedev-black transition-colors"
                    onClick={onClose}
                >
                    Отмена
                </button>
            </div>
        </div>
    );
};

export default ArtistSelectorModal;

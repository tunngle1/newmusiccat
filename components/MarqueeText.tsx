import React, { useEffect, useRef, useState } from 'react';

interface MarqueeTextProps {
    text: string;
    className?: string;
}

const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = '' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [needsMarquee, setNeedsMarquee] = useState(false);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && measureRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const textWidth = measureRef.current.offsetWidth;
                setNeedsMarquee(textWidth > containerWidth);
            }
        };

        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [text]);

    return (
        <div ref={containerRef} className={`marquee-container ${className} relative overflow-hidden`}>
            {/* Hidden element for measurement */}
            <div
                ref={measureRef}
                className="absolute opacity-0 pointer-events-none whitespace-nowrap"
                aria-hidden="true"
            >
                {text}
            </div>

            {/* Visible content */}
            <div className={`whitespace-nowrap ${needsMarquee ? 'marquee' : 'truncate'}`}>
                {text}
                {needsMarquee && <span className="ml-8">{text}</span>}
            </div>
        </div>
    );
};

export default MarqueeText;

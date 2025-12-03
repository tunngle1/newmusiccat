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
                setNeedsMarquee(textWidth > containerWidth && containerWidth > 0);
            }
        };

        // Initial + delayed measure to catch late font/render
        checkOverflow();
        const timeoutId = window.setTimeout(checkOverflow, 50);

        // Track container size changes
        const observer = new ResizeObserver(checkOverflow);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        window.addEventListener('resize', checkOverflow);
        window.addEventListener('orientationchange', checkOverflow);

        return () => {
            window.clearTimeout(timeoutId);
            observer.disconnect();
            window.removeEventListener('resize', checkOverflow);
            window.removeEventListener('orientationchange', checkOverflow);
        };
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

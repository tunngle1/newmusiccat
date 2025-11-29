import React, { useEffect, useRef, useState } from 'react';

interface MarqueeTextProps {
    text: string;
    className?: string;
}

const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = '' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [needsMarquee, setNeedsMarquee] = useState(false);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const textWidth = textRef.current.scrollWidth;
                setNeedsMarquee(textWidth > containerWidth);
            }
        };

        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [text]);

    return (
        <div ref={containerRef} className={`marquee-container ${className}`}>
            <div ref={textRef} className={needsMarquee ? 'marquee' : ''}>
                {text}
                {needsMarquee && <span className="ml-8">{text}</span>}
            </div>
        </div>
    );
};

export default MarqueeText;

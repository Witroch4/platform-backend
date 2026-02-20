"use client";

import { useEffect, useState } from "react";

interface CountUpProps {
    end: number;
    duration?: number;
    separator?: string;
    className?: string;
}

export function CountUp({ end, duration = 2, separator = ".", className }: CountUpProps) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTimestamp: number | null = null;
        let animationFrameId: number;

        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);

            // easeOutExpo
            const easingProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

            setCount(Math.floor(easingProgress * end));

            if (progress < 1) {
                animationFrameId = window.requestAnimationFrame(step);
            }
        };

        animationFrameId = window.requestAnimationFrame(step);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [end, duration]);

    const formattedCount = new Intl.NumberFormat("pt-BR").format(count);

    return <span className={className}>{formattedCount}</span>;
}

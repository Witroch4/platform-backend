import React from 'react';

export function InstagramAnimatedIcon({ isActive }: { isActive: boolean }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 32" width="18" height="18" className={`ig-wrapper shrink-0 ${isActive ? 'is-active' : ''}`}>
            <defs>
                <style>
                    {`
            /* Container */
            .ig-wrapper {
              cursor: pointer;
            }

            /* Gradient Definition */
            .ig-gradient {
              fill: url(#inst-grad);
              fill-opacity: 0;
              transition: fill-opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            }
            .ig-wrapper.is-active .ig-gradient {
              fill-opacity: 1 !important;
              animation: ig-pulse 4s infinite alternate ease-in-out !important;
            }

            @keyframes ig-pulse {
              0%   { filter: hue-rotate(0deg) brightness(1); }
              50%  { filter: hue-rotate(15deg) brightness(1.1); }
              100% { filter: hue-rotate(-10deg) brightness(0.95); }
            }

            /* Base Outline */
            .ig-outline {
              stroke: #94a3b8; /* Slate gray outline */
              stroke-width: 2;
              fill: none;
              stroke-linecap: round;
              stroke-linejoin: round;
              transition: stroke 0.6s ease !important;
            }
            .ig-wrapper.is-active .ig-outline {
              stroke: #ffffff !important;
            }

            /* Central Lens / Camera Icon Bloom */
            .ig-lens {
              fill: none;
              stroke: #94a3b8;
              stroke-width: 2;
              transition: stroke 0.6s ease, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
              transform-origin: 12px 12px;
            }
            .ig-wrapper.is-active .ig-lens {
              stroke: #ffffff !important;
            }

            .ig-bloom {
              fill: #ffffff;
              opacity: 0;
              transform-origin: 12px 12px;
              transition: opacity 0.6s ease, transform 0.6s ease !important;
              transform: scale(0.5);
            }
            .ig-wrapper.is-active .ig-bloom {
              opacity: 0.3 !important;
              transform: scale(1.5) !important;
              animation: lens-glow 4s infinite alternate ease-in-out !important;
            }

            @keyframes lens-glow {
              0%   { transform: scale(1.5); opacity: 0.3; }
              50%  { transform: scale(1.8); opacity: 0.5; }
              100% { transform: scale(1.4); opacity: 0.2; }
            }

            /* Top Right Dot */
            .ig-dot {
              fill: #94a3b8;
              transition: fill 0.6s ease !important;
            }
            .ig-wrapper.is-active .ig-dot {
              fill: #ffffff !important;
            }

            /* Subtle scale down/up on click for responsiveness */
            .ig-icon-group {
              transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
              transform-origin: 12px 12px;
            }
            .ig-wrapper:active .ig-icon-group {
              transform: scale(0.9);
            }
            .ig-wrapper.is-active .ig-icon-group {
              transform: scale(1.05);
            }
          `}
                </style>

                <linearGradient id="inst-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f09433" />
                    <stop offset="25%" stopColor="#e6683c" />
                    <stop offset="50%" stopColor="#dc2743" />
                    <stop offset="75%" stopColor="#cc2366" />
                    <stop offset="100%" stopColor="#bc1888" />
                </linearGradient>
            </defs>

            <g aria-label="Animated Instagram Logo" className="ig-icon-group">
                {/* Background Gradient Fill (Hidden initially) */}
                <rect className="ig-gradient" x="2" y="2" width="20" height="20" rx="5" ry="5" />

                {/* Outline Box */}
                <rect className="ig-outline" x="2" y="2" width="20" height="20" rx="5" ry="5" />

                {/* Light Bloom Behind Lens */}
                <circle className="ig-bloom" cx="12" cy="12" r="4" />

                {/* Central Camera Lens */}
                <path className="ig-lens" d="M16 11.37 A4 4 0 1 1 12.63 8 A4 4 0 0 1 16 11.37 z" />

                {/* Top Right Dot */}
                <line className="ig-dot" x1="17.5" y1="6.5" x2="17.51" y2="6.5" strokeWidth="2" strokeLinecap="round" />
            </g>
        </svg>
    );
}

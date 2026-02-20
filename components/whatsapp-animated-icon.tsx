import React from 'react';

export function WhatsAppAnimatedIcon({ isActive }: { isActive: boolean }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36" width="18" height="18" className={`wa-wrapper shrink-0 ${isActive ? 'is-active' : ''}`}>
            <defs>
                <style>
                    {`
            /* Glow Effect */
            .glow {
              fill: #25D366;
              opacity: 0;
              transition: opacity 0.5s ease !important;
              transform-origin: 12px 12px;
            }
            .wa-wrapper.is-active .glow {
              animation: wa-pulse 3s infinite cubic-bezier(0.2, 0, 0.4, 1) !important;
            }
            @keyframes wa-pulse {
              0% { transform: scale(0.9); opacity: 0; }
              20% { opacity: 0.25; }
              50% { transform: scale(1.4); opacity: 0; }
              100% { transform: scale(1.4); opacity: 0; }
            }

            /* Animated Container (Pop Effect) */
            .wa-icon {
              transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
              transform-origin: 12px 12px;
            }
            .wa-wrapper.is-active .wa-icon {
              transform: scale(1.05) !important; /* Slight pop out */
            }

            /* Chat Bubble */
            .bubble {
              fill: #25D366;
              fill-opacity: 0;
              stroke: #94a3b8; /* Sleek Monochrome when inactive */
              stroke-width: 1.5;
              stroke-linecap: round;
              stroke-linejoin: round;
              transition: fill-opacity 0.6s ease, stroke 0.6s ease !important;
            }
            .wa-wrapper.is-active .bubble {
              fill-opacity: 1 !important;
              stroke: #25D366 !important;
            }

            /* Inner Phone Receiver */
            .receiver {
              fill: #94a3b8; /* Sleek Monochrome when inactive */
              transition: fill 0.6s ease !important;
              transform-origin: 12px 12px;
            }
            .wa-wrapper.is-active .receiver {
              fill: #ffffff !important;
              animation: wa-ring 4s infinite ease-in-out !important;
            }
            
            /* Ringing animation: fast shakes and then rests */
            @keyframes wa-ring {
              0%   { transform: rotate(0deg); }
              4%   { transform: rotate(15deg); }
              8%   { transform: rotate(-10deg); }
              12%  { transform: rotate(10deg); }
              16%  { transform: rotate(-5deg); }
              20%  { transform: rotate(5deg); }
              24%  { transform: rotate(0deg); }
              100% { transform: rotate(0deg); }
            }
          `}
                </style>
            </defs>

            <g aria-label="Animated WhatsApp Logo">
                {/* Pulsing Glow Outline Behind Everything */}
                <path className="glow" d="M12 2 C6.477 2 2 6.477 2 12 C2 13.8 2.5 15.5 3.3 17 L2 22 L7.2 20.6 C8.7 21.5 10.3 22 12 22 C17.523 22 22 17.523 22 12 C22 6.477 17.523 2 12 2 Z" />

                <g className="wa-icon">
                    {/* Chat Bubble */}
                    <path className="bubble" d="M12 2.5 C6.753 2.5 2.5 6.753 2.5 12 C2.5 13.78 3 15.45 3.86 16.92 L2.72 21.08 L6.97 19.98 C8.46 20.9 10.18 21.5 12 21.5 C17.247 21.5 21.5 17.247 21.5 12 C21.5 6.753 17.247 2.5 12 2.5 Z" />

                    {/* Phone Receiver */}
                    <path className="receiver" d="M16.53 14.1 c-0.25-0.12 -1.47-0.73 -1.7-0.81 -0.23-0.08 -0.4-0.12 -0.56 0.13 -0.17 0.25 -0.64 0.81 -0.79 0.97 -0.14 0.17 -0.29 0.19 -0.54 0.06 -1.08-0.53 -2.29-1.23 -3.33-2.62 -0.27-0.36 0.31-0.33 0.79-1.29 0.08-0.17 0.04-0.31 -0.02-0.44 -0.06-0.12 -0.56-1.35 -0.77-1.85 -0.21-0.49 -0.41-0.42 -0.56-0.43 -0.15-0.01 -0.31-0.01 -0.48-0.01 -0.17 0 -0.44 0.06 -0.66 0.31 -0.23 0.25 -0.87 0.85 -0.87 2.07 s 0.89 2.4 1.02 2.57 c 0.12 0.17 1.75 2.67 4.24 3.75 1.41 0.61 2.05 0.66 2.83 0.57 0.64-0.08 1.47-0.6 1.68-1.18 0.21-0.58 0.21-1.08 0.15-1.18 -0.07-0.11 -0.23-0.17 -0.48-0.29 Z" />
                </g>
            </g>
        </svg>
    );
}

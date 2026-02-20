import React, { useState } from 'react';

export function RobotAnimatedIcon({
  isActive: controlledIsActive,
  onClick,
  className = ""
}: {
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const [internalIsActive, setInternalIsActive] = useState(false);
  const isActive = controlledIsActive !== undefined ? controlledIsActive : internalIsActive;

  const handleClick = (e: React.MouseEvent) => {
    if (controlledIsActive === undefined) {
      setInternalIsActive(!internalIsActive);
    }
    onClick?.();
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-10 -10 120 120"
      className={`robot-wrapper cursor-pointer shrink-0 ${isActive ? 'is-active' : ''} ${className}`}
      onClick={handleClick}
      aria-label="Transforming Robot Logo"
      width="100%"
      height="100%"
    >
      <defs>
        <style>
          {`
            /* Container */
            .robot-wrapper {
              overflow: visible;
            }

            /* Base Part setup - Explosion Origin is the bottom center box */
            .part {
              transform-origin: 50px 75px; 
              transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            }
            .color-transition {
              transition: fill 0.6s ease, stroke 0.6s ease, opacity 0.4s ease !important;
            }

            /* --- Inactive States (Dormant Box) --- */
            .head { transform: translateY(40px) scale(0.65); fill: #64748b; }
            .jaw { fill: #475569; }
            .antenna { stroke: #64748b; opacity: 0.5; }
            .antenna-ball { fill: #64748b; opacity: 0.5; }
            .eye { fill: #475569; transition: fill 0.6s ease, filter 0.6s ease !important; }
            
            .torso, .shoulder, .arm, .pelvis, .leg, .core { 
              transform: translateY(10px) scale(0); 
              opacity: 0; 
              fill: #64748b; 
            }

            /* --- Active States (Assembled Robot) --- */
            .robot-wrapper.is-active .head { transform: translateY(0px) scale(1) !important; fill: #0f172a !important; }
            .robot-wrapper.is-active .jaw { fill: #cbd5e1 !important; }
            .robot-wrapper.is-active .antenna { stroke: #e0f2fe !important; opacity: 1 !important; transition-delay: 0.2s !important; }
            .robot-wrapper.is-active .antenna-ball { fill: #f97316 !important; opacity: 1 !important; transition-delay: 0.2s !important; }
            .robot-wrapper.is-active .eye { fill: #06b6d4 !important; filter: drop-shadow(0 0 6px #06b6d4) !important; transition-delay: 0.4s !important; }

            .robot-wrapper.is-active .torso { transform: translateY(0) scale(1) !important; opacity: 1 !important; fill: #2563eb !important; transition-delay: 0.1s !important; }
            .robot-wrapper.is-active .core { transform: translateY(0) scale(1) !important; opacity: 1 !important; fill: #22d3ee !important; transition-delay: 0.4s !important; animation: core-pulse 2s infinite alternate 0.6s !important; }

            .robot-wrapper.is-active .shoulder { transform: translateY(0) scale(1) !important; opacity: 1 !important; fill: #f97316 !important; transition-delay: 0.25s !important; }
            .robot-wrapper.is-active .arm { transform: translateY(0) scale(1) !important; opacity: 1 !important; fill: #1e293b !important; transition-delay: 0.35s !important; }

            .robot-wrapper.is-active .pelvis { transform: translateY(0) scale(1) !important; opacity: 1 !important; fill: #1e293b !important; transition-delay: 0.2s !important; }
            .robot-wrapper.is-active .leg { transform: translateY(0) scale(1) !important; opacity: 1 !important; fill: #2563eb !important; transition-delay: 0.4s !important; }

            /* --- Box Elements --- */
            .flap { fill: #94a3b8; transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), fill 0.6s ease !important; }
            .flap-l { transform: translate(35px, 65px) rotate(-15deg); }
            .flap-r { transform: translate(65px, 65px) rotate(15deg); }
            .box-front { fill: #94a3b8; transition: transform 0.4s ease, height 0.4s ease, fill 0.6s ease, rx 0.4s ease !important; }

            /* Flatten box when active */
            .robot-wrapper.is-active .flap-l { transform: translate(35px, 92px) rotate(-165deg) !important; fill: #475569 !important; }
            .robot-wrapper.is-active .flap-r { transform: translate(65px, 92px) rotate(165deg) !important; fill: #475569 !important; }
            .robot-wrapper.is-active .box-front { height: 4px !important; transform: translateY(27px) !important; fill: #475569 !important; rx: 2px !important; }

            /* Floating effect for entire body */
            .robot-body-group {
              transition: transform 0.6s ease !important;
            }
            .robot-wrapper.is-active .robot-body-group {
              animation: float-heroic 4s ease-in-out infinite 1s !important;
            }

            /* --- Electric Sparks --- */
            .spark {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              opacity: 0;
            }
            .robot-wrapper.is-active .spark {
              animation: electric-zap 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
            }
            .robot-wrapper.is-active .spark-1 { animation-delay: 0.2s !important; }
            .robot-wrapper.is-active .spark-2 { animation-delay: 0.35s !important; }
            .robot-wrapper.is-active .spark-3 { animation-delay: 0.45s !important; }
            .robot-wrapper.is-active .spark-4 { animation-delay: 0.6s !important; }

            @keyframes core-pulse {
              0% { filter: drop-shadow(0 0 2px #22d3ee); transform: scale(1); }
              100% { filter: drop-shadow(0 0 10px #22d3ee); transform: scale(1.15); }
            }

            @keyframes float-heroic {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-4px); }
            }

            @keyframes electric-zap {
              0% { stroke-dashoffset: 100; opacity: 1; filter: drop-shadow(0 0 2px currentColor); }
              30% { opacity: 1; filter: drop-shadow(0 0 8px currentColor); }
              100% { stroke-dashoffset: -100; opacity: 0; filter: drop-shadow(0 0 0px currentColor); }
            }
          `}
        </style>
      </defs>

      {/* Box Inside Shadow (Static dark area inside box) */}
      <rect className="box-inside color-transition" x="35" y="65" width="30" height="0" rx="1" />

      {/* Energy Sparks (Assembled around robot) */}
      <g className="sparks-group">
        <path className="spark spark-1" d="M 50 65 L 15 30 L 5 40 L -10 15" stroke="#22d3ee" strokeWidth="2.5" fill="none" />
        <path className="spark spark-2" d="M 50 65 L 85 30 L 95 40 L 110 15" stroke="#f97316" strokeWidth="2" fill="none" />
        <path className="spark spark-3" d="M 50 65 L 65 15 L 45 0 L 70 -15" stroke="#22d3ee" strokeWidth="2" fill="none" />
        <path className="spark spark-4" d="M 50 65 L 35 15 L 55 0 L 30 -15" stroke="#f97316" strokeWidth="1.5" fill="none" />
      </g>

      {/* The Transforming Robot */}
      <g className="robot-body-group">
        {/* Legs */}
        <rect className="part leg color-transition" x="42" y="70" width="5" height="24" rx="2" />
        <rect className="part leg color-transition" x="53" y="70" width="5" height="24" rx="2" />

        {/* Pelvis */}
        <path className="part pelvis color-transition" d="M 40 64 L 60 64 L 56 73 L 44 73 Z" />

        {/* Arms */}
        <rect className="part arm color-transition" x="18" y="44" width="10" height="28" rx="3" />
        <rect className="part arm color-transition" x="72" y="44" width="10" height="28" rx="3" />

        {/* Shoulders */}
        <circle className="part shoulder color-transition" cx="23" cy="40" r="7" />
        <circle className="part shoulder color-transition" cx="77" cy="40" r="7" />

        {/* Torso */}
        <path className="part torso color-transition" d="M 30 35 L 70 35 L 58 62 L 42 62 Z" />

        {/* Chest Core */}
        <polygon className="part core color-transition" points="50,42 56,48 50,54 44,48" />

        {/* Head Group */}
        <g className="part head color-transition">
          {/* Antenna */}
          <line className="color-transition antenna" x1="50" y1="10" x2="50" y2="0" strokeWidth="2" strokeLinecap="round" />
          <circle className="color-transition antenna-ball" cx="50" cy="-2" r="3" />

          {/* Head Base */}
          <rect className="color-transition" x="38" y="10" width="24" height="22" rx="4" />

          {/* Jaw/Mouth plate */}
          <path className="jaw color-transition" d="M 42 26 L 58 26 L 56 32 L 44 32 Z" />

          {/* Glowing Eyes */}
          <rect className="eye" x="42" y="18" width="6" height="3" rx="1.5" />
          <rect className="eye" x="52" y="18" width="6" height="3" rx="1.5" />
        </g>
      </g>

      {/* The Box */}
      <g className="box-group">
        {/* Back Flaps (Optional, left out for clean UI) */}

        {/* Front Flaps */}
        <g className="flap flap-l">
          <rect x="0" y="0" width="16" height="4" rx="1" />
        </g>
        <g className="flap flap-r">
          <rect x="-16" y="0" width="16" height="4" rx="1" />
        </g>

        {/* Box Front */}
        <rect className="box-front color-transition" x="35" y="65" width="30" height="30" rx="2" />
      </g>
    </svg>
  );
}

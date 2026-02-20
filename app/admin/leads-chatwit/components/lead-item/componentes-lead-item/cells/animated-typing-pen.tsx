import React from "react";

export function AnimatedTypingPen() {
  return (
    <div className="flex items-center justify-center h-8 w-32 overflow-hidden">
      {/* Container relativo para sincronizar a posição X do texto e da caneta */}
      <div className="relative w-[85px] h-full flex items-center">
        
        {/* Texto "Digitando..." */}
        <span 
          className="absolute left-0 text-emerald-500 whitespace-nowrap"
          style={{ 
            fontFamily: "'Dancing Script', 'Brush Script MT', 'Caveat', cursive",
            fontSize: "1.1rem",
            animation: "write-text-1 4s infinite linear"
          }}
        >
          Digitando...
        </span>

        {/* Texto "Aguarde..." */}
        <span 
          className="absolute left-0 text-emerald-600/70 whitespace-nowrap"
          style={{ 
            fontFamily: "'Dancing Script', 'Brush Script MT', 'Caveat', cursive",
            fontSize: "1.1rem",
            animation: "write-text-2 4s infinite linear"
          }}
        >
          Aguarde...
        </span>

        {/* Caneta SVG */}
        <svg
          className="absolute bottom-[2px] -left-[2px] w-5 h-5 text-emerald-500 z-10"
          style={{
            transformOrigin: "3px 21px", /* O eixo de rotação fica EXATAMENTE na ponta da caneta */
            animation: "pen-write-sync 4s infinite linear"
          }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Path de uma caneta mais clássica com a ponta apontando para baixo/esquerda */}
          <path d="M21.17 2.83a2.828 2.828 0 0 0-4 0L3 17v4h4L21.17 6.83a2.828 2.828 0 0 0 0-4z" />
          <path d="M17.5 4.5l2 2" />
        </svg>

        <style>{`
          /* Revelação suave do texto com sobra no eixo Y para não cortar as pontas das letras cursivas */
          @keyframes write-text-1 {
            0% { clip-path: inset(-50% 100% -50% 0); opacity: 1; }
            40% { clip-path: inset(-50% -10% -50% 0); opacity: 1; }
            45%, 50% { clip-path: inset(-50% -10% -50% 0); opacity: 1; }
            51%, 100% { clip-path: inset(-50% 100% -50% 0); opacity: 0; }
          }

          @keyframes write-text-2 {
            0%, 50% { clip-path: inset(-50% 100% -50% 0); opacity: 0; }
            51% { clip-path: inset(-50% 100% -50% 0); opacity: 1; }
            90% { clip-path: inset(-50% -10% -50% 0); opacity: 1; }
            95%, 100% { clip-path: inset(-50% -10% -50% 0); opacity: 1; }
          }

          /* A caneta viaja no Eixo X alinhada ao clip-path, enquanto oscila no Eixo Y e rotaciona */
          @keyframes pen-write-sync {
            /* Desenhando "Digitando..." (0% a 40%) - Distância de 0 a 75px */
            0%  { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
            5%  { transform: translate(9.3px, -5px) rotate(-15deg); }
            10% { transform: translate(18.7px, 2px) rotate(5deg); }
            15% { transform: translate(28px, -6px) rotate(-20deg); }
            20% { transform: translate(37.5px, 1px) rotate(0deg); }
            25% { transform: translate(46.8px, -4px) rotate(-15deg); }
            30% { transform: translate(56.2px, 3px) rotate(10deg); }
            35% { transform: translate(65.6px, -3px) rotate(-10deg); }
            40% { transform: translate(75px, 0px) rotate(0deg); opacity: 1; }
            45%, 50% { transform: translate(75px, 0px) rotate(0deg); opacity: 0; }

            /* Desenhando "Aguarde..." (51% a 90%) - Distância de 0 a 70px */
            51% { transform: translate(0px, 0px) rotate(0deg); opacity: 0; }
            52% { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
            57% { transform: translate(8.7px, -5px) rotate(-15deg); }
            62% { transform: translate(17.5px, 2px) rotate(5deg); }
            67% { transform: translate(26.2px, -6px) rotate(-20deg); }
            72% { transform: translate(35px, 1px) rotate(0deg); }
            77% { transform: translate(43.7px, -4px) rotate(-15deg); }
            82% { transform: translate(52.5px, 3px) rotate(10deg); }
            87% { transform: translate(61.2px, -3px) rotate(-10deg); }
            90% { transform: translate(70px, 0px) rotate(0deg); opacity: 1; }
            95%, 100% { transform: translate(70px, 0px) rotate(0deg); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
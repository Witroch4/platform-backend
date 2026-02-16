import React from "react";
import { ArrowDown } from "lucide-react";

interface ScrollBtnProps {
	unread: number;
	onClick: () => void;
}

export default function ScrollToBottomButton({ unread, onClick }: ScrollBtnProps) {
	return (
		<button
			onClick={onClick}
			className="scroll-to-bottom-btn fixed bottom-28 right-8 bg-white text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 rounded-full p-3 shadow-lg transition-all duration-200 z-20 flex items-center gap-2 group"
			aria-label="Rolar para novas mensagens"
		>
			<div className="relative flex items-center justify-center">
				<ArrowDown size={20} className="animate-bounce-soft" />
				{unread > 0 && (
					<div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
						{unread}
					</div>
				)}
			</div>
			{unread > 0 && (
				<span className="text-xs font-medium pr-1">
					{unread === 1 ? "1 nova mensagem" : `${unread} novas mensagens`}
				</span>
			)}
		</button>
	);
}

// Adicione este CSS no seu arquivo global.css ou crie um módulo CSS
// .animate-bounce-soft {
//   animation: bounce 2s infinite;
// }
//
// @keyframes bounce {
//   0%, 100% {
//     transform: translateY(0);
//   }
//   50% {
//     transform: translateY(3px);
//   }
// }

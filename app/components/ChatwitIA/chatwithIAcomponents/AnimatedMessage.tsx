import React, { useEffect, useState, useMemo } from "react";

interface AnimatedMessageProps {
	children: React.ReactNode;
	isAssistant: boolean;
}

const AnimatedMessage = React.memo(function AnimatedMessage({ children, isAssistant }: AnimatedMessageProps) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setVisible(true), 120);
		return () => clearTimeout(t);
	}, []);

	// Memoizar as classes CSS para evitar recalculações
	const className = useMemo(() => {
		return `
      ${visible ? "opacity-100" : "opacity-0"} 
      ${
				isAssistant
					? "assistant-message-enter"
					: "transition-all duration-300 ease-out " + (visible ? "translate-y-0" : "translate-y-4")
			}
    `;
	}, [visible, isAssistant]);

	return <div className={className}>{children}</div>;
});

export default AnimatedMessage;

import { useEffect } from "react";

export type KeyMap = Record<string, () => void>;

interface UseKeyBindingsOptions {
	enabled?: boolean;
}

export function useKeyBindings(keyMap: KeyMap, options: UseKeyBindingsOptions = {}) {
	const { enabled = true } = options;

	useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			// Don't trigger shortcuts when typing in inputs
			const target = event.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
				return;
			}

			// Build key combination string
			const parts: string[] = [];

			if (event.ctrlKey || event.metaKey) parts.push("ctrl");
			if (event.shiftKey) parts.push("shift");
			if (event.altKey) parts.push("alt");

			// Add the actual key
			if (!["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
				parts.push(event.key);
			}

			const combination = parts.join("+");

			// Try to find and execute handler
			const handler = keyMap[combination] || keyMap[event.key];

			if (handler) {
				event.preventDefault();
				handler();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [keyMap, enabled]);
}

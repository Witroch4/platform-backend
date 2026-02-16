import { memo } from "react";

interface NewLeadIndicatorProps {
	isNew: boolean;
}

export const NewLeadIndicator = memo(function NewLeadIndicator({ isNew }: NewLeadIndicatorProps) {
	if (!isNew) return null;

	return (
		<span
			className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse ml-1.5 flex-shrink-0"
			title="Lead recente (últimos 15 min)"
			aria-label="Lead novo"
		/>
	);
});

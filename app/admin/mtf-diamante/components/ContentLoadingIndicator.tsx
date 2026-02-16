"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function ContentLoadingIndicator() {
	const pathname = usePathname();
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		setIsLoading(true);
		const timer = setTimeout(() => setIsLoading(false), 300);
		return () => clearTimeout(timer);
	}, [pathname]);

	if (!isLoading) return null;

	return (
		<div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse z-50" />
	);
}

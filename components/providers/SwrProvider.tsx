"use client";

import { SWRConfig } from "swr";
import { swrConfig, swrFetcher } from "@/lib/swr-config";

interface SWRProviderProps {
	children: React.ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
	return (
		<SWRConfig
			value={{
				...swrConfig,
				fetcher: swrFetcher,
			}}
		>
			{children}
		</SWRConfig>
	);
}

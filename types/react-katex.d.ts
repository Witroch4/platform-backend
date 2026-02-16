declare module "react-katex" {
	import type React from "react";

	export interface KaTeXProps {
		math: string;
		block?: boolean;
		errorColor?: string;
		renderError?: (error: Error | TypeError) => React.ReactNode;
		settings?: Record<string, any>;
	}

	export const InlineMath: React.FC<KaTeXProps>;
	export const BlockMath: React.FC<KaTeXProps>;
}

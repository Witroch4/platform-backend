declare module "html-to-docx" {
	function HTMLtoDOCX(
		htmlString: string,
		headerHTMLString?: string | null,
		options?: {
			table?: { row?: { cantSplit?: boolean } };
			footer?: boolean;
			pageNumber?: boolean;
			font?: string;
			fontSize?: number;
			margins?: { top?: number; right?: number; bottom?: number; left?: number };
		},
	): Promise<Blob>;

	export default HTMLtoDOCX;
}

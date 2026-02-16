declare module "pdf-parse" {
	interface PDFMetaData {
		info: Record<string, unknown>;
		metadata?: Record<string, unknown>;
	}

	interface PDFParseResult {
		numpages: number;
		numrender: number;
		info: Record<string, unknown>;
		metadata?: Record<string, unknown>;
		text: string;
		version: string;
	}

	function pdf(buffer: Buffer, options?: Record<string, unknown>): Promise<PDFParseResult>;

	export default pdf;
}

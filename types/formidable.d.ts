declare module "formidable" {
	import { Readable, Writable } from "stream";

	export interface FormidableOptions {
		keepExtensions?: boolean;
		maxFileSize?: number;
		multiples?: boolean;
		fileWriteStreamHandler?: (file?: any) => any;
	}

	export interface FormidableFile {
		size: number;
		filepath: string;
		originalFilename: string;
		newFilename: string;
		mimetype: string;
		mtime?: Date;
		data?: Buffer;
		name?: string;
	}

	export interface FormidableFields {
		[key: string]: string | string[];
	}

	export interface FormidableFiles {
		[key: string]: FormidableFile | FormidableFile[];
	}

	export interface IncomingForm {
		parse: (stream: any, callback: (err: any, fields: FormidableFields, files: FormidableFiles) => void) => void;
	}

	export default function formidable(options?: FormidableOptions): IncomingForm;
}

declare const URL: typeof import('url').URL;
declare const URLSearchParams: typeof import('url').URLSearchParams;
declare module 'acorn-class-fields';
declare module 'stream-to-promise' {
	import * as Stream from 'stream';

	export default function streamToPromise(stream: NodeJS.ReadableStream | Stream.Readable): Promise<Buffer>;
	export default function streamToPromise(stream: NodeJS.WritableStream | Stream.Writable): Promise<void>;
}

interface ImportMeta {
	resolve(specifier: string, parent?: string): Promise<string>;
}

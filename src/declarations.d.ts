declare module 'acorn-class-fields';
declare module 'acorn-private-methods';
declare module 'stream-to-promise' {
	import type * as Stream from 'stream';

	export default function streamToPromise(stream: NodeJS.ReadableStream | Stream.Readable): Promise<Buffer>;
	export default function streamToPromise(stream: NodeJS.WritableStream | Stream.Writable): Promise<void>;
}

interface ImportMeta {
	resolve(specifier: string, parent?: string): Promise<string>;
}

interface Function {
	displayName: string;
}

// Stupid declaration to make node and dom version of `URL` compatible
interface URLSearchParams {
	entries(): IterableIterator<[ string, string ]>;
	keys(): IterableIterator<string>;
	values(): IterableIterator<string>;
	[Symbol.iterator](): IterableIterator<[ string, string ]>;
}

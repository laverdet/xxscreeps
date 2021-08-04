declare module 'acorn-class-fields';
declare module 'acorn-private-methods';
declare module 'stream-to-promise' {
	import type * as Stream from 'stream';

	export default function streamToPromise(stream: NodeJS.ReadableStream | Stream.Readable): Promise<Buffer>;
	export default function streamToPromise(stream: NodeJS.WritableStream | Stream.Writable): Promise<void>;
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

declare function enumerable(target: any, key: string, descriptor: PropertyDescriptor): void;

interface String {
	// Prevent `for (const ii of 'hello')` bugs because who would ever do that
	[Symbol.iterator]: never;
}

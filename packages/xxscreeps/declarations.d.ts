declare module 'acorn-class-fields';
declare module 'acorn-private-methods';
declare module 'stream-to-promise' {
	import type * as Stream from 'node:stream';

	export default function streamToPromise(stream: NodeJS.ReadableStream | Stream.Readable): Promise<Buffer>;
	export default function streamToPromise(stream: NodeJS.WritableStream | Stream.Writable): Promise<void>;
}

interface Function {
	displayName: string;
}

interface String {
	// Prevent `for (const ii of 'hello')` bugs because who would ever do that
	[Symbol.iterator]: never;
}

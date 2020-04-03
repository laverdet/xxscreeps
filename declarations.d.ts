declare module 'stream-to-promise' {
	import * as Stream from 'stream';

	export default function streamToPromise(stream: NodeJS.ReadableStream | Stream.Readable): Promise<Buffer>;
	export default function streamToPromise(stream: NodeJS.WritableStream | Stream.Writable): Promise<void>;
}

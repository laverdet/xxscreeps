declare module 'stream-to-promise' {
	import * as Stream from 'stream';
	export default function streamToPromise(stream: Stream.Duplex | NodeJS.ReadableStream): Promise<Buffer>;
	export default function streamToPromise(stream: NodeJS.WritableStream): Promise<void>;
}

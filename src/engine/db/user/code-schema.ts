import * as Fn from 'xxscreeps/utility/functional';
import { compose, declare, struct, vector } from 'xxscreeps/schema';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema';

export type CodeBlobs = {
	buffers: Readonly<Uint8Array> | null;
	strings: Readonly<Uint8Array> | null;
};

// Basic schema which stores code strings by name. Buffers are stored in a separate blob because
// strings will be materialized up front, allowing the underlying BufferView to be collected.
// Buffers just slice back into the original buffer which keeps the view alive indefinitely.
const buffersFormat = declare('CodeBuffers', compose(vector(struct({
	name: 'string',
	content: 'buffer',
})), {
	compose: value => new Map<string, Uint8Array>(value.map(entry => [ entry.name, entry.content ])),
	decompose: (value: Map<string, Uint8Array>) => Fn.map(value.entries(), ([ name, content ]) => ({ name, content })),
}));
const stringsFormat = declare('CodeStrings', compose(vector(struct({
	name: 'string',
	content: 'string',
})), {
	compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.content ])),
	decompose: (value: Map<string, string>) => Fn.map(value.entries(), ([ name, content ]) => ({ name, content })),
}));
export const { read: readBuffers, write: writeBuffers } = makeReaderAndWriter(buffersFormat);
export const { read: readStrings, write: writeStrings } = makeReaderAndWriter(stringsFormat);

export function read(blobs: CodeBlobs) {
	return new Map<string, string | Uint8Array>(Fn.concat(
		blobs.buffers ? readBuffers(blobs.buffers) : [],
		blobs.strings ? readStrings(blobs.strings) : []));
}
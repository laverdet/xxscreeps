const kChunkSize = 1024 * 4;
export function typedArrayToString(array: Readonly<Int8Array | Uint8Array | Uint16Array>) {
	let string = '';
	for (let ii = 0; ii < array.length; ii += kChunkSize) {
		string += String.fromCharCode(...array.subarray(ii, ii + kChunkSize));
	}
	return string;
}

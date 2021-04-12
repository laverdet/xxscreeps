/**
 * Returns same result as JSON.stringify except it include inherited enumerable properties as well.
 */
export function stringifyInherited(value: any): string {
	if (typeof value === 'object') {
		if (Array.isArray(value)) {
			return `[${value.map(stringifyInherited)}]`;
		}
		let str = '{';
		let first = true;
		for (const key in value) {
			const prop = value[key];
			if (prop !== undefined) {
				if (first) {
					first = false;
				} else {
					str += ',';
				}
				str += `${JSON.stringify(key)}:${stringifyInherited(value[key])}`;
			}
		}
		str += '}';
		return str;
	} else {
		return JSON.stringify(value);
	}
}

const kChunkSize = 1024 * 4;
export function typedArrayToString(array: Readonly<Int8Array | Uint8Array | Uint16Array>) {
	let string = '';
	for (let ii = 0; ii < array.length; ii += kChunkSize) {
		string += String.fromCharCode(...array.subarray(ii, ii + kChunkSize));
	}
	return string;
}

type AnyArrayBuffer = new (byteLength: number) => ArrayBuffer | SharedArrayBuffer;
export function stringToBuffer16(value: string, ctor: AnyArrayBuffer = ArrayBuffer) {
	const buffer = new ctor(value.length * 2);
	const uint16 = new Uint16Array(buffer);
	for (let ii = 0; ii < value.length; ++ii) {
		uint16[ii] = value.charCodeAt(ii);
	}
	return uint16;
}

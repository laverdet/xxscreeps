function idiv(numerator: number, denominator: number) {
	return Math.floor(numerator / denominator);
}

function ilog2(number: number) {
	return 31 ^ Math.clz32(number);
}

function typedArrayByBytes(bytes: number) {
	return [ Uint8Array, Uint16Array, Uint32Array ][32 - Math.clz32(bytes - 1)];
}

export function typedArrayFor(maxValue: number) {
	return typedArrayByBytes(1 + (ilog2(maxValue) >>> 3));
}

export function packIntrinsics(dataBits: number, storeSizeBytes: number) {
	const Store = typedArrayByBytes(storeSizeBytes);
	const storeBits = storeSizeBytes << 3;
	const remainder = idiv(storeBits, dataBits);
	const arrayLength = (length: number) => idiv(length * dataBits + remainder, storeBits);
	const indexShift = ilog2(idiv(storeBits, dataBits));
	const indexMask = idiv(storeBits, dataBits) - 1;
	const indexBitShift = ilog2(dataBits);
	const mask = (1 << dataBits) - 1;
	return { Store, dataBits, storeBits, arrayLength, indexShift, indexMask, indexBitShift, mask };
}

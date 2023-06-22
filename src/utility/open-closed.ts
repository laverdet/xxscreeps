import { packIntrinsics } from './pack.js';
const { Store, arrayLength, indexShift, indexMask, indexBitShift, mask } = packIntrinsics(2, 1);

export class OpenClosed {
	private readonly data: Record<number, number>;
	constructor(size: number) {
		this.data = new Store(arrayLength(size));
	}

	isOpen(id: number) {
		return this.get(id) === 1;
	}

	isClosed(id: number) {
		return this.get(id) === 2;
	}

	open(id: number) {
		this.set(id, 1);
	}

	close(id: number) {
		this.set(id, 2);
	}

	private get(id: number) {
		return (this.data[id >> indexShift] >> ((id & indexMask) << indexBitShift)) & mask;
	}

	private set(id: number, value: number) {
		const bitPos = (id & indexMask) << indexBitShift;
		const shiftedIndex = id >> indexShift;
		this.data[shiftedIndex] = (this.data[shiftedIndex] & ~(mask << bitPos)) | ((value & mask) << bitPos);
	}
}

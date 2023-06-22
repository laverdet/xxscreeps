import { typedArrayFor } from './pack.js';

export class Heap {
	size = 0;
	private readonly heap: Record<number, number>;
	constructor(
		maxId: number,
		capacity: number,
		private readonly cost: (id: number) => number,
	) {
		const Store = typedArrayFor(maxId);
		this.heap = new Store(capacity + 1);
	}

	clear() {
		this.size = 0;
	}

	pop() {
		const value = this.heap[1];
		this.heap[1] = this.heap[this.size];
		--this.size;
		let vv = 1;
		do {
			const uu = vv;
			if ((uu << 1) + 1 <= this.size) {
				if (this.cost(this.heap[uu]) >= this.cost(this.heap[uu << 1])) {
					vv = uu << 1;
				}
				if (this.cost(this.heap[vv]) >= this.cost(this.heap[(uu << 1) + 1])) {
					vv = (uu << 1) + 1;
				}
			} else if (uu << 1 <= this.size) {
				if (this.cost(this.heap[uu]) >= this.cost(this.heap[uu << 1])) {
					vv = uu << 1;
				}
			}
			if (uu === vv) {
				break;
			} else {
				const tmp = this.heap[uu];
				this.heap[uu] = this.heap[vv];
				this.heap[vv] = tmp;
			}
		} while (true);
		return value;
	}

	push(id: number) {
		const ii = ++this.size;
		this.heap[ii] = id;
		this.bubbleUp(ii);
	}

	update(id: number) {
		for (let ii = this.size; ii > 0; --ii) {
			if (this.heap[ii] === id) {
				this.bubbleUp(ii);
				return;
			}
		}
	}

	private bubbleUp(id: number) {
		let ii = id;
		while (ii !== 1) {
			if (this.cost(this.heap[ii]) <= this.cost(this.heap[ii >>> 1])) {
				const tmp = this.heap[ii];
				this.heap[ii] = this.heap[ii >>> 1];
				this.heap[ii >>>= 1] = tmp;
			} else {
				return;
			}
		}
	}
}

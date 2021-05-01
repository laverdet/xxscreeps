import { instantiate } from 'xxscreeps/utility/utility';

export class CostMatrix {
	_bits = new Uint8Array(2500);

	static deserialize(data: number[]) {
		const _bits = new Uint8Array(new Uint32Array(data).buffer);
		return instantiate(CostMatrix, { _bits });
	}

	set(xx: number, yy: number, value: number) {
		this._bits[xx * 50 + yy] = value;
	}

	get(xx: number, yy: number) {
		return this._bits[xx * 50 + yy];
	}

	clone() {
		const _bits = new Uint8Array(this._bits);
		return instantiate(CostMatrix, { _bits });
	}

	serialize() {
		return [ ...new Uint32Array(this._bits.buffer, this._bits.byteOffset) ];
	}
}

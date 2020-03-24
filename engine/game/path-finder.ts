export { search } from '~/driver/pathfinder';
import { instantiate } from '~/lib/utility';
import { RoomPosition } from './position';

class CostMatrix {
	_bits = new Uint8Array(2500);

	set(xx: number, yy: number, value: number) {
		this._bits[yy * 50 + xx] = value;
	}

	get(xx: number, yy: number) {
		return this._bits[yy * 50 + xx];
	}

	clone() {
		const _bits = new Uint8Array(this._bits);
		return instantiate(CostMatrix, { _bits });
	}

	serialize() {
		return [ ...new Uint32Array(this._bits.buffer, this._bits.byteOffset) ];
	}

	deserialize(data: number[]) {
		const _bits = new Uint8Array(new Uint32Array(data).buffer);
		return instantiate(CostMatrix, { _bits });
	}
}

export type Goal = RoomPosition | { pos: RoomPosition; range: number };

export type SearchOptions = {
	roomCallback?: (roomName: string) => CostMatrix | false;
	flee?: boolean;
	plainCost?: number;
	swampCost?: number;
	maxOps?: number;
	maxRooms?: number;
	maxCost?: number;
	heuristicWeight?: number;
};

export function use() {}

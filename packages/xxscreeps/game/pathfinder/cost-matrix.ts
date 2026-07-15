import { instantiate } from 'xxscreeps/utility/utility.js';

/**
 * Container for custom navigation cost data. By default `PathFinder` will only consider terrain
 * data (plain, swamp, wall) — if you need to route around obstacles such as buildings or creeps you
 * must put them into a `CostMatrix`. Generally you will create your `CostMatrix` from within
 * `roomCallback`. If a non-0 value is found in a room's CostMatrix then that value will be used
 * instead of the default terrain cost. You should avoid using large values in your CostMatrix and
 * terrain cost flags. For example, running `PathFinder.search` with
 * `{ plainCost: 1, swampCost: 5 }` is faster than running it with `{ plainCost: 2, swampCost: 10 }`
 * even though your paths will be the same.
 * @public
 * @see https://docs.screeps.com/api/#PathFinder-CostMatrix
 */
export class CostMatrix {
	_bits = new Uint8Array(2500);

	/**
	 * Static method which deserializes a new CostMatrix using the return value of `serialize`.
	 * @param data Whatever `serialize` returned
	 * @returns Returns new `CostMatrix` instance.
	 * @public
	 * @see https://docs.screeps.com/api/#PathFinder.CostMatrix.deserialize
	 */
	static deserialize(data: number[]) {
		const _bits = new Uint8Array(new Uint32Array(data).buffer);
		return instantiate(CostMatrix, { _bits });
	}

	/**
	 * Set the cost of a position in this CostMatrix.
	 * @param xx X position in the room.
	 * @param yy Y position in the room.
	 * @param value Cost of this position. Must be a whole number. A cost of 0 will use the terrain
	 * cost for that tile. A cost greater than or equal to 255 will be treated as unwalkable.
	 * @public
	 * @see https://docs.screeps.com/api/#PathFinder.CostMatrix.set
	 */
	set(xx: number, yy: number, value: number) {
		this._bits[xx * 50 + yy] = value;
	}

	/**
	 * Get the cost of a position in this CostMatrix.
	 * @param xx X position in the room.
	 * @param yy Y position in the room.
	 * @public
	 * @see https://docs.screeps.com/api/#PathFinder.CostMatrix.get
	 */
	get(xx: number, yy: number) {
		return this._bits[xx * 50 + yy]!;
	}

	/**
	 * Copy this CostMatrix into a new CostMatrix with the same data.
	 * @returns A new CostMatrix instance.
	 * @public
	 * @see https://docs.screeps.com/api/#PathFinder.CostMatrix.clone
	 */
	clone() {
		const _bits = new Uint8Array(this._bits);
		return instantiate(CostMatrix, { _bits });
	}

	/**
	 * Returns a compact representation of this CostMatrix which can be stored via `JSON.stringify`.
	 * @returns An array of numbers. There's not much you can do with the numbers besides store them
	 * for later.
	 * @public
	 * @see https://docs.screeps.com/api/#PathFinder.CostMatrix.serialize
	 */
	serialize() {
		return [ ...new Uint32Array(this._bits.buffer, this._bits.byteOffset) ];
	}
}

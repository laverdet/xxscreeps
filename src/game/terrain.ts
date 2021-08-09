import type { BufferView } from 'xxscreeps/schema';
import { array, compose } from 'xxscreeps/schema';
import { exchange } from 'xxscreeps/utility/utility';
import { Room } from './room';
import { Game } from '.';
export { TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP } from './constants';

export const terrainMaskToString = [ 'plain', 'wall', 'swamp', 'wall' ] as const;

/**
 * An object which provides fast access to room terrain data. These objects can be constructed for
 * any room in the world even if you have no access to it.
 *
 * Technically every Room.Terrain object is a very lightweight adapter to underlying static terrain
 * buffers with corresponding minimal accessors.
 */
export class Terrain {
	#buffer: Uint8Array;

	/**
	 * Creates a new Terrain of room by its name. Terrain objects can be constructed for any room in
	 * the world even if you have no access to it.
	 * @param roomName The room name.
	 */
	constructor(roomName: string);
	// eslint-disable-next-line @typescript-eslint/unified-signatures
	constructor(buffer: Uint8Array);
	constructor(arg: string | Uint8Array) {
		if (typeof arg === 'string') {
			this.#buffer = Game.map.getRoomTerrain(arg)!.#buffer;
		} else {
			this.#buffer = arg;
		}
	}

	/**
	 * Extracts the underlying private buffer out of a `Terrain` class.
	 * @internal
	 */
	static getBuffer(that: Terrain) {
		return that.#buffer;
	}

	/**
	 * Get terrain type at the specified room position by `(x,y)` coordinates. Unlike the
	 * `Game.map.getTerrainAt(...)` method, this one doesn't perform any string operations and returns
	 * integer terrain type values.
	 */
	get(xx: number, yy: number) {
		const index = yy * 50 + xx;
		if (index >= 0 && index < 2500) {
			return (this.#buffer[index >>> 2] >>> ((index & 0x03) << 1)) & 0x03;
		}
		return NaN;
	}

	/**
	 * Get copy of underlying static terrain buffer.
	 *
	 * Note: It's probably better to just use the `get` method.
	 *
	 * @param destinationArray A typed array view in which terrain will be copied to.
	 * @deprecated
	 */
	getRawBuffer(destinationArray?: Uint8Array, version?: 'xxscreeps'): Uint8Array {
		if (version === 'xxscreeps') {
			const buffer = destinationArray instanceof Uint8Array ? destinationArray : new Uint8Array(625);
			buffer.set(this.#buffer);
			return buffer;
		} else {
			const buffer = destinationArray ?? new Uint32Array(625);
			for (let ii = 0; ii < 625; ++ii) {
				const value = this.#buffer[ii];
				buffer[ii] =
					(value >>> ((ii << 3) & 0x06)) & 0x03 |
					((value >>> ((ii << 3) + 2 & 0x06)) & 0x03) << 8 |
					((value >>> ((ii << 3) + 4 & 0x06)) & 0x03) << 16 |
					((value >>> ((ii << 3) + 6 & 0x06)) & 0x03) << 24;
			}
			return new Uint8Array(buffer.buffer);
		}
	}
}

export class TerrainWriter extends Terrain {
	constructor(buffer = new Uint8Array(625)) {
		super(buffer);
	}

	set(xx: number, yy: number, value: number) {
		const buffer = getBuffer(this);
		const index = yy * 50 + xx;
		if (index >= 0 && index < 2500) {
			const byte = index >>> 2;
			const shift = (index & 0x03) << 1;
			buffer[byte] = buffer[byte] & ~(0x03 << shift) | (value & 0x03) << shift;
		}
	}
}

export const getBuffer = exchange(Terrain, 'getBuffer', (): never => { throw new Error });

export function isBorder(xx: number, yy: number) {
	return xx === 0 || xx === 49 || yy === 0 || yy === 49;
}

export function isNearBorder(xx: number, yy: number) {
	return (xx + 2) % 50 < 4 || (yy + 2) % 50 < 4;
}

export const format = compose(array(625, 'uint8'), {
	composeFromBuffer: (view: BufferView, offset: number) => new Terrain(view.uint8.subarray(offset, offset + 625)),
	decomposeIntoBuffer(value: Terrain, view: BufferView, offset: number) {
		value.getRawBuffer(view.uint8.subarray(offset, offset + 625), 'xxscreeps');
	},
});

Room.Terrain = Terrain;

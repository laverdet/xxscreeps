import * as C from './constants/index.js';

export const ALL_DIRECTIONS = [
	C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT,
];
/** @public */
export type Direction = typeof ALL_DIRECTIONS[number];

export function getDirection(dx: number, dy: number): Direction;
export function getDirection(dx: number, dy: number) {
	const adx = Math.abs(dx);
	const ady = Math.abs(dy);
	if (adx > ady * 2) {
		if (dx > 0) {
			return C.RIGHT;
		} else {
			return C.LEFT;
		}
	} else if (ady > adx * 2) {
		if (dy > 0) {
			return C.BOTTOM;
		} else {
			return C.TOP;
		}
	} else if (dx > 0) {
		if (dy > 0) {
			return C.BOTTOM_RIGHT;
		} else if (dy < 0) {
			return C.TOP_RIGHT;
		}
	} else if (dx < 0) {
		if (dy > 0) {
			return C.BOTTOM_LEFT;
		} else if (dy < 0) {
			return C.TOP_LEFT;
		}
	}
}

export function getOffsetsFromDirection(direction: Direction) {
	switch (direction) {
		case C.TOP: return { dx: 0, dy: -1 } as const;
		case C.TOP_RIGHT: return { dx: 1, dy: -1 } as const;
		case C.RIGHT: return { dx: 1, dy: 0 } as const;
		case C.BOTTOM_RIGHT: return { dx: 1, dy: 1 } as const;
		case C.BOTTOM: return { dx: 0, dy: 1 } as const;
		case C.BOTTOM_LEFT: return { dx: -1, dy: 1 } as const;
		case C.LEFT: return { dx: -1, dy: 0 } as const;
		case C.TOP_LEFT: return { dx: -1, dy: -1 } as const;
		default: throw new Error('Invalid direction');
	}
}

function *localIterateArea(top: number, left: number, bottom: number, right: number) {
	for (let yy = top; yy <= bottom; ++yy) {
		for (let xx = left; xx <= right; ++xx) {
			yield [ xx, yy ] as const;
		}
	}
}

export function makeLocalIterateInRangeTo(min: number, max: number) {
	return function(xx: number, yy: number, range: number) {
		return localIterateArea(
			Math.max(min, yy - range),
			Math.max(min, xx - range),
			Math.min(max, yy + range),
			Math.min(max, xx + range));
	};
}

export function makeLocalIterateArea(min: number, max: number) {
	return function(top: number, left: number, bottom: number, right: number) {
		return localIterateArea(
			Math.max(min, top),
			Math.max(min, left),
			Math.min(max, bottom),
			Math.min(max, right));
	};
}

export function makeAbstractIterateWithRangeTo(min: number, max: number) {
	return function*(xx: number, yy: number, range: number) {
		const x1 = xx - range;
		const xa = Math.max(x1, min);
		const x2 = xx + range;
		const xb = Math.min(x2, max);
		const y1 = yy - range;
		const ya = Math.max(y1, min);
		const y2 = yy + range;
		const yb = Math.min(y2, max);
		const tt = y1 < min || y1 > max;
		if (!tt) {
			for (let xn = xa; xn <= xb; ++xn) {
				yield [ xn, y1 ] as const;
			}
		}
		const rr = x2 < min || x2 > max;
		if (!rr) {
			for (let yn = ya + (tt ? 0 : 1); yn <= yb; ++yn) {
				yield [ x2, yn ] as const;
			}
		}
		const bb = y2 < min || y2 > max;
		if (!bb) {
			for (let xn = xb - (rr ? 0 : 1); xn >= xa; --xn) {
				yield [ xn, y2 ] as const;
			}
		}
		const ll = x1 < min || x1 > max;
		if (!ll) {
			const end = ya + (tt ? 0 : 1);
			for (let yn = yb - (bb ? 0 : 1); yn >= end; --yn) {
				yield [ x1, yn ] as const;
			}
		}
	};
}

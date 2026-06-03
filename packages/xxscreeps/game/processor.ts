import { invertedNumericComparator, mappedComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { RoomObject } from 'xxscreeps/game/object.js';

/**
 * Walks `objects` descending by `#layer`; `onObject` returns the residual past each one.
 * `stopAt` ends iteration at that object (throws if absent).
 */
export function walkLayers<T extends RoomObject>(
	objects: T[],
	initialPower: number,
	onObject: (object: T, layerPower: number) => number,
	stopAt?: T,
): number {
	let power = initialPower;
	let iterationPower = power;
	let layer: number | undefined;
	for (const object of objects) {
		if (object === stopAt) {
			return iterationPower;
		}
		const objectLayer = object['#layer'];
		if (layer !== objectLayer) {
			layer = objectLayer;
			power = iterationPower;
			if (power <= 0) {
				return 0;
			}
		}
		// The idea here is that multiple objects on the same layer can capture damage simultaneously,
		// and whichever one captures more will be used. This doesn't apply to any existing game
		// objects, but idk maybe it could be interesting.
		iterationPower = Math.min(iterationPower, onObject(object, power));
	}
	if (stopAt !== undefined) {
		throw new Error('Object was never found');
	}
	return iterationPower;
}

/**
 * Invokes damage capture callback from top to bottom and returns the remaining power which should
 * be applied to the target.
 */
export function captureDamage(target: RoomObject, initialPower: number, type: number, source: RoomObject | null) {
	const objects = Fn.pipe(
		target.room['#lookAt'](target.pos),
		$$ => Fn.reject($$, object =>
			object['#layer'] === undefined || object.hits === undefined),
		$$ => [ ...$$ ],
		$$ => $$.sort(mappedComparator(invertedNumericComparator, object => object['#layer']!)));
	return walkLayers(
		objects, initialPower,
		(object, layerPower) => object['#captureDamage'](layerPower, type, source),
		target);
}

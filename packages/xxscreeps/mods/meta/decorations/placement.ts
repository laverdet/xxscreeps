import type { DecorationDefinition, DecorationProp, DecorationType } from './catalog.js';
import { Fn } from 'xxscreeps/functional/fn.js';

// The storage side of a placement: encoding property values for keyval and reading them back, plus
// the domain predicates every consumer shares. Parsing what the client sends is the backend's
// business and lives in [backend.ts](./backend.ts); the definition is the authority for a
// property's type in both directions.

/** A property value as the client exchanges it. */
export type PropValue = boolean | number | string;

/** Where a decoration is placed, and the property values the player chose. */
export interface Placement {
	/** Target shard and room. Absent for the global decorations that ride along with creeps. */
	shard?: string;
	room?: string;
	props: Record<string, PropValue>;
}

/** A rejected placement, carrying the message handed back to the client. */
export interface PlacementError {
	error: string;
}

/**
 * Whether a decoration of this type stands in a room. A creep decoration follows its owner from room
 * to room and a badge is worn on the account rather than put anywhere, so neither names one — the
 * client offers no room picker for either.
 */
export const isPlacedInRoom = (type: DecorationType) => type !== 'creep' && type !== 'badge';

/** Whether a placement is visible on the world map, which the `world` property decides. */
export const isOnWorldMap = (placement: Placement) => placement.props.world === true;

/** Property values share the placement's hash with its target, so they carry a prefix of their own. */
const propFieldPrefix = 'prop/';

/** Hash fields hold strings; the definition tells {@link decodeProps} what each one was. */
export const encodeProps = (props: Record<string, PropValue>): Record<string, string> =>
	Object.fromEntries(Object.entries(props).map(([ name, value ]) =>
		[ `${propFieldPrefix}${name}`, String(typeof value === 'boolean' ? Number(value) : value) ]));

const decodeProp = (prop: DecorationProp, value: string): PropValue => {
	switch (prop.type) {
		case 'boolean': return value === '1';
		case 'range': return Number(value);
		case 'color': case 'display': case 'string': return value;
	}
};

/** Fields naming a property the definition no longer declares are dropped, the way a pack edit leaves them. */
export const decodeProps = (definition: DecorationDefinition, fields: Record<string, string>) => Fn.pipe(
	Object.entries(fields),
	$$ => Fn.transform($$, function*([ field, value ]) {
		if (field.startsWith(propFieldPrefix)) {
			const name = field.slice(propFieldPrefix.length);
			const prop = Object.hasOwn(definition.props, name) ? definition.props[name] : undefined;
			if (prop !== undefined) {
				yield [ name, decodeProp(prop, value) ] as const;
			}
		}
	}),
	$$ => Object.fromEntries($$),
);

/**
 * Decoration types whose presence in a room excludes `type` from it. A landscape paints both the
 * floor and the walls, so it collides with either half; graffiti may be stacked freely.
 */
function conflictingTypes(type: DecorationType): readonly DecorationType[] {
	switch (type) {
		case 'floorLandscape': return [ 'floorLandscape', 'landscape' ];
		case 'wallLandscape': return [ 'wallLandscape', 'landscape' ];
		case 'landscape': return [ 'landscape', 'floorLandscape', 'wallLandscape' ];
		case 'object': return [ 'object' ];
		case 'metadata': return [ 'metadata' ];
		case 'creep': return [ 'creep' ];
		// Graffiti may be stacked freely, and a player may wear several granted symbols at once: the
		// badge editor lists every one of them and they take turns rather than compete.
		case 'wallGraffiti': case 'badge': return [];
	}
}

/** Whether two decorations may not occupy the same room at the same time. */
export function conflicts(left: DecorationDefinition, right: DecorationDefinition) {
	if (!conflictingTypes(left.type).includes(right.type)) {
		return false;
	}
	// Overlays and renderer overrides only argue when they decorate the same kind of object.
	return left.type === 'object' || left.type === 'metadata' ? left.objectType === right.objectType : true;
}

import type { DecorationDefinition, DecorationProp, DecorationType } from './catalog.js';

// What the client's renderer reads straight out of a definition, or out of the placement built from
// it, without checking that it is there first. A pack missing one of these does not degrade into a
// plainer room — it throws inside the room view, and the room stays blank for everyone who can see
// it. So the catalog refuses such a pack at startup, the same way it refuses a missing asset.
//
// The lists come from the renderer's own source: `processors/terrain.js` and `processors/road.js`
// draw the landscapes, `decorations.js` the wall overlay and the graffiti,
// `processors/creepDecoration.js` and `processors/objectDecoration.js` the rest. Only the reads that
// actually throw are listed. A colour that merely ends up in an svg attribute renders wrong rather
// than not at all, which is the pack author's problem and not an invariant of ours.

/**
 * A foreground layer: the definition field naming its artwork, and the properties tinting it. The
 * renderer draws one for each half of a landscape, unconditionally.
 */
interface Foreground {
	/** Whether the definition names artwork for this layer. */
	url: (definition: DecorationDefinition) => string | undefined;
	/** That same field, as a patch — a computed key would lose the field name's type. */
	naming: (url: string) => Partial<DecorationDefinition>;
	/** Where this layer's stand-in artwork is served from. See {@link washes}. */
	washKey: string;
	color: string;
	brightness: string;
	alpha: string;
}

const floorForeground: Foreground = {
	url: definition => definition.floorForegroundUrl,
	naming: floorForegroundUrl => ({ floorForegroundUrl }),
	washKey: '_texture/floor-wash.svg',
	color: 'floorForegroundColor',
	brightness: 'floorForegroundBrightness',
	alpha: 'floorForegroundAlpha',
};

const wallForeground: Foreground = {
	url: definition => definition.foregroundUrl,
	naming: foregroundUrl => ({ foregroundUrl }),
	washKey: '_texture/wall-wash.svg',
	color: 'foregroundColor',
	brightness: 'foregroundBrightness',
	alpha: 'foregroundAlpha',
};

/** What one decoration type owes whichever part of the client reads it. */
interface Contract {
	/** Definition fields it dereferences. */
	fields: readonly (keyof DecorationDefinition)[];
	/** Properties whose value it dereferences, so a placement must always carry one. */
	props: readonly string[];
	/** Foreground layers it draws. */
	foregrounds: readonly Foreground[];
}

const floorProps = [ 'floorBackgroundColor', 'roadsColor' ];
const wallProps = [ 'backgroundColor', 'strokeColor' ];
// How large the sprite is drawn. The renderer assigns these to `width` and `height` without
// checking, and a sprite sized `NaN` is one nobody can see.
const spriteProps = [ 'width', 'height' ];

const contracts: Record<DecorationType, Contract> = {
	floorLandscape: { fields: [], props: floorProps, foregrounds: [ floorForeground ] },
	wallLandscape: { fields: [], props: wallProps, foregrounds: [ wallForeground ] },
	landscape: { fields: [], props: [ ...floorProps, ...wallProps ], foregrounds: [ floorForeground, wallForeground ] },
	// Graffiti is the only type the player positions, and the only one whose container alpha comes
	// straight off the placement.
	wallGraffiti: { fields: [ 'graphics' ], props: [ ...spriteProps, 'x', 'y', 'alpha' ], foregrounds: [] },
	creep: { fields: [ 'graphics' ], props: [ ...spriteProps, 'nameFilter' ], foregrounds: [] },
	object: { fields: [ 'graphics', 'objectType' ], props: spriteProps, foregrounds: [] },
	metadata: { fields: [ 'objectType', 'resources', 'metadata' ], props: [], foregrounds: [] },
	// The one type the room renderer never sees. Its reader is the account badge editor, which takes
	// the symbol off the definition and offers it beside the numbered shapes; a badge without one is
	// an entry in the inventory that grants nothing.
	badge: { fields: [ 'badge' ], props: [], foregrounds: [] },
};

/**
 * Values the renderer's animation table is keyed by, plus the empty string it reads as "no
 * animation". `ANIMATIONS[value].map(…)` throws on anything else.
 *
 * The client only offers the closed list when the property is a `string` labelled `Animation`;
 * spelled any other way the player gets a free text field. So the value is checked here, where a
 * pack cannot spell its way out of it, rather than left to the editor.
 */
const animations: readonly string[] = [ '', 'slow', 'fast', 'blink', 'neon', 'flash' ];

/** Properties the renderer looks up in a table, so a placement may only carry a listed value. */
export const enumeratedProps: Record<string, readonly string[]> = { animation: animations };

const washBody = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><rect width="16" height="16" fill="#ffffff"/></svg>';

/**
 * The foreground a landscape gets when its pack ships no artwork for one. A flat white square: the
 * layer is tinted and faded by the placement, so white is whatever colour the properties below ask
 * for, and the alpha they seed is zero — a colour-only pack looks exactly as it did before the
 * renderer had a layer to draw.
 *
 * One square per layer rather than one shared between them, even though they are the same hundred
 * bytes. The room view draws the floor foreground and the wall foreground from two separate places —
 * `processors/terrain.js` and `decorations.js` — and pixi hands both the same `Texture` when the two
 * urls match. `decorations.js` destroys the textures it drew on every decoration update; the terrain
 * keeps drawing the floor from the one it already has, and the room dies the moment a landscape
 * covers both halves. Distinct urls, distinct textures.
 */
export interface Wash {
	/** Where the asset route serves this square from. */
	key: string;
	body: string;
}

export const washes: readonly Wash[] =
	[ floorForeground, wallForeground ].map(({ washKey }) => ({ key: washKey, body: washBody }));

/** The properties driving {@link wash}. They are not knobs the pack chose, so the editor hides them. */
const washProps = ({ color, brightness, alpha }: Foreground): Record<string, DecorationProp> => ({
	[color]: { type: 'color', readonly: true, default: '#ffffff' },
	[brightness]: { type: 'range', readonly: true, min: 0.2, max: 1, step: 0.01, default: 1 },
	[alpha]: { type: 'range', readonly: true, min: 0, max: 1, step: 0.01, default: 0 },
});

/** A property the renderer reads out of every placement, so the definition must seed one. */
function requireProp(definition: DecorationDefinition, name: string) {
	const prop = definition.props[name];
	if (prop === undefined) {
		throw new Error(`Decoration '${definition.id}' is a '${definition.type}' decoration but declares no '${name}' property`);
	} else if (prop.default === undefined) {
		throw new Error(`Decoration '${definition.id}' seeds no default for '${name}', which the renderer reads out of every placement`);
	}
}

/**
 * A graphic names the properties tinting it rather than carrying values, and the renderer looks
 * those up on the placement. `decorations.js` reads the colour without checking that it is there,
 * so a reference the definition does not seed takes the room view down with it.
 */
function requireGraphicProps(definition: DecorationDefinition) {
	const graphics = definition.graphics ?? [];
	for (const graphic of graphics) {
		for (const name of [ graphic.color, graphic.alpha, graphic.visible ]) {
			if (name === undefined) {
				continue;
			}
			const prop = definition.props[name];
			if (prop === undefined) {
				throw new Error(`Decoration '${definition.id}' has a graphic referencing unknown property '${name}'`);
			} else if (prop.default === undefined) {
				throw new Error(`Decoration '${definition.id}' seeds no default for '${name}', which its graphics are drawn with`);
			}
		}
	}
	// Tinting is one computation over both: whatever colour the player picked, dimmed by whatever
	// brightness they picked. A graphic naming the one needs the other.
	if (graphics.some(graphic => graphic.color !== undefined)) {
		requireProp(definition, 'brightness');
	}
}

/**
 * A definition with everything the renderer dereferences accounted for: what the pack left out and
 * the catalog can stand in for is filled in, and anything else throws. `assetUrl` names the public
 * url of an asset key; only a landscape without artwork of its own asks it for one.
 */
export function completeDefinition(definition: DecorationDefinition, assetUrl: (key: string) => string): DecorationDefinition {
	const contract = contracts[definition.type];
	for (const field of contract.fields) {
		if (definition[field] === undefined) {
			throw new Error(`Decoration '${definition.id}' is a '${definition.type}' decoration but declares no '${field}'`);
		}
	}
	for (const name of contract.props) {
		requireProp(definition, name);
	}
	requireGraphicProps(definition);
	for (const [ name, values ] of Object.entries(enumeratedProps)) {
		const seed = definition.props[name]?.default;
		if (seed !== undefined && !values.includes(String(seed))) {
			throw new Error(`Decoration '${definition.id}' seeds '${name}' with '${seed}', which the renderer has no entry for`);
		}
	}
	// A pack that names artwork for a layer owns that layer, tint and all — standing in for half of
	// it would hide the mistake behind an invisible overlay rather than report it.
	const naming: Partial<DecorationDefinition> = {};
	const props: Record<string, DecorationProp> = {};
	for (const foreground of contract.foregrounds) {
		if (foreground.url(definition) === undefined) {
			Object.assign(naming, foreground.naming(assetUrl(foreground.washKey)));
			Object.assign(props, washProps(foreground));
		} else {
			for (const name of [ foreground.color, foreground.brightness, foreground.alpha ]) {
				requireProp(definition, name);
			}
		}
	}
	return { ...definition, ...naming, props: { ...props, ...definition.props } };
}

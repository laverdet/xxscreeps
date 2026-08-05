import type { DecorationDefinition, DecorationType } from './catalog.js';
import type { BadgeSymbol } from 'xxscreeps/engine/db/user/badge.js';

// A landscape decoration is pure colour: its entire appearance comes from the properties a player
// picks, so there is no artwork a pack could ship as its inventory preview. The catalog draws one
// from the property defaults instead and serves it like any other asset. A badge is drawn for the
// same reason, from the paths it grants. Types that do have artwork — `wallGraffiti`, `creep`,
// `object` — keep whatever `preview` their pack declares.

/** Side of the drawing's coordinate system. It is an svg, so one drawing serves every size. */
const size = 128;

/** Thickness of the wall frame when a decoration paints the walls as well as the floor. */
const wallThickness = 22;

/**
 * Border widths run 0–60, the range the room renderer works in. Previews are 128 units across, so a
 * border at the top of that range lands at 10 units — heavy enough to read, thin enough to leave the
 * colour it borders visible.
 */
const widthScale = 10 / 60;

/** What each landscape type paints. Types with artwork of their own are absent. */
const parts: Partial<Record<DecorationType, { walls: boolean; floor: boolean }>> = {
	floorLandscape: { walls: false, floor: true },
	wallLandscape: { walls: true, floor: false },
	landscape: { walls: true, floor: true },
};

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Trim the noise off computed coordinates; the drawing is decorative, not precise. */
const round = (value: number) => Number(value.toFixed(2));

const inset = ({ x, y, width, height }: Rect, amount: number): Rect =>
	({ x: x + amount, y: y + amount, width: width - amount * 2, height: height - amount * 2 });

const box = ({ x, y, width, height }: Rect) =>
	`x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}"`;

/** A rectangle outline centred on `rect`. Nothing is drawn without both a colour and a width. */
function border(rect: Rect, color: string | undefined, width: number) {
	if (color === undefined || width <= 0) {
		return [];
	}
	return [ `<rect ${box(rect)} fill="none" stroke="${color}" stroke-width="${round(width)}"/>` ];
}

/** The area between two rectangles, as one even-odd path. */
function ring(outer: Rect, inner: Rect) {
	const edge = ({ x, y, width, height }: Rect) =>
		`M ${round(x)} ${round(y)} H ${round(x + width)} V ${round(y + height)} H ${round(x)} Z`;
	return `${edge(outer)} ${edge(inner)}`;
}

/**
 * A `#rrggbb` colour scaled by a brightness factor, the way the renderer dims a landscape colour.
 * The pack schema guarantees the format, so there is nothing to fall back to.
 */
function dim(color: string, brightness: number) {
	const channels = [ 1, 3, 5 ].map(offset => {
		const channel = parseInt(color.slice(offset, offset + 2), 16);
		return Math.round(Math.min(255, channel * brightness)).toString(16).padStart(2, '0');
	});
	return `#${channels.join('')}`;
}

/** Default of a colour property, or `undefined` when the pack seeds none. */
function colorOf(definition: DecorationDefinition, name: string) {
	const prop = definition.props[name];
	return prop?.type === 'color' && typeof prop.default === 'string' ? prop.default : undefined;
}

/** Default of a numeric property, or `fallback` when the pack seeds none. */
function numberOf(definition: DecorationDefinition, name: string, fallback: number) {
	const prop = definition.props[name];
	return prop?.type === 'range' && typeof prop.default === 'number' ? prop.default : fallback;
}

/** A colour property dimmed by the brightness property that accompanies it. */
function shadeOf(definition: DecorationDefinition, name: string, brightness: string) {
	const color = colorOf(definition, name);
	return color === undefined ? undefined : dim(color, numberOf(definition, brightness, 1));
}

/**
 * The floor of a room: its background, a patch of swamp and a stretch of road. Only the background
 * is mandatory — a pack that leaves out the swamp or the roads simply gets neither drawn.
 */
function floor(definition: DecorationDefinition, rect: Rect) {
	const background = shadeOf(definition, 'floorBackgroundColor', 'floorBackgroundBrightness');
	if (background === undefined) {
		return;
	}
	const { x, y, width, height } = rect;
	const swamp = colorOf(definition, 'swampColor');
	const roads = shadeOf(definition, 'roadsColor', 'roadsBrightness');
	const swampStroke = function() {
		const color = colorOf(definition, 'swampStrokeColor');
		const strokeWidth = round(numberOf(definition, 'swampStrokeWidth', 0) * widthScale);
		return color === undefined || strokeWidth === 0 ? '' : ` stroke="${color}" stroke-width="${strokeWidth}"`;
	}();
	return [
		`<rect ${box(rect)} fill="${background}"/>`,
		...swamp === undefined ? [] : [
			`<ellipse cx="${round(x + width * 0.31)}" cy="${round(y + height * 0.7)}" rx="${round(width * 0.24)}" ry="${round(height * 0.155)}" fill="${swamp}"${swampStroke}/>`,
		],
		...roads === undefined ? [] : [
			`<path d="M ${round(x + width * 0.02)} ${round(y + height * 0.38)} Q ${round(x + width * 0.5)} ${round(y + height * 0.18)} ${round(x + width * 0.98)} ${round(y + height * 0.3)}" fill="none" stroke="${roads}" stroke-width="${round(Math.min(width, height) * 0.06)}" stroke-linecap="round"/>`,
		],
	];
}

/**
 * The walls of a room, drawn as the band between `outer` and `inner`. Walls frame a room rather than
 * fill it, so a wall landscape reads as an outline — and its border stays legible even when the wall
 * colour itself is nearly black, which the plainer packs tend to pick.
 */
function walls(definition: DecorationDefinition, outer: Rect, inner: Rect) {
	const background = shadeOf(definition, 'backgroundColor', 'backgroundBrightness');
	if (background === undefined) {
		return;
	}
	const stroke = shadeOf(definition, 'strokeColor', 'strokeBrightness');
	const width = numberOf(definition, 'strokeWidth', 0) * widthScale;
	return [
		`<path d="${ring(outer, inner)}" fill="${background}" fill-rule="evenodd"/>`,
		// Both edges of the band are wall borders; each is drawn just inside the wall it belongs to.
		...border(inset(outer, width / 2), stroke, width),
		...border(inset(inner, -width / 2), stroke, width),
	];
}

/**
 * The colours a symbol is previewed in. A badge decoration carries no colours of its own — the
 * player picks all three in the badge editor, over whichever symbol they chose — so the drawing
 * stands in with the disc, the symbol and its second half in the catalog's own greys.
 */
const symbolColors = { disc: '#2f2f2f', first: '#dcdcdc', second: '#8f8f8f' };

/**
 * A granted symbol, drawn the way the badge routes draw one: two paths over a disc, in the 100×100
 * box the badge editor authors them in.
 */
function symbol({ path1, path2 }: BadgeSymbol) {
	const { disc, first, second } = symbolColors;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">` +
		'<defs><clipPath id="clip"><circle cx="50" cy="50" r="50"/></clipPath></defs>' +
		'<g clip-path="url(#clip)">' +
		`<rect width="100" height="100" fill="${disc}"/>` +
		`<path d="${path1}" fill="${first}"/>` +
		// The second half is optional; a one-colour symbol spells it as an empty path.
		(path2 === '' ? '' : `<path d="${path2}" fill="${second}"/>`) +
		'</g></svg>';
}

/**
 * An svg standing in for a decoration that ships no artwork, or `undefined` when the definition is
 * neither a badge nor a landscape, or does not carry the colours a drawing needs.
 */
export function renderPreview(definition: DecorationDefinition) {
	if (definition.badge !== undefined) {
		return symbol(definition.badge);
	}
	const part = parts[definition.type];
	if (part === undefined) {
		return;
	}
	const outer: Rect = { x: 0, y: 0, width: size, height: size };
	// Walls frame what the floor fills. Without walls there is no frame to leave room for, so the
	// floor takes the whole drawing.
	const inner = part.walls ? inset(outer, wallThickness) : outer;
	const framed = part.walls ? walls(definition, outer, inner) : [];
	const covered = part.floor ? floor(definition, inner) : [];
	if (framed === undefined || covered === undefined) {
		return;
	}
	const shapes = [ ...framed, ...covered ];
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${shapes.join('')}</svg>`;
}

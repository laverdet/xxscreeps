import type { DecorationPack, PackSource } from './catalog.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from 'xxscreeps/config/index.js';
import * as Badge from 'xxscreeps/engine/db/user/badge.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { insertControlledRoom } from 'xxscreeps/mods/classic/controller/model.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { activate, placementToWire } from './backend.js';
import { catalog, loadCatalog } from './catalog.js';
import { deactivate, deactivateStranded, grant, listDecoratedRooms, listForRoom, listForUser, listGlobal, revoke } from './model.js';
import { conflicts, isOnWorldMap, parsePlacement } from './placement.js';

const alice = '100';
const shard = 'shard0';
const roomName = 'W10N10';
const otherRoomName = 'W10N9';

/** The `active` payload of a floor landscape activation request. */
const floorPlacement = (active: Record<string, unknown> = {}) => ({ shard, room: roomName, ...active });

/** Toggle implicit ownership for one test, restoring whatever the config said. */
function withGrantAll(grantAll: boolean) {
	const decorations = config.decorations ??= {};
	const previous = decorations.grantAll;
	decorations.grantAll = grantAll;
	return {
		[Symbol.dispose]() {
			if (previous === undefined) {
				delete decorations.grantAll;
			} else {
				decorations.grantAll = previous;
			}
		},
	};
}

/**
 * A pack the loader can read without touching the disk. Only packs referencing an asset that must
 * actually exist need a directory holding one — see {@link withAssetFile}.
 */
const source = (pack: DecorationPack, directory = new URL('in-memory/', import.meta.url)): PackSource =>
	({ directory, body: JSON.stringify(pack) });

/** A directory holding one file, for the single case where the loader stats a real asset. */
async function withAssetFile(name: string, content: string) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xxscreeps-pack-'));
	const file = path.join(directory, name);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, content);
	return {
		url: pathToFileURL(`${directory}/`),
		async [Symbol.asyncDispose]() {
			await fs.rm(directory, { recursive: true });
		},
	};
}

const theme = { id: 'test-theme', name: 'Test' };
const landscape = {
	id: 'test-floor',
	type: 'floorLandscape' as const,
	name: 'Test Floor',
	theme: theme.id,
	// Both colours are ones the renderer dereferences, so a floor landscape may not omit either.
	props: {
		floorBackgroundColor: { type: 'color' as const, default: '#123456' },
		roadsColor: { type: 'color' as const, default: '#654321' },
	},
};

/** An overlay carrying its own artwork, sized and positioned the way the renderer reads it. */
const graffiti = {
	id: 'test-graffiti',
	type: 'wallGraffiti' as const,
	name: 'Test Graffiti',
	theme: theme.id,
	graphics: [ { url: 'https://example.com/a.png' } ],
	props: {
		x: { type: 'range' as const, default: 10 },
		y: { type: 'range' as const, default: 10 },
		width: { type: 'range' as const, default: 5 },
		height: { type: 'range' as const, default: 5 },
		alpha: { type: 'range' as const, default: 1 },
	},
};

/** What a pack owes the renderer once it names artwork of its own for the floor foreground. */
const floorForeground = {
	floorForegroundColor: { type: 'color' as const, default: '#ffffff' },
	floorForegroundBrightness: { type: 'range' as const, default: 1 },
	floorForegroundAlpha: { type: 'range' as const, default: 0 },
};

const withForeground = (url: string) =>
	({ ...landscape, floorForegroundUrl: url, props: { ...landscape.props, ...floorForeground } });

describe('mods/meta/decorations', () => {
	describe('catalog', () => {
		test('the bundled pack loads and every definition resolves its theme', () => {
			assert.ok(catalog.definitions.size > 0);
			const themes = new Set(catalog.themes.map(theme => theme.id));
			for (const definition of catalog.definitions.values()) {
				assert.ok(themes.has(definition.theme), `unknown theme '${definition.theme}'`);
			}
		});

		test('an unknown theme is fatal', async () => {
			await assert.rejects(
				loadCatalog([ source({ name: 'test', themes: [], decorations: [ landscape ] }) ]), /unknown theme/);
		});

		test('a graphic referencing an unknown property is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, graphics: [ { url: 'https://example.com/a.png', color: 'nope' } ] } ],
			}) ]), /unknown property 'nope'/);
		});

		test('a graphic referencing a property the pack does not seed is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ {
					...graffiti,
					graphics: [ { url: 'https://example.com/a.png', color: 'tint' } ],
					props: { ...graffiti.props, tint: { type: 'color' }, brightness: { type: 'range', default: 1 } },
				} ],
			}) ]), /seeds no default for 'tint'/);
		});

		test('a graphic naming a colour needs the brightness dimming it', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ {
					...graffiti,
					graphics: [ { url: 'https://example.com/a.png', color: 'tint' } ],
					props: { ...graffiti.props, tint: { type: 'color', default: '#ffffff' } },
				} ],
			}) ]), /declares no 'brightness' property/);
		});

		test('an overlay the renderer cannot size is fatal', async () => {
			const { width, ...props } = graffiti.props;
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...graffiti, props } ],
			}) ]), /declares no 'width' property/);
		});

		test('an animation the renderer has no entry for is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ {
					...graffiti,
					props: { ...graffiti.props, animation: { type: 'string', label: 'Animation', default: 'wiggle' } },
				} ],
			}) ]), /seeds 'animation' with 'wiggle'/);
		});

		test('an object overlay without an object type is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, type: 'object', graphics: [ { url: 'https://example.com/a.png' } ] } ],
			}) ]), /declares no 'objectType'/);
		});

		test('a type drawn from its graphics may not omit them', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, type: 'wallGraffiti' } ],
			}) ]), /declares no 'graphics'/);
		});

		test('a property the renderer dereferences may not be missing', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, props: { floorBackgroundColor: { type: 'color', default: '#123456' } } } ],
			}) ]), /declares no 'roadsColor' property/);
		});

		test('a property the renderer dereferences may not go unseeded', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, props: { ...landscape.props, roadsColor: { type: 'color' } } } ],
			}) ]), /seeds no default for 'roadsColor'/);
		});

		test('a renderer override resolves its resources like any other asset', async () => {
			await using directory = await withAssetFile('art/controller.svg', '<svg xmlns="http://www.w3.org/2000/svg" />');
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ {
					...landscape,
					type: 'metadata',
					objectType: 'controller',
					resources: { controller: 'art/controller.svg' },
					metadata: { actions: [] },
				} ],
			}, directory.url) ]);
			assert.strictEqual(
				loaded.definitions.get('test-floor')?.resources?.controller, '/assets/decorations/test/art/controller.svg');
		});

		test('a badge granting no symbol is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, type: 'badge' } ],
			}) ]), /declares no 'badge'/);
		});

		test('a renderer override without the metadata to install is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, type: 'metadata', objectType: 'controller', resources: {} } ],
			}) ]), /declares no 'metadata'/);
		});

		test('a malformed pack is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, type: 'somethingElse' as never } ],
			}) ]), /Invalid decoration pack/);
		});

		test('two packs may not share an id', async () => {
			await assert.rejects(loadCatalog([
				source({ name: 'first', themes: [ theme ], decorations: [ landscape ] }),
				source({ name: 'second', themes: [], decorations: [ landscape ] }),
			]), /Duplicate decoration/);
		});

		test('assets are checked and rewritten to their public url', async () => {
			await using directory = await withAssetFile('art/floor.svg', '<svg xmlns="http://www.w3.org/2000/svg" />');
			const loaded = await loadCatalog([ source(
				{ name: 'test', themes: [ theme ], decorations: [ withForeground('art/floor.svg') ] },
				directory.url,
			) ]);
			assert.strictEqual(loaded.definitions.get('test-floor')?.floorForegroundUrl, '/assets/decorations/test/art/floor.svg');
			assert.ok(loaded.assets.has('test/art/floor.svg'));
		});

		// Artwork carried in the pack.json is served from the same url a file beside it would be, so a
		// decoration cannot tell which of the two it got.
		test('artwork the pack carries itself is served like a file', async () => {
			const body = '<svg xmlns="http://www.w3.org/2000/svg" />';
			const loaded = await loadCatalog([ source({
				name: 'test',
				assets: { 'art/floor.svg': body },
				themes: [ theme ],
				decorations: [ withForeground('art/floor.svg') ],
			}) ]);
			assert.strictEqual(loaded.definitions.get('test-floor')?.floorForegroundUrl, '/assets/decorations/test/art/floor.svg');
			assert.deepStrictEqual(loaded.assets.get('test/art/floor.svg'), { kind: 'generated', body });
		});

		test('carrying artwork the asset route cannot serve is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				assets: { 'art/floor.txt': 'nope' },
				themes: [ theme ],
				decorations: [ landscape ],
			}) ]), /unsupported file type/);
		});

		test('external urls are left alone', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ withForeground('https://example.com/floor.png') ],
			}) ]);
			assert.strictEqual(loaded.definitions.get('test-floor')?.floorForegroundUrl, 'https://example.com/floor.png');
			assert.ok(![ ...loaded.assets.values() ].some(asset => asset.kind === 'file'));
		});

		test('a missing asset is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ withForeground('art/floor.svg') ],
			}) ]), /does not exist/);
		});

		test('an asset outside the pack directory is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ withForeground('../floor.svg') ],
			}) ]), /escapes the pack directory/);
		});

		test('an asset the client cannot render is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ withForeground('art/floor.txt') ],
			}) ]), /unsupported file type/);
		});

		test('a colour property seeded with something else is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, props: { floorBackgroundColor: { type: 'color', default: 'red' } } } ],
			}) ]), /not a '#rrggbb' colour/);
		});
	});

	describe('previews', () => {
		/** Whether a url the catalog handed the client is one the asset route will answer. */
		const served = (url: string) => catalog.assets.has(url.replace('/assets/decorations/', ''));

		test('a landscape without artwork gets one drawn from its colours', async () => {
			const loaded = await loadCatalog([ source({ name: 'test', themes: [ theme ], decorations: [ landscape ] }) ]);
			const url = '/assets/decorations/_preview/test/test-floor.svg';
			assert.deepStrictEqual(loaded.definitions.get('test-floor')?.preview, {
				original: url, '128x128': url, '256x256': url,
			});
			const asset = loaded.assets.get('_preview/test/test-floor.svg');
			assert.strictEqual(asset?.kind, 'generated');
			assert.match(asset.body, /^<svg /);
			// The floor colour the pack seeds, undimmed, is what the drawing fills with.
			assert.match(asset.body, /#123456/);
		});

		test('a preview the pack declares wins', async () => {
			await using directory = await withAssetFile('art/tile.png', 'png');
			const loaded = await loadCatalog([ source(
				{ name: 'test', themes: [ theme ], decorations: [ { ...landscape, preview: { '128x128': 'art/tile.png' } } ] },
				directory.url,
			) ]);
			assert.deepStrictEqual(loaded.definitions.get('test-floor')?.preview, {
				'128x128': '/assets/decorations/test/art/tile.png',
			});
			assert.ok(!loaded.assets.has('_preview/test/test-floor.svg'));
		});

		test('a type carrying its own artwork gets none', async () => {
			const loaded = await loadCatalog([ source({ name: 'test', themes: [ theme ], decorations: [ graffiti ] }) ]);
			assert.strictEqual(loaded.definitions.get('test-graffiti')?.preview, undefined);
			assert.ok(!loaded.assets.has('_preview/test/test-graffiti.svg'));
		});

		// A badge carries no artwork either: the player picks all three colours in the badge editor, so
		// the drawing stands in with the catalog's own and a badge pack ships no image files at all.
		test('a badge gets one drawn from the symbol it grants', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, id: 'test-badge', type: 'badge', badge: { path1: 'M 0 0 H 100 Z', path2: '' } } ],
			}) ]);
			assert.strictEqual(
				loaded.definitions.get('test-badge')?.preview?.['128x128'], '/assets/decorations/_preview/test/test-badge.svg');
			const asset = loaded.assets.get('_preview/test/test-badge.svg');
			assert.strictEqual(asset?.kind, 'generated');
			assert.match(asset.body, /M 0 0 H 100 Z/);
		});

		test('a landscape whose colours are not colours gets none', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, props: { ...landscape.props, floorBackgroundColor: { type: 'display', default: 'nope' } } } ],
			}) ]);
			assert.strictEqual(loaded.definitions.get('test-floor')?.preview, undefined);
			assert.ok(!loaded.assets.has('_preview/test/test-floor.svg'));
		});

		test('every landscape in the bundled pack has a preview', () => {
			for (const definition of catalog.definitions.values()) {
				if ([ 'floorLandscape', 'wallLandscape', 'landscape' ].includes(definition.type)) {
					assert.ok(definition.preview?.['128x128'] !== undefined, `'${definition.id}' has no preview`);
				}
			}
		});

		test('every badge in the bundled pack previews from the symbol it grants', () => {
			for (const definition of catalog.definitions.values()) {
				if (definition.type !== 'badge') {
					continue;
				}
				assert.ok(definition.badge !== undefined, `'${definition.id}' grants no symbol`);
				const preview = definition.preview?.['128x128'];
				assert.ok(preview !== undefined, `'${definition.id}' has no preview`);
				assert.ok(served(preview), `'${definition.id}' previews from '${preview}', which nothing serves`);
			}
		});

		// A skin's artwork goes to the renderer under an alias of its own rather than through
		// `graphics`, so it is resolved — and checked — the same way but from somewhere else.
		test('every renderer override in the bundled pack draws from artwork the route can serve', () => {
			for (const definition of catalog.definitions.values()) {
				if (definition.type !== 'metadata') {
					continue;
				}
				for (const [ alias, url ] of Object.entries(definition.resources!)) {
					assert.ok(served(url), `'${definition.id}' draws '${alias}' from '${url}', which nothing serves`);
				}
			}
		});

		// Nothing is drawn for a type carrying artwork, so the bundled pack owes one, and every url it
		// hands the client has to be one the asset route will actually answer.
		test('every overlay in the bundled pack has a preview the route can serve', () => {
			for (const definition of catalog.definitions.values()) {
				if (![ 'wallGraffiti', 'creep', 'object' ].includes(definition.type)) {
					continue;
				}
				const preview = definition.preview?.['128x128'];
				assert.ok(preview !== undefined, `'${definition.id}' has no preview`);
				assert.ok(served(preview), `'${definition.id}' previews from '${preview}', which nothing serves`);
				for (const graphic of definition.graphics!) {
					assert.ok(served(graphic.url), `'${definition.id}' draws from '${graphic.url}', which nothing serves`);
				}
			}
		});
	});

	describe('foregrounds', () => {
		test('a landscape without artwork gets one it can draw without showing anything', async () => {
			const loaded = await loadCatalog([ source({ name: 'test', themes: [ theme ], decorations: [ landscape ] }) ]);
			const definition = loaded.definitions.get('test-floor');
			assert.strictEqual(definition?.floorForegroundUrl, '/assets/decorations/_texture/floor-wash.svg');
			assert.strictEqual(loaded.assets.get('_texture/floor-wash.svg')?.kind, 'generated');
			// Tinted white and faded out, so the room looks exactly as it did without a layer at all.
			assert.strictEqual(definition.props.floorForegroundColor?.default, '#ffffff');
			// And it is not a knob the pack chose, so the editor does not offer it.
			assert.deepStrictEqual(definition.props.floorForegroundAlpha, {
				type: 'range', readonly: true, min: 0, max: 1, step: 0.01, default: 0,
			});
		});

		test('a pack naming its own artwork owns the properties tinting it', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...landscape, floorForegroundUrl: 'https://example.com/floor.png' } ],
			}) ]), /declares no 'floorForegroundColor' property/);
		});

		// Two urls rather than one shared: the room view draws the floor foreground and the wall
		// foreground from two separate places, and pixi hands both the same texture when the urls
		// match — which the wall half then destroys out from under the floor half.
		test('a room landscape gets both halves, each with its own texture', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ {
					...landscape,
					type: 'landscape',
					props: {
						...landscape.props,
						backgroundColor: { type: 'color', default: '#111111' },
						strokeColor: { type: 'color', default: '#222222' },
					},
				} ],
			}) ]);
			const definition = loaded.definitions.get('test-floor');
			assert.strictEqual(definition?.floorForegroundUrl, '/assets/decorations/_texture/floor-wash.svg');
			assert.strictEqual(definition.foregroundUrl, '/assets/decorations/_texture/wall-wash.svg');
		});

		test('every landscape in the bundled pack hands the renderer a foreground', () => {
			for (const definition of catalog.definitions.values()) {
				if ([ 'floorLandscape', 'landscape' ].includes(definition.type)) {
					assert.ok(definition.floorForegroundUrl !== undefined, `'${definition.id}' draws no floor foreground`);
					assert.ok(definition.props.floorForegroundColor?.default !== undefined, `'${definition.id}' tints nothing`);
				}
				if ([ 'wallLandscape', 'landscape' ].includes(definition.type)) {
					assert.ok(definition.foregroundUrl !== undefined, `'${definition.id}' draws no wall foreground`);
					assert.ok(definition.props.foregroundColor?.default !== undefined, `'${definition.id}' tints nothing`);
				}
				if (definition.type === 'landscape') {
					assert.notStrictEqual(definition.floorForegroundUrl, definition.foregroundUrl,
						`'${definition.id}' draws both foregrounds from one texture`);
				}
			}
		});
	});

	describe('ownership', () => {
		test('granted decorations show up, revoked ones do not', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(false);
			const { db } = testShard;
			const [ definition ] = catalog.definitions.values();

			assert.deepStrictEqual(await listForUser(db, alice), []);
			const itemId = await grant(db, alice, definition!.id);
			const owned = await listForUser(db, alice);
			assert.strictEqual(owned.length, 1);
			assert.strictEqual(owned[0]?.id, itemId);
			assert.strictEqual(owned[0].definition.id, definition!.id);

			assert.strictEqual(await revoke(db, alice, itemId), true);
			assert.strictEqual(await revoke(db, alice, itemId), false);
			assert.deepStrictEqual(await listForUser(db, alice), []);
		});

		// The client sorts the inventory by age and does not check first, so an item without one takes
		// the page down. Implicit ownership has no moment to report, so it reports the epoch.
		test('every owned item carries the moment it was granted', async () => {
			await using testShard = await instantiateTestShard();
			const { db } = testShard;
			{
				using grantAll = withGrantAll(true);
				const owned = await listForUser(db, alice);
				assert.ok(owned.length > 0);
				assert.ok(owned.every(item => item.createdAt === 0), 'implicit ownership ties on the epoch');
			}
			using grantAll = withGrantAll(false);
			const [ definition ] = catalog.definitions.values();
			await grant(db, alice, definition!.id);
			const owned = await listForUser(db, alice);
			assert.strictEqual(owned.length, 1);
			assert.ok(owned[0]!.createdAt > 0, 'a stored grant reports when it was made');
		});

		test('granting something the catalog does not have is an error', async () => {
			await using testShard = await instantiateTestShard();
			await assert.rejects(grant(testShard.db, alice, 'no-such-decoration'), /No such decoration/);
		});

		test('grantAll hands out the whole catalog, keyed by decoration id', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const owned = await listForUser(testShard.db, alice);
			assert.strictEqual(owned.length, catalog.definitions.size);
			for (const item of owned) {
				assert.strictEqual(item.id, item.definition.id);
			}
		});

		test('removing a user drops their decorations', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(false);
			const { db } = testShard;
			const [ definition ] = catalog.definitions.values();

			await grant(db, alice, definition!.id);
			await User.remove(db, alice);
			assert.deepStrictEqual(await listForUser(db, alice), []);
		});
	});

	describe('placement', () => {
		const floor = catalog.definitions.get('xx-floor-plain')!;
		const wall = catalog.definitions.get('xx-wall-plain')!;
		const room = catalog.definitions.get('xx-room-neon')!;

		test('property values are checked against the definition', () => {
			assert.ok('error' in parsePlacement(floor, { shard, room: roomName, nope: 1 }));
			assert.ok('error' in parsePlacement(floor, { shard, room: roomName, floorBackgroundColor: 'red' }));
			assert.ok('error' in parsePlacement(floor, { shard, room: roomName, floorBackgroundBrightness: 99 }));
			assert.ok('error' in parsePlacement(floor, { floorBackgroundColor: '#123456' }), 'a room is required');
		});

		// The client offers a free text field unless the pack labels the property its own way, so a
		// value the renderer's animation table has no entry for has to lose here rather than there.
		test('an animation outside the renderer\'s table is rejected', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: [ theme ],
				decorations: [ { ...graffiti, props: { ...graffiti.props, animation: { type: 'string', default: '' } } } ],
			}) ]);
			const definition = loaded.definitions.get('test-graffiti')!;
			assert.ok('error' in parsePlacement(definition, { shard, room: roomName, animation: 'wiggle' }));
			assert.ok(!('error' in parsePlacement(definition, { shard, room: roomName, animation: 'neon' })));
			assert.ok(!('error' in parsePlacement(definition, { shard, room: roomName, animation: '' })), 'none is a value');
		});

		test('numbers and booleans are accepted in their string spelling', () => {
			const placement = parsePlacement(floor, { shard, room: roomName, floorBackgroundBrightness: '0.5', world: 'true' });
			assert.ok(!('error' in placement));
			assert.strictEqual(placement.props.floorBackgroundBrightness, 0.5);
			assert.strictEqual(placement.props.world, true);
		});

		test('properties the client leaves out fall back to the definition seed', () => {
			const placement = parsePlacement(floor, { shard, room: roomName });
			assert.ok(!('error' in placement));
			assert.strictEqual(placement.props.floorBackgroundColor, floor.props.floorBackgroundColor!.default);
		});

		// The official client sends readonly properties back like any other, so a value here cannot be
		// rejected — but readonly promises the definition owns the value, so it cannot win either.
		test('a readonly property keeps its seed no matter what the client sends', () => {
			const placement = parsePlacement(floor, { shard, room: roomName, floorForegroundColor: '#ff0000' });
			assert.ok(!('error' in placement));
			assert.strictEqual(placement.props.floorForegroundColor, floor.props.floorForegroundColor!.default);
		});

		test('what the client sends round-trips back in the same shape', () => {
			const sent = { shard, room: roomName, world: false, floorBackgroundColor: '#abcdef' };
			const placement = parsePlacement(floor, sent);
			assert.ok(!('error' in placement));
			// Flat in, flat out: the id and the target sit next to the property values, never wrapping
			// them. The room view flattens this bag and matches socket updates against its `_id`, so
			// the id has to be inside it.
			const wire = placementToWire('item-1', placement);
			assert.strictEqual(wire._id, 'item-1');
			assert.strictEqual(wire.shard, shard);
			assert.strictEqual(wire.room, roomName);
			assert.strictEqual(wire.world, false);
			assert.strictEqual(wire.floorBackgroundColor, '#abcdef');
			assert.ok(!('props' in wire));
			// And it parses again unchanged once the activate route strips the wire-only `_id`, which
			// is the trip the client's edit-and-resend makes.
			const { _id, ...resent } = wire;
			assert.deepStrictEqual(parsePlacement(floor, resent), placement);
		});

		test('a creep decoration names no room, since it follows its owner', () => {
			const creep = { ...floor, id: 'test-creep', type: 'creep' as const };
			const placement = parsePlacement(creep, {});
			assert.ok(!('error' in placement));
			assert.strictEqual(placement.room, undefined);
			assert.strictEqual(placement.shard, undefined);
		});

		test('a badge names no room either, since it is worn rather than placed', () => {
			const placement = parsePlacement(catalog.definitions.get('xx-chevrons')!, {});
			assert.ok(!('error' in placement));
			assert.strictEqual(placement.room, undefined);
		});

		test('a landscape collides with both halves it paints', () => {
			assert.ok(conflicts(room, floor));
			assert.ok(conflicts(room, wall));
			assert.ok(!conflicts(floor, wall));
			assert.ok(conflicts(floor, floor));
		});

		test('renderer overrides only argue over the same kind of object', () => {
			const controller = { ...floor, id: 'test-controller', type: 'metadata' as const, objectType: 'controller' };
			const spawn = { ...controller, id: 'test-spawn', objectType: 'spawn' };
			assert.ok(conflicts(controller, { ...controller, id: 'test-other' }));
			assert.ok(!conflicts(controller, spawn));
			assert.ok(!conflicts(controller, floor));
		});
	});

	describe('activation', () => {
		/** Placing needs a room the player holds, which the test shard does not hand out. */
		async function ownRoom(testShard: Awaited<ReturnType<typeof instantiateTestShard>>, room = roomName) {
			await insertControlledRoom(testShard.shard, alice, room);
		}

		test('an owned decoration can be placed and shows up in the room', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			assert.strictEqual(await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement()), undefined);
			const placed = await listForRoom(db, shard, roomName);
			assert.strictEqual(placed.length, 1);
			assert.strictEqual(placed[0]?.id, 'xx-floor-plain');
			assert.strictEqual(placed[0].userId, alice);
			assert.strictEqual(placed[0].active.room, roomName);
			// And the room now counts as decorated, which is what the world map filters by.
			assert.ok((await listDecoratedRooms(db, shard)).has(roomName));
			assert.ok(!(await listDecoratedRooms(db, shard)).has(otherRoomName));

			const [ item ] = (await listForUser(db, alice)).filter(each => each.id === 'xx-floor-plain');
			assert.strictEqual(item?.active?.room, roomName);
			assert.ok(item.activatedAt !== undefined);
		});

		test('placing in a room the player does not hold is refused', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const result = await activate(testShard.db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			assert.deepStrictEqual(result, { error: 'room not controlled' });
		});

		test('an unknown room is refused', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			await ownRoom(testShard);
			const result = await activate(testShard.db, testShard.shard, alice, 'xx-floor-plain', floorPlacement({ room: 'W99N99' }));
			assert.deepStrictEqual(result, { error: 'unknown room' });
		});

		test('a decoration the player does not own is refused', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(false);
			await ownRoom(testShard);
			const result = await activate(testShard.db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			assert.deepStrictEqual(result, { error: 'not owned' });
		});

		test('a landscape refuses a room that already has a floor', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			const result = await activate(db, testShard.shard, alice, 'xx-room-neon', floorPlacement());
			assert.deepStrictEqual(result, { error: 'already decorated' });
		});

		test('re-activating moves the decoration instead of duplicating it', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);
			await ownRoom(testShard, otherRoomName);

			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement({ room: otherRoomName }));

			assert.deepStrictEqual(await listForRoom(db, shard, roomName), []);
			assert.strictEqual((await listForRoom(db, shard, otherRoomName)).length, 1);
		});

		test('deactivating takes it back off the map', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			await deactivate(db, alice, [ 'xx-floor-plain' ]);
			assert.deepStrictEqual(await listForRoom(db, shard, roomName), []);
			const [ item ] = (await listForUser(db, alice)).filter(each => each.id === 'xx-floor-plain');
			assert.strictEqual(item?.active, undefined);
			// And the room stops counting as decorated: the zset entry went with the placement, so the
			// set is exact rather than a filter over history.
			assert.ok(!(await listDecoratedRooms(db, shard)).has(roomName));
		});

		test('a revoke that finds no grant leaves the placement alone', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			// Implicit ownership has no grant to take away, so this fails — without undoing the placement.
			assert.strictEqual(await revoke(db, alice, 'xx-floor-plain'), false);
			assert.strictEqual((await listForRoom(db, shard, roomName)).length, 1);
		});

		// A placement made under implicit ownership has no stored grant behind it. Turning `grantAll`
		// off strands it — nothing lists it, so nothing can deactivate it — which is what the cleanup
		// sweep is for.
		test('turning grantAll off strands a placement until cleanup', async () => {
			await using testShard = await instantiateTestShard();
			const { db } = testShard;
			await ownRoom(testShard);
			{
				using grantAll = withGrantAll(true);
				await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
				// Nothing is stranded while ownership is implicit.
				assert.deepStrictEqual(await deactivateStranded(db, alice), []);
			}
			using grantAll = withGrantAll(false);
			assert.deepStrictEqual(await listForRoom(db, shard, roomName), [], 'the placement is invisible');
			assert.deepStrictEqual(await deactivateStranded(db, alice), [ 'xx-floor-plain' ]);
			assert.deepStrictEqual(await deactivateStranded(db, alice), []);
			{
				// Taken down rather than lying in wait: implicit ownership lists the item unplaced again.
				using grantAllAgain = withGrantAll(true);
				const [ item ] = (await listForUser(db, alice)).filter(each => each.id === 'xx-floor-plain');
				assert.strictEqual(item?.active, undefined);
			}
		});

		test('cleanup leaves a placement with a stored grant alone', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(false);
			const { db } = testShard;
			await ownRoom(testShard);

			const itemId = await grant(db, alice, 'xx-floor-plain');
			await activate(db, testShard.shard, alice, itemId, floorPlacement());
			assert.deepStrictEqual(await deactivateStranded(db, alice), []);
			assert.strictEqual((await listForRoom(db, shard, roomName)).length, 1);
		});

		test('removing a user takes their placements with them', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			await User.remove(db, alice);
			assert.deepStrictEqual(await listForRoom(db, shard, roomName), []);
		});

		// The symbol only reaches `/api/user/badge` while the decoration granting it is active — that
		// route stores a badge naming paths of its own, and takes the paths from the grant rather than
		// from the request.
		test('an active badge is a symbol its owner may wear', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			const symbol = catalog.definitions.get('xx-chevrons')!.badge!;
			const worn = { color1: '#111111', color2: '#222222', color3: '#333333', flip: false, type: symbol };

			await assert.rejects(Badge.validate(db, alice, { ...worn }), /not granted/);
			assert.strictEqual(await activate(db, testShard.shard, alice, 'xx-chevrons', {}), undefined);
			assert.deepStrictEqual(await Badge.validate(db, alice, { ...worn }), worn);

			// And a symbol nobody granted stays out, however well-formed the request looks.
			await assert.rejects(
				Badge.validate(db, alice, { ...worn, type: { path1: 'M 0 0 H 1 Z', path2: '' } }), /not granted/);

			await deactivate(db, alice, [ 'xx-chevrons' ]);
			await assert.rejects(Badge.validate(db, alice, { ...worn }), /not granted/);
		});

		// It decorates an account rather than a room, so no room view has anything to draw for it —
		// unlike the creep decorations, which every room reports alongside what stands in it.
		test('a badge is reported to nobody but its owner', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			await activate(db, testShard.shard, alice, 'xx-chevrons', {});
			assert.deepStrictEqual(await listForRoom(db, shard, roomName), []);
			assert.deepStrictEqual(await listGlobal(db), []);
			const [ item ] = (await listForUser(db, alice)).filter(each => each.id === 'xx-chevrons');
			assert.ok(item?.active !== undefined);
		});

		test('the world-map flag survives the round trip through storage', async () => {
			await using testShard = await instantiateTestShard();
			using grantAll = withGrantAll(true);
			const { db } = testShard;
			await ownRoom(testShard);

			// The bundled pack seeds `world` on, so a defaulted placement is map-visible.
			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement());
			const [ shown ] = await listForRoom(db, shard, roomName);
			assert.strictEqual(isOnWorldMap(shown!.active), true);

			await activate(db, testShard.shard, alice, 'xx-floor-plain', floorPlacement({ world: false }));
			const [ hidden ] = await listForRoom(db, shard, roomName);
			assert.strictEqual(isOnWorldMap(hidden!.active), false);
		});
	});
});

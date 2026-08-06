import type { DecorationPack, PackSource } from './catalog.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { catalog, loadCatalog } from './catalog.js';
import { grant, listForUser, revoke } from './model.js';
import { conflicts } from './placement.js';

const alice = '100';

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
 * The bundled pack's directory. Fixtures name their artwork out of it: every asset a pack
 * references is a file it ships, so a fixture needs a directory which really holds one, and this
 * one holds art of every kind the loader accepts.
 */
const packDirectory = new URL('.', import.meta.resolve('xxscreeps/mods/meta/decorations/pack/pack.yaml'));

/** A file the bundled pack ships, for fixtures which only need the reference to resolve. */
const artUrl = 'art/tag.svg';

/**
 * A pack the loader can read without writing a `pack.yaml` — yaml is a superset of JSON, so a
 * stringified literal is a valid one. Packs referencing an asset of their own need a directory
 * shipping it — see {@link withAssetFile}.
 */
const source = (pack: DecorationPack, directory = packDirectory): PackSource =>
	({ directory, body: JSON.stringify(pack) });

/** The path half of a resolved asset url; the `?v=` cache-bust varies with content and mtime. */
const assetPath = (url: string | undefined) => url?.split('?')[0];

/** Fixtures declare their id inline; a pack keys its entries by it. */
const byId = <Type extends { id: string }>(...items: readonly Type[]): Record<string, Omit<Type, 'id'>> =>
	Object.fromEntries(items.map(({ id, ...rest }) => [ id, rest ]));

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
	// Both colors are ones the renderer dereferences, so a floor landscape may not omit either.
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
	graphics: [ { url: artUrl } ],
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
				loadCatalog([ source({ name: 'test', themes: {}, decorations: byId(landscape) }) ]), /unknown theme/);
		});

		test('a graphic referencing an unknown property is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, graphics: [ { url: artUrl, color: 'nope' } ] }),
			}) ]), /unknown property 'nope'/);
		});

		test('a graphic referencing a property the pack does not seed is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({
					...graffiti,
					graphics: [ { url: artUrl, color: 'tint' } ],
					props: { ...graffiti.props, tint: { type: 'color' }, brightness: { type: 'range', default: 1 } },
				}),
			}) ]), /seeds no default for 'tint'/);
		});

		test('a graphic naming a color needs the brightness dimming it', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({
					...graffiti,
					graphics: [ { url: artUrl, color: 'tint' } ],
					props: { ...graffiti.props, tint: { type: 'color', default: '#ffffff' } },
				}),
			}) ]), /declares no 'brightness' property/);
		});

		test('an overlay the renderer cannot size is fatal', async () => {
			const { width, ...props } = graffiti.props;
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...graffiti, props }),
			}) ]), /declares no 'width' property/);
		});

		test('an animation the renderer has no entry for is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({
					...graffiti,
					props: { ...graffiti.props, animation: { type: 'string', label: 'Animation', default: 'wiggle' } },
				}),
			}) ]), /seeds 'animation' with 'wiggle'/);
		});

		test('an object overlay without an object type is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, type: 'object', graphics: [ { url: artUrl } ] }),
			}) ]), /declares no 'objectType'/);
		});

		test('a type drawn from its graphics may not omit them', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, type: 'wallGraffiti' }),
			}) ]), /declares no 'graphics'/);
		});

		test('a property the renderer dereferences may not be missing', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, props: { floorBackgroundColor: { type: 'color', default: '#123456' } } }),
			}) ]), /declares no 'roadsColor' property/);
		});

		test('a property the renderer dereferences may not go unseeded', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, props: { ...landscape.props, roadsColor: { type: 'color' } } }),
			}) ]), /seeds no default for 'roadsColor'/);
		});

		test('a renderer override resolves its resources like any other asset', async () => {
			await using directory = await withAssetFile('art/controller.svg', '<svg xmlns="http://www.w3.org/2000/svg" />');
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({
					...landscape,
					type: 'metadata',
					objectType: 'controller',
					resources: { controller: 'art/controller.svg' },
					metadata: { actions: [] },
				}),
			}, directory.url) ]);
			assert.strictEqual(
				assetPath(loaded.definitions.get('test-floor')?.resources?.controller), '/assets/decorations/test/art/controller.svg');
		});

		test('a badge granting no symbol is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, type: 'badge' }),
			}) ]), /declares no 'badge'/);
		});

		test('a renderer override without the metadata to install is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, type: 'metadata', objectType: 'controller', resources: {} }),
			}) ]), /declares no 'metadata'/);
		});

		test('a malformed pack is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, type: 'somethingElse' as never }),
			}) ]), /Invalid decoration pack/);
		});

		test('two packs may not share an id', async () => {
			await assert.rejects(loadCatalog([
				source({ name: 'first', themes: byId(theme), decorations: byId(landscape) }),
				source({ name: 'second', themes: {}, decorations: byId(landscape) }),
			]), /Duplicate decoration/);
		});

		test('assets are checked and rewritten to their public url', async () => {
			await using directory = await withAssetFile('art/floor.svg', '<svg xmlns="http://www.w3.org/2000/svg" />');
			const loaded = await loadCatalog([ source(
				{ name: 'test', themes: byId(theme), decorations: byId(withForeground('art/floor.svg')) },
				directory.url,
			) ]);
			const url = loaded.definitions.get('test-floor')?.floorForegroundUrl;
			assert.strictEqual(assetPath(url), '/assets/decorations/test/art/floor.svg');
			// The route serves these as immutable, so the url must carry a cache-bust.
			assert.match(url!, /\?v=/);
			assert.ok(loaded.assets.has('test/art/floor.svg'));
		});

		test('a missing asset is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId(withForeground('art/floor.svg')),
			}) ]), /does not exist/);
		});

		// Artwork hosted elsewhere is a build step which uploads the files and publishes a pack naming
		// them, so nothing the loader accepts may point off the pack directory.
		for (const [ what, url ] of [
			[ 'a parent directory', '../floor.svg' ],
			[ 'another origin', 'https://example.com/floor.png' ],
			[ 'a data url', 'data:image/svg+xml,<svg/>' ],
		] as const) {
			test(`an asset in ${what} is fatal`, async () => {
				await assert.rejects(loadCatalog([ source({
					name: 'test',
					themes: byId(theme),
					decorations: byId(withForeground(url)),
				}) ]), /is not a file the pack ships/);
			});
		}

		test('an asset the client cannot render is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId(withForeground('art/floor.txt')),
			}) ]), /unsupported file type/);
		});

		test('a color property seeded with something else is fatal', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, props: { floorBackgroundColor: { type: 'color', default: 'red' } } }),
			}) ]), /must match pattern/);
		});
	});

	describe('previews', () => {
		/** Whether a url the catalog handed the client is one the asset route will answer. */
		const served = (url: string) => catalog.assets.has(assetPath(url)!.replace('/assets/decorations/', ''));

		test('a landscape without artwork gets one drawn from its colors', async () => {
			const loaded = await loadCatalog([ source({ name: 'test', themes: byId(theme), decorations: byId(landscape) }) ]);
			const preview = loaded.definitions.get('test-floor')?.preview;
			const url = preview?.original;
			assert.strictEqual(assetPath(url), '/assets/decorations/_preview/test/test-floor.svg');
			assert.deepStrictEqual(preview, { original: url, '128x128': url, '256x256': url });
			const asset = loaded.assets.get('_preview/test/test-floor.svg');
			assert.strictEqual(asset?.kind, 'generated');
			assert.match(asset.body, /^<svg /);
			// The floor color the pack seeds, undimmed, is what the drawing fills with.
			assert.match(asset.body, /#123456/);
		});

		test('a preview the pack declares wins', async () => {
			await using directory = await withAssetFile('art/tile.png', 'png');
			const loaded = await loadCatalog([ source(
				{ name: 'test', themes: byId(theme), decorations: byId({ ...landscape, preview: { '128x128': 'art/tile.png' } }) },
				directory.url,
			) ]);
			const preview = loaded.definitions.get('test-floor')?.preview;
			assert.deepStrictEqual(Object.keys(preview!), [ '128x128' ]);
			assert.strictEqual(assetPath(preview!['128x128']), '/assets/decorations/test/art/tile.png');
			assert.ok(!loaded.assets.has('_preview/test/test-floor.svg'));
		});

		test('a type carrying its own artwork gets none', async () => {
			const loaded = await loadCatalog([ source({ name: 'test', themes: byId(theme), decorations: byId(graffiti) }) ]);
			assert.strictEqual(loaded.definitions.get('test-graffiti')?.preview, undefined);
			assert.ok(!loaded.assets.has('_preview/test/test-graffiti.svg'));
		});

		// A badge carries no artwork either: the player picks all three colors in the badge editor, so
		// the drawing stands in with the catalog's own and a badge pack ships no image files at all.
		test('a badge gets one drawn from the symbol it grants', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, id: 'test-badge', type: 'badge', badge: { path1: 'M 0 0 H 100 Z', path2: '' } }),
			}) ]);
			assert.strictEqual(
				assetPath(loaded.definitions.get('test-badge')?.preview?.['128x128']), '/assets/decorations/_preview/test/test-badge.svg');
			const asset = loaded.assets.get('_preview/test/test-badge.svg');
			assert.strictEqual(asset?.kind, 'generated');
			assert.match(asset.body, /M 0 0 H 100 Z/);
		});

		test('a landscape whose colors are not colors gets none', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, props: { ...landscape.props, floorBackgroundColor: { type: 'display', default: 'nope' } } }),
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
			const loaded = await loadCatalog([ source({ name: 'test', themes: byId(theme), decorations: byId(landscape) }) ]);
			const definition = loaded.definitions.get('test-floor');
			assert.strictEqual(assetPath(definition?.floorForegroundUrl), '/assets/decorations/_texture/floor-wash.svg');
			assert.strictEqual(loaded.assets.get('_texture/floor-wash.svg')?.kind, 'generated');
			// Tinted white and faded out, so the room looks exactly as it did without a layer at all.
			assert.strictEqual(definition?.props.floorForegroundColor?.default, '#ffffff');
			// And it is not a knob the pack chose, so the editor does not offer it.
			assert.deepStrictEqual(definition.props.floorForegroundAlpha, {
				type: 'range', readonly: true, min: 0, max: 1, step: 0.01, default: 0,
			});
		});

		test('a pack naming its own artwork owns the properties tinting it', async () => {
			await assert.rejects(loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({ ...landscape, floorForegroundUrl: artUrl }),
			}) ]), /declares no 'floorForegroundColor' property/);
		});

		// Two urls rather than one shared: the room view draws the floor foreground and the wall
		// foreground from two separate places, and pixi hands both the same texture when the urls
		// match — which the wall half then destroys out from under the floor half.
		test('a room landscape gets both halves, each with its own texture', async () => {
			const loaded = await loadCatalog([ source({
				name: 'test',
				themes: byId(theme),
				decorations: byId({
					...landscape,
					type: 'landscape',
					props: {
						...landscape.props,
						backgroundColor: { type: 'color', default: '#111111' },
						strokeColor: { type: 'color', default: '#222222' },
					},
				}),
			}) ]);
			const definition = loaded.definitions.get('test-floor');
			assert.strictEqual(assetPath(definition?.floorForegroundUrl), '/assets/decorations/_texture/floor-wash.svg');
			assert.strictEqual(assetPath(definition?.foregroundUrl), '/assets/decorations/_texture/wall-wash.svg');
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
});

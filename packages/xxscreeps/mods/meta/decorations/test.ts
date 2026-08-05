import type { DecorationPack, PackSource } from './catalog.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { catalog, loadCatalog } from './catalog.js';

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
});

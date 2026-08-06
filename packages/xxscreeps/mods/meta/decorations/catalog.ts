import type { BadgeSymbol } from 'xxscreeps/engine/db/user/badge.js';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Ajv } from 'ajv';
import jsYaml from 'js-yaml';
import { config } from 'xxscreeps/config/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeRelativeFragment } from 'xxscreeps/utility/url.js';
import { renderPreview } from './preview.js';
import { completeDefinition, washes } from './renderer.js';

// The catalog is the set of decorations this server offers. It is static data, not user data:
// definitions are authored in *decoration packs* and loaded once at startup. A pack is a
// `pack.yaml` plus, optionally, the image files it references — see `pack/pack.yaml` for the
// bundled one.
//
// Anything wrong with a pack (unknown type, missing asset, dangling theme or prop reference,
// duplicate id) throws while loading. A server that boots with a broken catalog would hand the
// client definitions it can't render, so this is deliberately fatal.

/**
 * Decoration types the client renders. `landscape` acts as both a floor and a wall landscape.
 * `object` draws graphics over a kind of game object; `metadata` replaces how that kind is drawn
 * altogether. `badge` draws nothing at all — it grants a symbol the account badge editor offers
 * beside the numbered shapes. See [renderer.ts](./renderer.ts) for what each one owes the client.
 */
export type DecorationType = 'floorLandscape' | 'wallLandscape' | 'landscape' | 'wallGraffiti' | 'creep' | 'object' | 'metadata' | 'badge';

export interface DecorationTheme {
	id: string;
	name: string;
	color?: string;
	/** Hidden themes are not offered in the client's theme filter. */
	hidden?: boolean;
}

/**
 * Schema of one editable property. `default` seeds the value when the decoration is placed;
 * `readonly` properties are part of the placed state but are not offered in the editor.
 */
export interface DecorationProp {
	type: 'boolean' | 'color' | 'display' | 'range' | 'string';
	label?: string;
	readonly?: boolean;
	default?: boolean | number | string;
	/** `range` only. */
	min?: number;
	max?: number;
	step?: number;
}

/**
 * Constraints on the placement rectangle. Kept apart from `props` here because they are scalars,
 * not property descriptors; the two are merged again when a definition is sent to the client,
 * which expects both in one bag.
 */
export interface DecorationLayout {
	/** Keep the aspect ratio while resizing. */
	proportional?: boolean;
	minWidth?: number;
	maxWidth?: number;
	minHeight?: number;
	maxHeight?: number;
}

/**
 * One image of a decoration. `color`, `alpha` and `visible` hold the *name* of a property, not a
 * value — the placed state supplies the value, which is how one graphic serves every colour a
 * player picks.
 */
export interface DecorationGraphic {
	url: string;
	color?: string;
	alpha?: string;
	visible?: string;
}

export interface DecorationPreview {
	original?: string;
	'128x128'?: string;
	'256x256'?: string;
}

/**
 * A decoration as the catalog holds it. The asset-bearing fields — `graphics[].url`, `preview`,
 * `foregroundUrl`, `floorForegroundUrl`, `resources` — are authored in the pack as asset
 * references: a relative path fragment naming a bundled asset, or an external url taken as-is.
 * Loading rewrites them to the public urls they are served from. The field names are the client's
 * wire shape, which is why they say `url` in both lifetimes.
 */
export interface DecorationDefinition {
	id: string;
	type: DecorationType;
	name: string;
	theme: string;
	/** 1–5. Drives the colour of the client's rarity indicator. */
	rarity?: number;
	groupDescription?: string;
	props: Record<string, DecorationProp>;
	layout?: DecorationLayout;
	graphics?: DecorationGraphic[];
	preview?: DecorationPreview;
	/** Wall overlay texture, `wallLandscape` / `landscape` only. */
	foregroundUrl?: string;
	/** Floor overlay texture, `floorLandscape` / `landscape` only. */
	floorForegroundUrl?: string;
	/** Repeat the graphics as a tile instead of stretching them. */
	tiling?: boolean;
	tileScale?: number;
	/** Target object type, `object` and `metadata` only. */
	objectType?: string;
	/** Renderer resources the target object type draws from, keyed by alias. `metadata` only. */
	resources?: Record<string, string>;
	/** Renderer metadata replacing the target object type's own. `metadata` only. */
	metadata?: Record<string, unknown>;
	/** The symbol this decoration grants the account badge editor. `badge` only. */
	badge?: BadgeSymbol;
}

/**
 * A pack as authored: themes and decorations are keyed by their id rather than carrying one, and
 * the asset-bearing fields still hold references instead of public urls. {@link loadPack} turns
 * this into the resolved shapes the rest of the server consumes.
 */
export interface DecorationPack {
	/** Slug identifying the pack; appears in the public url of its assets. */
	name: string;
	themes: Record<string, Omit<DecorationTheme, 'id'>>;
	decorations: Record<string, Omit<DecorationDefinition, 'id'>>;
}

/** A file a pack ships. */
export interface PackFileAsset {
	kind: 'file';
	file: URL;
}

/** Content the catalog drew for a pack, e.g. a landscape preview. */
export interface GeneratedAsset {
	kind: 'generated';
	body: string;
}

/** Something the asset route serves. */
export type DecorationAsset = PackFileAsset | GeneratedAsset;

export interface Catalog {
	definitions: ReadonlyMap<string, DecorationDefinition>;
	themes: readonly DecorationTheme[];
	/** Assets the loaded packs reference, keyed by their public path under `/assets/decorations/`. */
	assets: ReadonlyMap<string, DecorationAsset>;
}

/**
 * A pack's `pack.yaml`, already read. Reading is kept out of {@link loadCatalog} so that validating
 * a pack needs nothing on disk; only the assets a pack references are resolved against `directory`.
 */
export interface PackSource {
	/** Directory relative asset references resolve against. */
	directory: URL;
	body: string;
}

const propSchema = {
	type: 'object',
	properties: {
		type: { enum: [ 'boolean', 'color', 'display', 'range', 'string' ] },
		label: { type: 'string' },
		readonly: { type: 'boolean' },
		default: { type: [ 'boolean', 'number', 'string' ] },
		min: { type: 'number' },
		max: { type: 'number' },
		step: { type: 'number' },
	},
	required: [ 'type' ],
	additionalProperties: false,
	// The client and the generated previews read colour defaults straight out as colours, so the
	// format is enforced here rather than wherever one of them trips over it.
	anyOf: [
		{ properties: { type: { const: 'color' }, default: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } } },
		{ properties: { type: { enum: [ 'boolean', 'display', 'range', 'string' ] } } },
	],
};

const packSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
		themes: {
			type: 'object',
			propertyNames: { minLength: 1 },
			additionalProperties: {
				type: 'object',
				properties: {
					name: { type: 'string', minLength: 1 },
					color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
					hidden: { type: 'boolean' },
				},
				required: [ 'name' ],
				additionalProperties: false,
			},
		},
		decorations: {
			type: 'object',
			propertyNames: { minLength: 1 },
			additionalProperties: {
				type: 'object',
				properties: {
					type: { enum: [ 'floorLandscape', 'wallLandscape', 'landscape', 'wallGraffiti', 'creep', 'object', 'metadata', 'badge' ] },
					name: { type: 'string', minLength: 1 },
					theme: { type: 'string', minLength: 1 },
					rarity: { type: 'integer', minimum: 1, maximum: 5 },
					groupDescription: { type: 'string' },
					props: { type: 'object', additionalProperties: propSchema },
					layout: {
						type: 'object',
						properties: {
							proportional: { type: 'boolean' },
							minWidth: { type: 'number' },
							maxWidth: { type: 'number' },
							minHeight: { type: 'number' },
							maxHeight: { type: 'number' },
						},
						additionalProperties: false,
					},
					graphics: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								url: { type: 'string', minLength: 1 },
								color: { type: 'string' },
								alpha: { type: 'string' },
								visible: { type: 'string' },
							},
							required: [ 'url' ],
							additionalProperties: false,
						},
					},
					preview: {
						type: 'object',
						properties: {
							original: { type: 'string' },
							'128x128': { type: 'string' },
							'256x256': { type: 'string' },
						},
						additionalProperties: false,
					},
					foregroundUrl: { type: 'string' },
					floorForegroundUrl: { type: 'string' },
					tiling: { type: 'boolean' },
					tileScale: { type: 'number' },
					objectType: { type: 'string' },
					resources: { type: 'object', additionalProperties: { type: 'string', minLength: 1 } },
					// Renderer metadata is the renderer's own vocabulary; there is nothing here to check.
					metadata: { type: 'object' },
					// Both halves of a symbol, even when the second draws nothing: the client hands the
					// pair back as it received it, and the badge it asks for has to be one the server
					// recognises. `path2` may be empty, which is how a one-colour symbol is spelled.
					badge: {
						type: 'object',
						properties: {
							path1: { type: 'string', minLength: 1 },
							path2: { type: 'string' },
						},
						required: [ 'path1', 'path2' ],
						additionalProperties: false,
					},
				},
				required: [ 'type', 'name', 'theme', 'props' ],
				additionalProperties: false,
			},
		},
	},
	required: [ 'name', 'themes', 'decorations' ],
	additionalProperties: false,
};

// `allowUnionTypes` for the property defaults, which are whatever the property's own type says.
const ajv = new Ajv({ allowUnionTypes: true });
const validatePack = ajv.compile<DecorationPack>(packSchema);

const contentTypes: Record<string, string> = {
	'.gif': 'image/gif',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
};

/** Content type of a pack asset, or `undefined` for file types packs may not reference. */
export function assetContentType(file: string) {
	return contentTypes[path.extname(file).toLowerCase()];
}

/**
 * Public url prefix of pack assets. Rooted at `/`, so it means the same thing whatever route the
 * client is showing. A document-relative url would not: a client routing through the path resolves
 * it against wherever it currently stands, and `/room/shard0/W1N1` turns an overlay texture into
 * `/room/shard0/assets/…`.
 *
 * That leaves the deployments where the backend is not at the root of the origin the client is
 * served from — another origin, or a proxy mounting it under a path prefix, as the steamless client
 * does with `/(http://host:21025)/`. Those set `backend.assetBaseUrl`, which is prepended verbatim
 * and so takes a path just as well as an origin.
 */
const assetUrlPrefix = `${config.backend.assetBaseUrl ?? ''}/assets/decorations`;

/**
 * Public url of an asset key. `version` busts the browser cache: the asset route serves every
 * response as immutable, so the url must change whenever the content can — the file's modification
 * time for files, a content hash for bodies generated at load.
 */
const publicAssetUrl = (key: string, version: string) => `${assetUrlPrefix}/${key}?v=${version}`;

/** Version token of an asset generated at load, derived from nothing but its content. */
const generatedVersion = (body: string) => createHash('sha1').update(body).digest('base64url').slice(0, 8);

/** The catalog-owned washes are static, so their public urls are minted once. */
const washUrls = new Map(washes.map(({ key, body }) => [ key, publicAssetUrl(key, generatedVersion(body)) ]));

/** Urls a pack may reference without shipping the file: other origins, and data urls. */
const isExternalUrl = (value: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value);

async function loadPack({ body, directory }: PackSource) {
	const raw: unknown = jsYaml.load(body);
	if (!validatePack(raw)) {
		throw new Error(`Invalid decoration pack '${directory.pathname}': ${ajv.errorsText(validatePack.errors)}`);
	}
	const pack = raw;
	const assets = new Map<string, DecorationAsset>();

	// Relative references name a file shipped beside the `pack.yaml`. They are checked here and
	// rewritten to the url the asset route serves them from.
	const resolveAsset = async (value: string) => {
		if (isExternalUrl(value)) {
			return value;
		}
		const file = new URL(value, directory);
		if (!file.href.startsWith(directory.href)) {
			throw new Error(`Asset '${value}' of decoration pack '${pack.name}' escapes the pack directory`);
		}
		if (assetContentType(file.pathname) === undefined) {
			throw new Error(`Asset '${value}' of decoration pack '${pack.name}' has an unsupported file type`);
		}
		const stats = await async function() {
			try {
				return await fs.stat(file);
			} catch (cause) {
				throw new Error(`Asset '${value}' of decoration pack '${pack.name}' does not exist`, { cause });
			}
		}();
		// koa-router decodes the route's captured param, so catalog keys live in decoded space — this
		// decode is what lets a filename needing percent-encoding match its own request.
		const key = `${pack.name}/${decodeURIComponent(makeRelativeFragment(directory, file).slice(2))}`;
		assets.set(key, { kind: 'file', file });
		return publicAssetUrl(key, Math.round(stats.mtimeMs).toString(36));
	};

	const resolveResources = async (resources: Record<string, string>) => Object.fromEntries(
		await Fn.mapAwait(Object.entries(resources), async ([ alias, url ]) => [ alias, await resolveAsset(url) ] as const));

	const resolvePreview = async (preview: DecorationPreview): Promise<DecorationPreview> => ({
		...preview.original !== undefined && { original: await resolveAsset(preview.original) },
		...preview['128x128'] !== undefined && { '128x128': await resolveAsset(preview['128x128']) },
		...preview['256x256'] !== undefined && { '256x256': await resolveAsset(preview['256x256']) },
	});

	const definitions = await Fn.mapAwait(Object.entries(pack.decorations), async ([ id, authored ]): Promise<DecorationDefinition> => {
		const definition = { id, ...authored };
		// A landscape carries no artwork, so its preview is drawn from its colours. The key sits
		// outside every pack's namespace: a file's key starts with the pack name, which the schema
		// constrains to `^[a-z0-9][a-z0-9-]*$`, so no pack can reference or shadow one of these.
		const preview = await async function() {
			if (definition.preview !== undefined) {
				return resolvePreview(definition.preview);
			}
			const drawing = renderPreview(definition);
			if (drawing === undefined) {
				return;
			}
			const key = `_preview/${pack.name}/${definition.id}.svg`;
			assets.set(key, { kind: 'generated', body: drawing });
			// One svg scales to every size the client asks for.
			const url = publicAssetUrl(key, generatedVersion(drawing));
			return { original: url, '128x128': url, '256x256': url };
		}();

		// Completed once every url is public, so the fallback foreground sits beside the resolved ones
		// rather than being resolved along with them — it belongs to no pack.
		return completeDefinition({
			...definition,
			...definition.foregroundUrl !== undefined && { foregroundUrl: await resolveAsset(definition.foregroundUrl) },
			...definition.floorForegroundUrl !== undefined && { floorForegroundUrl: await resolveAsset(definition.floorForegroundUrl) },
			...definition.resources !== undefined && { resources: await resolveResources(definition.resources) },
			...preview !== undefined && { preview },
			...definition.graphics !== undefined && {
				graphics: await Fn.mapAwait(definition.graphics, async graphic => ({ ...graphic, url: await resolveAsset(graphic.url) })),
			},
		}, key => washUrls.get(key) ?? function(): never {
			throw new Error(`Unknown catalog asset '${key}'`);
		}());
	});

	const themes = Object.entries(pack.themes).map(([ id, theme ]): DecorationTheme => ({ id, ...theme }));
	return { name: pack.name, themes, definitions, assets };
}

export async function loadCatalog(sources: Iterable<PackSource>): Promise<Catalog> {
	const definitions = new Map<string, DecorationDefinition>();
	const themes = new Map<string, DecorationTheme>();
	// The fallback foregrounds belong to the catalog rather than to a pack, so they are registered
	// here and unconditionally: a hundred bytes each, and every landscape without artwork of its own
	// points at one.
	const assets = new Map<string, DecorationAsset>(
		washes.map(({ key, body }) => [ key, { kind: 'generated', body } ]));
	const packNames = new Set<string>();

	for (const source of sources) {
		const pack = await loadPack(source);
		if (packNames.has(pack.name)) {
			throw new Error(`Duplicate decoration pack name '${pack.name}'`);
		}
		packNames.add(pack.name);
		// The object shape keeps a single pack from declaring an id twice; these checks guard
		// collisions across packs.
		for (const theme of pack.themes) {
			if (themes.has(theme.id)) {
				throw new Error(`Duplicate decoration theme '${theme.id}'`);
			}
			themes.set(theme.id, theme);
		}
		for (const definition of pack.definitions) {
			if (definitions.has(definition.id)) {
				throw new Error(`Duplicate decoration '${definition.id}'`);
			}
			definitions.set(definition.id, definition);
		}
		for (const [ key, file ] of pack.assets) {
			assets.set(key, file);
		}
	}

	// Themes may live in a different pack than the decorations using them, so this is checked once
	// everything is loaded.
	for (const definition of definitions.values()) {
		if (!themes.has(definition.theme)) {
			throw new Error(`Decoration '${definition.id}' belongs to unknown theme '${definition.theme}'`);
		}
	}

	return { definitions, themes: [ ...themes.values() ], assets };
}

const readPackSource = async (url: URL): Promise<PackSource> =>
	({ directory: new URL('.', url), body: await fs.readFile(url, 'utf8') });

/** A pack path from the config may point at a `pack.yaml` or at the directory holding one. */
async function resolvePackSource(value: string) {
	const url = pathToFileURL(path.resolve(value));
	const stat = await async function() {
		try {
			return await fs.stat(url);
		} catch (cause) {
			throw new Error(`Decoration pack '${value}' does not exist`, { cause });
		}
	}();
	return readPackSource(stat.isDirectory() ? new URL('pack.yaml', `${url.href}/`) : url);
}

const packSources = [
	// The bundled pack lives in the source tree — the build only carries TypeScript and JSON into
	// `dist`, so it is resolved through the package's export map rather than `import.meta.url`.
	...config.decorations?.builtin ?? true
		? [ await readPackSource(new URL(import.meta.resolve('xxscreeps/mods/meta/decorations/pack/pack.yaml'))) ]
		: [],
	...await Fn.mapAwait(config.decorations?.packs ?? [], resolvePackSource),
];

/** The catalog this server serves, loaded from the configured packs. */
export const catalog = await loadCatalog(packSources);

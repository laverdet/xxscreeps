import type { DecorationDefinition } from './catalog.js';
import type { PlacedDecoration } from './model.js';
import type { Placement, PropValue } from './placement.js';
import type { JSONSchemaType } from 'ajv';
import type { Database } from 'xxscreeps/engine/db/index.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import * as fs from 'node:fs/promises';
import makeEtag from 'etag';
import { hooks, makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { assetContentType, catalog } from './catalog.js';
import { activateBadge, activateCreep, activateInRoom, deactivate, getGlobalDecorationChannel, getRoomDecorationChannel, listDecoratedRooms, listForRoom, listForUser, listGlobal, ownedDefinition } from './model.js';
import { isOnWorldMap, isPlacedInRoom, parsePlacement } from './placement.js';

// `_id` is the official client's spelling, a Mongo-ism of the original server. It is wire shape and
// nothing else, so it lives in this file alone: stripped from what the client sends, put back on
// what it is served.

/**
 * A definition as the client wants it: the layout constraints sit inside `props`, next to the
 * property descriptors. They are kept apart internally because they are scalars, not descriptors.
 */
function toClientDefinition(definition: DecorationDefinition) {
	const { id, layout, props, ...rest } = definition;
	return { _id: id, ...rest, props: { ...layout, ...props } };
}

/**
 * The flat shape the client exchanges — the item id and the target sit alongside the property
 * values rather than beside them, which is the same shape the activate route reads back. A pack
 * property named `_id`, `shard` or `room` loses to them here; storage keeps them apart, so nothing
 * is actually dropped.
 *
 * `_id` has to travel *inside* this bag, not next to it: the room view flattens a placement into
 * one object and later matches socket updates against it by `_id`. Without one every update appends
 * the decoration again instead of recognising the copy it already has.
 */
export const placementToWire = (id: string, placement: Placement): Record<string, PropValue> => ({
	...placement.props,
	...placement.shard !== undefined && { shard: placement.shard },
	...placement.room !== undefined && { room: placement.room },
	_id: id,
});

hooks.register('route', {
	path: '/api/user/decorations/inventory',

	async execute(context) {
		const { userId } = context.state;
		if (userId === undefined) {
			return { ok: 1, list: [] };
		}
		const items = await listForUser(context.db, userId);
		return {
			ok: 1,
			list: items.map(item => ({
				_id: item.id,
				createdAt: new Date(item.createdAt).toISOString(),
				...item.activatedAt !== undefined && { activatedAt: new Date(item.activatedAt).toISOString() },
				// `null` is how the client spells "owned, not placed".
				active: item.active === undefined ? null : placementToWire(item.id, item.active),
				decoration: toClientDefinition(item.definition),
			})),
		};
	},
});

hooks.register('route', {
	path: '/api/user/decorations/themes',

	execute() {
		return { ok: 1, list: catalog.themes.map(({ id, ...rest }) => ({ _id: id, ...rest })) };
	},
});

interface ActivateRequest {
	_id: string;
	active: Record<string, unknown>;
}

const activateSchema: JSONSchemaType<ActivateRequest> = {
	type: 'object',
	properties: {
		_id: { type: 'string', minLength: 1 },
		// The property values are checked against the decoration's own schema, which ajv can't know.
		active: { type: 'object', required: [] },
	},
	required: [ '_id', 'active' ],
};

/**
 * The activation request, parsed apart and dispatched to whichever kind of placement the definition
 * calls for. The three kinds share nothing past this point: a room placement has a target to check,
 * a creep decoration lands in the global index, a badge in no shared index at all.
 */
export async function activate(db: Database, shard: Shard, userId: string, itemId: string, active: Record<string, unknown>) {
	const definition = await ownedDefinition(db, userId, itemId);
	if (definition === undefined) {
		return { error: 'not owned' };
	}
	// `_id` comes back with an edited placement; it names the item the request already identifies,
	// so it is dropped here rather than checked against the pack's properties.
	const { _id, ...rest } = active;
	const placement = parsePlacement(definition, rest);
	if ('error' in placement) {
		return placement;
	}
	if (isPlacedInRoom(definition.type)) {
		if (placement.shard !== shard.name) {
			return { error: 'unknown shard' };
		}
		return activateInRoom(db, shard, userId, itemId, definition, placement.room!, placement.props);
	} else if (definition.type === 'creep') {
		return activateCreep(db, userId, itemId, definition, placement.props);
	} else {
		return activateBadge(db, userId, itemId, placement.props);
	}
}

hooks.register('route', {
	path: '/api/user/decorations/activate',
	method: 'post',

	execute: makeValidatedPayloadRoute(activateSchema, async context => {
		const { userId } = context.state;
		if (userId === undefined) {
			return { error: 'not authenticated' };
		}
		const { _id, active } = context.request.body;
		return await activate(context.db, context.shard, userId, _id, active) ?? { ok: 1 };
	}),
});

interface DeactivateRequest {
	decorations: string[];
}

/** Well past what the client sends at once, and low enough that one request stays one batch of reads. */
const maxDeactivateCount = 256;

const deactivateSchema: JSONSchemaType<DeactivateRequest> = {
	type: 'object',
	properties: {
		decorations: { type: 'array', items: { type: 'string', minLength: 1 }, maxItems: maxDeactivateCount },
	},
	required: [ 'decorations' ],
};

hooks.register('route', {
	path: '/api/user/decorations/deactivate',
	method: 'post',

	execute: makeValidatedPayloadRoute(deactivateSchema, async context => {
		const { userId } = context.state;
		if (userId === undefined) {
			return { error: 'not authenticated' };
		}
		await deactivate(context.db, userId, context.request.body.decorations);
		return { ok: 1 };
	}),
});

// Pack assets: files a pack ships, plus the previews the catalog drew for its landscapes. Only what
// the catalog registered is servable — the request never names a path on disk, it names a key in
// that map, so there is nothing to sanitize.
interface CachedAsset {
	body: Buffer;
	etag: string;
	type: string;
}
const assetCache = new Map<string, CachedAsset>();

hooks.register('route', {
	path: '/assets/decorations/:asset(.*)',

	async execute(context) {
		const key = context.params.asset!;
		const asset = assetCache.get(key) ?? await async function() {
			const source = catalog.assets.get(key);
			if (source === undefined) {
				return;
			}
			const body = source.kind === 'file' ? await fs.readFile(source.file) : Buffer.from(source.body);
			const entry = {
				body,
				etag: makeEtag(body),
				type: assetContentType(key) ?? function(): never {
					throw new Error(`Decoration asset '${key}' has an unsupported file type`);
				}(),
			};
			assetCache.set(key, entry);
			return entry;
		}();
		if (asset === undefined) {
			return;
		}
		context.set('Cache-Control', 'public');
		context.set('ETag', asset.etag);
		context.set('Content-Type', asset.type);
		// These end up as WebGL textures, and the browser refuses to upload a cross-origin image it
		// was not allowed to read — pixi asks for one anonymously as soon as the url is not the
		// client's own origin, which is exactly what `assetBaseUrl` is for. Public files, no
		// credentials, nothing to scope the permission to.
		context.set('Access-Control-Allow-Origin', '*');
		context.body = asset.body;
		return true;
	},
});

/** An item as the room and map views report it: the placement plus who owns it. */
const toClientItem = (item: PlacedDecoration) => ({
	_id: item.id,
	user: item.userId,
	active: placementToWire(item.id, item.active),
	decoration: toClientDefinition(item.definition),
});

interface RoomDecorationsRequest {
	room: string;
	shard?: string;
}

const roomDecorationsSchema: JSONSchemaType<RoomDecorationsRequest> = {
	type: 'object',
	properties: {
		room: { type: 'string', minLength: 1 },
		shard: { type: 'string', nullable: true },
	},
	required: [ 'room' ],
};

hooks.register('route', {
	path: '/api/game/room-decorations',

	execute: makeValidatedQueryRoute(roomDecorationsSchema, async context => {
		const { room, shard } = context.request.query;
		const [ placed, global ] = await Promise.all([
			listForRoom(context.db, shard ?? context.shard.name, room),
			listGlobal(context.db),
		]);
		return { ok: 1, decorations: [ ...placed, ...global ].map(toClientItem) };
	}),
});

hooks.register('roomSocket', async (shard, userId, roomName) => {
	// Re-read only once something in the room changed. Creep decorations show up in every room, so
	// this watches their channel too.
	let stale = true;
	const markStale = () => { stale = true; };
	const [ unlistenRoom, unlistenGlobal ] = await Promise.all([
		getRoomDecorationChannel(shard.db, shard.name, roomName).listen(markStale),
		getGlobalDecorationChannel(shard.db).listen(markStale),
	]);

	return [
		() => {
			unlistenRoom();
			unlistenGlobal();
		},
		async () => {
			if (!stale) {
				return {};
			}
			stale = false;
			const [ placed, global ] = await Promise.all([
				listForRoom(shard.db, shard.name, roomName),
				listGlobal(shard.db),
			]);
			return { decorations: [ ...placed, ...global ].map(toClientItem) };
		},
	];
});

/** Whether any loaded decoration can stand in a room at all. A badge-only catalog leaves the map
 * with nothing to show, so the per-room index reads below are skipped outright. */
const hasRoomDecorations = Fn.some(catalog.definitions.values(), definition => isPlacedInRoom(definition.type));

// Creep decorations are deliberately absent: they belong to a creep rather than to a room, so there
// is no room for the map to draw them in.
hooks.register('mapStats', async (context, { rooms, response, userIds }) => {
	if (!hasRoomDecorations) {
		return;
	}
	// One read of the shard's zset tells which of the requested rooms hold anything — almost always
	// few to none — instead of asking after every room one by one.
	const decorated = await listDecoratedRooms(context.db, context.shard.name);
	const decorations: Record<string, unknown> = {};
	await Fn.mapAwait(Fn.filter(rooms, ({ room }) => decorated.has(room.name)), async ({ room, stats }) => {
		const items = await listForRoom(context.db, context.shard.name, room.name);
		// The map only shows what its owner published to it.
		const visible = items.filter(item => isOnWorldMap(item.active));
		if (visible.length === 0) {
			return;
		}
		stats.decorations = visible.map(item => {
			userIds.add(item.userId);
			// The client looks the definition up in the dictionary below rather than inline, so the
			// same decoration placed in fifty rooms is described once.
			decorations[item.definition.id] = mapDecoration(item.definition);
			return { _id: item.id, user: item.userId, decoration: item.definition.id, active: placementToWire(item.id, item.active) };
		});
	});
	if (Object.keys(decorations).length > 0) {
		response.decorations = decorations;
	}
});

/** The reduced shape the map renderer needs; it never draws the editable properties. */
const mapDecoration = (definition: DecorationDefinition) => ({
	type: definition.type,
	...definition.graphics !== undefined && { graphics: definition.graphics },
	...definition.tiling !== undefined && { tiling: definition.tiling },
	...definition.foregroundUrl !== undefined && { foregroundUrl: definition.foregroundUrl },
	...definition.floorForegroundUrl !== undefined && { floorForegroundUrl: definition.floorForegroundUrl },
});

// The client gates its inventory section on this flag, and builds the section's route and sidebar
// entry from the menu payload riding along with it.
hooks.register('version', serverData => {
	serverData.features.push({
		name: 'inventory',
		version: 1,
		menuData: [ {
			section: 0,
			after: 'World',
			item: { id: 'menu-item-inventory', label: 'Inventory', routerLink: '/inventory', svg: 'inventory' },
			module: 'InventoryModule',
		} ],
	});
});

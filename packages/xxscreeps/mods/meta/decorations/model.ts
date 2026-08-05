import type { DecorationDefinition } from './catalog.js';
import type { Placement, PlacementError, PropValue } from './placement.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import { config } from 'xxscreeps/config/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { hooks as badgeHooks } from 'xxscreeps/engine/db/user/badge.js';
import { hooks as userHooks } from 'xxscreeps/engine/db/user/index.js';
import { generateId } from 'xxscreeps/engine/schema/id.js';
import { mappedPrimitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import { makeRoomNameFromId, parseRoomNameToId } from 'xxscreeps/game/room/name.js';
import { isRoomControlled, isRoomReserved } from 'xxscreeps/mods/classic/controller/model.js';
import { catalog } from './catalog.js';
import { conflicts, decodeProps, encodeProps } from './placement.js';

// Who owns which decoration, and where they put it. Ownership is an account fact, not a shard fact,
// so it lives in the shared `db.data` store next to the other per-user records — `active.shard`
// says which shard a placement points at.
//
// With `decorations.grantAll` (the default) the whole catalog is owned by everybody and no grant is
// read from the store at all — the natural setup for a private server, where decorations are a
// customisation option rather than something to earn. Explicit grants are still written and kept;
// they take effect once `grantAll` is turned off. Placements are stored either way.
//
// A placement made while `grantAll` is on has no stored grant behind it. Turning the flag off
// strands it — invisible everywhere, unreachable from the client — until `xxscreeps manage
// decoration cleanup` takes it down again; see {@link deactivateStranded}.

/** set: ids of the inventory items `userId` was granted. */
const inventoryKey = (userId: string) => `user/${userId}/decorations`;
/** hash: `{ def, createdAt }` of one granted item. Item ids come from clients and, under `grantAll`,
 * from packs, so item keys get a segment of their own — an id like `active` must not be able to land
 * on one of the sets below. */
const itemKey = (userId: string, itemId: string) => `user/${userId}/decorations/item/${itemId}`;
/** hash: `{ activatedAt, shard, prop/… }` of one placed item. Absent when it is not placed. Which
 * room it stands in is not repeated here — that is the zset's answer. */
const activeKey = (userId: string, itemId: string) => `user/${userId}/decorations/item/${itemId}/active`;
/** set: ids `userId` has placed. Saves asking after every item they own, which under `grantAll` is
 * the whole catalog. */
const activeIndexKey = (userId: string) => `user/${userId}/decorations/active`;
/** zset: everything placed in a room of one shard — score the room's id, member `userId/itemId`.
 * One structure answers both directions: a range at a room's score is what stands there, a member's
 * score is where it stands. */
const shardIndexKey = (shardName: string) => `decorations/${shardName}`;
/** set: `userId/itemId` of the creep decorations, which follow their owner instead of a room. */
const globalIndexKey = 'decorations/global';

export const grantAll = () => config.decorations?.grantAll ?? true;

/**
 * Announces that what is placed in a room changed, so open room sockets re-read it. Creep
 * decorations show up in every room, so they get their own channel that all of them watch.
 */
const decorationChannel = (db: Database, name: string) => new Channel<DecorationUpdate>(db.pubsub, name);
const roomChannelName = (shardName: string, room: string) => `decorations/${shardName}/${room}`;
export const getRoomDecorationChannel = (db: Database, shardName: string, room: string) =>
	decorationChannel(db, roomChannelName(shardName, room));
export const getGlobalDecorationChannel = (db: Database) => decorationChannel(db, globalIndexKey);

export interface DecorationUpdate {
	type: 'updated';
}

/** One decoration a user owns, resolved against the catalog. */
export interface OwnedDecoration {
	id: string;
	definition: DecorationDefinition;
	/**
	 * Epoch milliseconds the item was granted. Every inventory item carries one, because the client
	 * sorts by it — the implicit ownership `grantAll` hands out has no moment of acquisition to
	 * report, so it reports the epoch and the whole catalog ties.
	 */
	createdAt: number;
	/** Where it is placed, or absent while it sits unplaced in the inventory. */
	active?: Placement;
	/** Epoch milliseconds it was placed. */
	activatedAt?: number;
}

const indexMember = (userId: string, itemId: string) => `${userId}/${itemId}`;

/** Ids never contain a slash, so the first one separates the two halves. */
function parseIndexMember(member: string) {
	const slash = member.indexOf('/');
	return { userId: member.slice(0, slash), itemId: member.slice(slash + 1) };
}

/**
 * The placement of one item, or `undefined` when it is not placed. The room it stands in — if it
 * stands in one at all — is the zset's answer, not the hash's.
 */
async function loadPlacement(db: Database, userId: string, itemId: string, definition: DecorationDefinition) {
	const fields = await db.data.hGetAll(activeKey(userId, itemId));
	if (fields.activatedAt === undefined) {
		return;
	}
	const room = await async function() {
		if (fields.shard === undefined) {
			return;
		}
		const score = await db.data.zScore(shardIndexKey(fields.shard), indexMember(userId, itemId));
		return score === null ? undefined : makeRoomNameFromId(score);
	}();
	const placement: Placement = {
		...fields.shard !== undefined && { shard: fields.shard },
		...room !== undefined && { room },
		props: decodeProps(definition, fields),
	};
	return { placement, activatedAt: Number(fields.activatedAt) };
}

/**
 * The definition behind an item `userId` owns, or `undefined` when they do not own it.
 *
 * Under `grantAll` an item has no stored grant, so the id names the decoration directly — which is
 * exactly what {@link listForUser} hands the client in that mode.
 */
export async function ownedDefinition(db: Database, userId: string, itemId: string) {
	const def = await db.data.hGet(itemKey(userId, itemId), 'def');
	if (def !== null) {
		return catalog.definitions.get(def);
	}
	return grantAll() ? catalog.definitions.get(itemId) : undefined;
}

/**
 * Everything `userId` owns.
 *
 * A stored item whose definition is gone — its pack was unloaded — is left in the store but kept
 * out of the listing; the grant becomes visible again once the pack is back.
 */
async function loadOwned(db: Database, userId: string): Promise<OwnedDecoration[]> {
	if (grantAll()) {
		// Implicit ownership has no record to carry an id, so the decoration's own id names the item.
		// That keeps the id stable across restarts, which is what the client needs to place and
		// remove one. Nor is there a moment it was acquired, so every item reports the epoch and the
		// catalog ties — a sort by age leaves it in the order the server listed it.
		return [ ...Fn.map(catalog.definitions.values(), definition => ({ id: definition.id, definition, createdAt: 0 })) ];
	}
	const ids = await db.data.sMembers(inventoryKey(userId));
	const items = await Fn.mapAwait(ids, async (id): Promise<OwnedDecoration | undefined> => {
		const fields = await db.data.hGetAll(itemKey(userId, id));
		const definition = catalog.definitions.get(fields.def!);
		if (definition === undefined) {
			console.warn(`User ${userId} owns decoration '${fields.def}', which no loaded pack defines`);
			return;
		}
		return { id, definition, createdAt: Number(fields.createdAt) };
	});
	return [ ...Fn.filter(items) ];
}

export async function listForUser(db: Database, userId: string): Promise<OwnedDecoration[]> {
	const [ owned, placed ] = await Promise.all([
		loadOwned(db, userId),
		db.data.sMembers(activeIndexKey(userId)),
	]);
	const placedIds = new Set(placed);
	return Fn.mapAwait(owned, async (item): Promise<OwnedDecoration> => {
		if (!placedIds.has(item.id)) {
			return item;
		}
		const placed = await loadPlacement(db, userId, item.id, item.definition);
		return { ...item, ...placed !== undefined && { active: placed.placement, activatedAt: placed.activatedAt } };
	});
}

/** One decoration standing in a room, as the room and map views report it. */
export interface PlacedDecoration {
	id: string;
	userId: string;
	definition: DecorationDefinition;
	active: Placement;
	activatedAt: number;
}

/** The members of one placement index, resolved against the catalog. The caller says where the
 * index put them — a room, or nowhere for the global one — since the hash does not repeat it. */
async function resolveIndexMembers(db: Database, members: string[], target: { shard?: string; room?: string }): Promise<PlacedDecoration[]> {
	const items = await Fn.mapAwait(members, async member => {
		const { userId, itemId } = parseIndexMember(member);
		const [ definition, fields ] = await Promise.all([
			ownedDefinition(db, userId, itemId),
			db.data.hGetAll(activeKey(userId, itemId)),
		]);
		if (definition === undefined || fields.activatedAt === undefined) {
			return;
		}
		const active: Placement = { ...target, props: decodeProps(definition, fields) };
		return { id: itemId, userId, definition, active, activatedAt: Number(fields.activatedAt) };
	});
	return [ ...Fn.filter(items) ];
}

/** Everything placed in one room, across all users. */
export async function listForRoom(db: Database, shardName: string, room: string): Promise<PlacedDecoration[]> {
	const roomId = parseRoomNameToId(room);
	const members = await db.data.zRange(shardIndexKey(shardName), roomId, roomId, { by: 'SCORE' });
	return resolveIndexMembers(db, members, { shard: shardName, room });
}

/**
 * The creep decorations, which follow their owner instead of a room and so show up in every one of
 * them. They are the same set no matter which room is being viewed, which is why a caller reading
 * many rooms — the world map — asks for them once rather than per room.
 */
export const listGlobal = async (db: Database) =>
	resolveIndexMembers(db, await db.data.sMembers(globalIndexKey), {});

/**
 * The rooms of `shardName` with something standing in them, off one read of the zset — which is
 * what lets the world map skip almost every room it is asked about. A member still owes a
 * {@link listForRoom} read for what exactly stands there.
 */
export const listDecoratedRooms = async (db: Database, shardName: string) =>
	new Set(Fn.map(await db.data.zRangeWithScores(shardIndexKey(shardName), 0, -1), ([ score ]) => makeRoomNameFromId(score)));

/** Give `userId` a decoration from the catalog. Returns the id of the new inventory item. */
export async function grant(db: Database, userId: string, definitionId: string) {
	if (!catalog.definitions.has(definitionId)) {
		throw new Error(`No such decoration: ${definitionId}`);
	}
	const id = generateId(12);
	await Promise.all([
		db.data.sAdd(inventoryKey(userId), [ id ]),
		db.data.hmSet(itemKey(userId, id), { def: definitionId, createdAt: Date.now() }),
	]);
	return id;
}

/**
 * Take an inventory item away again. Returns false if the user didn't have it — which is the answer
 * for every id under `grantAll`, whose ownership has no grant to take away. Ownership goes first so
 * that a `false` leaves the placement where it was rather than half-revoking an item the caller is
 * about to be told they never held.
 */
export async function revoke(db: Database, userId: string, itemId: string) {
	const [ removed ] = await Promise.all([
		db.data.sRem(inventoryKey(userId), [ itemId ]),
		db.data.del(itemKey(userId, itemId)),
	]);
	if (removed === 0) {
		return false;
	}
	await deactivate(db, userId, [ itemId ]);
	return true;
}

/** Whether `userId` holds or reserves `room`, which placing something there requires. */
async function controlsRoom(shard: Shard, userId: string, room: string) {
	const [ controlled, reserved ] = await Promise.all([
		isRoomControlled(shard, userId, room),
		isRoomReserved(shard, userId, room),
	]);
	return controlled || reserved;
}

/** The hash write and the per-user index entry every activation makes, whatever index it lands in. */
const writePlacement = (db: Database, userId: string, itemId: string, props: Record<string, PropValue>, fields: Record<string, string>) =>
	Promise.all([
		db.data.hmSet(activeKey(userId, itemId), { activatedAt: Date.now(), ...fields, ...encodeProps(props) }),
		db.data.sAdd(activeIndexKey(userId), [ itemId ]),
	]);

/**
 * Take down whatever `userId` placed in one index that argues with itself, settled in itemId order:
 * the first of a conflicting pair stays. Run after the write, because the pre-check races — two
 * activations can both find the index clear and land conflicting decorations. Every racer reads the
 * same index and settles it the same way, so however the writes interleaved they converge on one
 * survivor.
 */
async function settleConflicts(db: Database, userId: string, items: PlacedDecoration[]) {
	const mine = items.filter(item => item.userId === userId).sort(mappedPrimitiveComparator(item => item.id));
	const kept: PlacedDecoration[] = [];
	const losers = [ ...Fn.transform(mine, function*(item) {
		if (kept.some(winner => conflicts(winner.definition, item.definition))) {
			yield item.id;
		} else {
			kept.push(item);
		}
	}) ];
	await deactivate(db, userId, losers);
}

/** Whether another of `userId`'s placements argues with placing `definition` as `itemId`. */
const blocked = (items: PlacedDecoration[], userId: string, itemId: string, definition: DecorationDefinition) =>
	items.some(other => other.userId === userId && other.id !== itemId && conflicts(definition, other.definition));

/**
 * Place an item in a room, replacing wherever it sat before. The client relies on the replacement:
 * it moves a decoration by activating it again at the new spot. The caller resolved `definition`
 * against the user's inventory already; property values arrive parsed.
 */
export async function activateInRoom(
	db: Database, shard: Shard, userId: string, itemId: string, definition: DecorationDefinition,
	room: string, props: Record<string, PropValue>,
): Promise<PlacementError | undefined> {
	if (!await shard.data.sIsMember('rooms', room)) {
		return { error: 'unknown room' };
	} else if ((config.decorations?.requireRoomOwnership ?? true) && !await controlsRoom(shard, userId, room)) {
		return { error: 'room not controlled' };
	} else if (blocked(await listForRoom(db, shard.name, room), userId, itemId, definition)) {
		return { error: 'already decorated' };
	}
	// Moving an item out of its old room has to happen before the new placement is indexed,
	// otherwise a move within one room would drop the entry it just wrote.
	await deactivate(db, userId, [ itemId ]);
	await Promise.all([
		writePlacement(db, userId, itemId, props, { shard: shard.name }),
		db.data.zAdd(shardIndexKey(shard.name), [ [ parseRoomNameToId(room), indexMember(userId, itemId) ] ]),
		announce(db, roomChannelName(shard.name, room)),
	]);
	await settleConflicts(db, userId, await listForRoom(db, shard.name, room));
	return undefined;
}

/**
 * Place a creep decoration, which follows its owner rather than standing in a room and so lands in
 * the one index every room view reads alongside its own.
 */
export async function activateCreep(
	db: Database, userId: string, itemId: string, definition: DecorationDefinition, props: Record<string, PropValue>,
): Promise<PlacementError | undefined> {
	if (blocked(await listGlobal(db), userId, itemId, definition)) {
		return { error: 'already decorated' };
	}
	await deactivate(db, userId, [ itemId ]);
	await Promise.all([
		writePlacement(db, userId, itemId, props, {}),
		db.data.sAdd(globalIndexKey, [ indexMember(userId, itemId) ]),
		announce(db, globalIndexKey),
	]);
	await settleConflicts(db, userId, await listGlobal(db));
	return undefined;
}

/**
 * Wear a badge decoration. It is in no shared index and announces nothing: it is worn rather than
 * placed, nobody but its owner ever asks after one, and the per-user index already knows it was
 * activated. Nor does anything conflict — the badge editor lists every worn symbol and they take
 * turns rather than compete.
 */
export async function activateBadge(
	db: Database, userId: string, itemId: string, props: Record<string, PropValue>,
): Promise<PlacementError | undefined> {
	await deactivate(db, userId, [ itemId ]);
	await writePlacement(db, userId, itemId, props, {});
	return undefined;
}

/**
 * Tell open room sockets to re-read. Fired alongside the write, since reads are not synchronized.
 */
const announce = (db: Database, channel: string) => decorationChannel(db, channel).publish({ type: 'updated' });

/**
 * Take items off the map. Unknown or already-unplaced ids are left alone. Which index held an item
 * is asked of the indices themselves — the zset of the hash's shard, or the global set — rather
 * than remembered anywhere: a revoked item has already lost its definition by the time it gets
 * here, and the data structures answer without one.
 */
export async function deactivate(db: Database, userId: string, itemIds: Iterable<string>) {
	await Fn.mapAwait(itemIds, async itemId => {
		const fields = await db.data.hGetAll(activeKey(userId, itemId));
		if (fields.activatedAt === undefined) {
			return;
		}
		const member = indexMember(userId, itemId);
		const channel = await async function() {
			if (fields.shard !== undefined) {
				const score = await db.data.zScore(shardIndexKey(fields.shard), member);
				await db.data.zRem(shardIndexKey(fields.shard), [ member ]);
				return score === null ? undefined : roomChannelName(fields.shard, makeRoomNameFromId(score));
			}
			return await db.data.sRem(globalIndexKey, [ member ]) > 0 ? globalIndexKey : undefined;
		}();
		await Promise.all([
			db.data.del(activeKey(userId, itemId)),
			db.data.sRem(activeIndexKey(userId), [ itemId ]),
			channel === undefined ? undefined : announce(db, channel),
		]);
	});
}

/**
 * Deactivate the placements standing without ownership behind them: made while `grantAll` was on —
 * keyed by decoration id, no stored grant — and stranded when the flag went off. A placement whose
 * stored grant merely lost its pack is left alone; it comes back with the pack. Returns the ids
 * taken down.
 */
export async function deactivateStranded(db: Database, userId: string) {
	if (grantAll()) {
		return [];
	}
	const placed = await db.data.sMembers(activeIndexKey(userId));
	const stranded = [ ...Fn.filter(await Fn.mapAwait(placed, async itemId =>
		await db.data.hGet(itemKey(userId, itemId), 'def') === null ? itemId : undefined), nonNullPredicate) ];
	await deactivate(db, userId, stranded);
	return stranded;
}

async function removeAllForUser(db: Database, userId: string) {
	const [ ids, placed ] = await Promise.all([
		db.data.sMembers(inventoryKey(userId)),
		db.data.sMembers(activeIndexKey(userId)),
	]);
	// Implicit grants have no inventory entry, so placements are tracked separately from ownership.
	await deactivate(db, userId, placed);
	await Promise.all([
		db.data.del(inventoryKey(userId)),
		db.data.del(activeIndexKey(userId)),
		...Fn.map(ids, id => db.data.del(itemKey(userId, id))),
	]);
}

// Tear down a removed user's decorations as part of `User.remove`.
userHooks.register('remove', removeAllForUser);

// The symbols a user's badge decorations grant them. The account badge editor offers these beside
// the numbered shapes, and a badge naming one is only stored if it shows up here — so a symbol stops
// being wearable the moment its decoration is deactivated, though a badge already saved from it
// stays as it was.
badgeHooks.register('symbols', async (db, userId) => {
	const items = await listForUser(db, userId);
	return [ ...Fn.transform(items, function*(item) {
		// Only a badge decoration carries a symbol, which the catalog checks when it loads a pack.
		if (item.active !== undefined && item.definition.badge !== undefined) {
			yield item.definition.badge;
		}
	}) ];
});

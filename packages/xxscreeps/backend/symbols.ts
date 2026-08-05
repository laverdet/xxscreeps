import type { SubscriptionEndpoint } from './socket.js';
import type Koa from 'koa';
import type Router from 'koa-router';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types.js';
import type { Context, State } from 'xxscreeps:backend';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const MapRender = Symbol('mapRender');
export const Render = Symbol('render');
export const TerrainRender = Symbol('terrainRender');

// A loaded room paired with the per-room response entry `mapStats` hooks decorate
export interface MapStatsRoom {
	room: Room;
	stats: Record<string, unknown>;
}

// `/api/game/map-stats` payload handed to `mapStats` hooks, which decorate it in place
export interface MapStatsPayload {
	/** The stat layer the client requested, e.g. `minerals0` */
	statName?: string;
	/** Loaded rooms paired with their per-room response entry */
	rooms: MapStatsRoom[];
	/** Extra top-level response fields, e.g. `statsMax` */
	response: Record<string, unknown>;
	/** Users referenced by the response; the endpoint resolves them into its `users` index */
	userIds: Set<string>;
}

/**
 * A menu entry a feature contributes to the client's sidebar. The official client ships an empty
 * router configuration and a sidebar holding only the built-in links; everything else is injected
 * from here at connect time, which is why the route's client module rides along with the entry.
 */
export interface ClientMenuEntry {
	/** Index of the sidebar section receiving the entry. */
	section: number;
	/** Position inside the section. Ignored when `after` names an entry. */
	start?: number;
	/** Label of the entry to insert after. */
	after?: string;
	/** Entries to replace at the insertion point. */
	deleteCount?: number;
	item: Record<string, unknown>;
	/** Lazily-loaded client module owning the entry's route, e.g. `InventoryModule`. */
	module?: string;
}

/** One entry of `serverData.features`, the flags a client uses to decide which sections to show. */
export interface ServerFeature {
	name: string;
	version: number;
	menuData?: ClientMenuEntry[];
}

/** The `serverData` bag of `/api/version`, which `version` hooks amend. */
export interface ServerData extends Record<string, unknown> {
	features: ServerFeature[];
}

export const hooks = makeHookRegistration<{
	backendReady: (db: Database, shard: Shard) => void;
	mapStats: (context: Context, payload: MapStatsPayload) => MaybePromise<void>;
	middleware: (koa: Koa<State, Context>, router: Router<State, Context>) => void;
	roomSocket: (shard: Shard, userId: string | undefined, roomName: string) =>
		AsyncEffectAndResult<((time: number) => MaybePromise<object>) | undefined>;
	sendUserInfo: (db: Database, userId: string, userInfo: Record<string, unknown>, privateSelf: boolean) => Promise<void>;
	version: (serverData: ServerData) => void;
	route: Endpoint;
	subscription: SubscriptionEndpoint;
}>();

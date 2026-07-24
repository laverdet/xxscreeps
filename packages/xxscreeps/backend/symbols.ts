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

export const hooks = makeHookRegistration<{
	backendReady: (db: Database, shard: Shard) => void;
	mapStats: (context: Context, payload: MapStatsPayload) => MaybePromise<void>;
	middleware: (koa: Koa<State, Context>, router: Router<State, Context>) => void;
	roomSocket: (shard: Shard, userId: string | undefined, roomName: string) =>
		AsyncEffectAndResult<((time: number) => MaybePromise<object>) | undefined>;
	sendUserInfo: (db: Database, userId: string, userInfo: Record<string, unknown>, privateSelf: boolean) => Promise<void>;
	version: (serverData: Record<string, unknown>) => void;
	route: Endpoint;
	subscription: SubscriptionEndpoint;
}>();

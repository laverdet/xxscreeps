import type Koa from 'koa';
import type Router from 'koa-router';
import type { Context, Endpoint, State } from 'xxscreeps/backend/index.js';
import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import type { SubscriptionEndpoint } from './socket.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';
export const MapRender = Symbol('mapRender');
export const Render = Symbol('render');
export const TerrainRender = Symbol('terrainRender');

export const hooks = makeHookRegistration<{
	middleware: (koa: Koa<State, Context>, router: Router<State, Context>) => void;
	roomSocket: (shard: Shard, userId: string | undefined, roomName: string) =>
	AsyncEffectAndResult<((time: number) => MaybePromise<{}>) | undefined>;
	sendUserInfo: (db: Database, userId: string, userInfo: any, privateSelf: boolean) => Promise<void>;
	route: Endpoint;
	subscription: SubscriptionEndpoint;
}>();

import type Koa from 'koa';
import type Router from 'koa-router';
import type { Context, Endpoint, State } from 'xxscreeps/backend';
import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types';
import type { Shard } from 'xxscreeps/engine/db';
export const MapRender = Symbol('mapRender');
export const Render = Symbol('render');
export const TerrainRender = Symbol('terrainRender');
export const middleware: ((koa: Koa<State, Context>, router: Router<State, Context>) => void)[] = [];
export const routes: Endpoint[] = [];

type RoomSocketHandler = (shard: Shard, userId: string | undefined, roomName: string) =>
	AsyncEffectAndResult<((time: number) => MaybePromise<{}>) | undefined>;
export const roomSocketHandlers: RoomSocketHandler[] = [];
export function registerRoomSocketHandler(handler: RoomSocketHandler) {
	roomSocketHandlers.push(handler);
}

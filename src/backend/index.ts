import type Koa from 'koa';
import type Router from 'koa-router';
import type { Database } from 'xxscreeps/engine/database';
import type { Implementation } from 'xxscreeps/utility/types';
import type { RoomObject } from 'xxscreeps/game/object';
import type { Shard } from 'xxscreeps/engine/shard';
import type { BackendContext } from './context';
import { MapRender, Render, TerrainRender, middleware, routes } from './symbols';
export { registerRoomSocketHandler } from './symbols';

// Koa middleware & generic backend route types
export interface Context {
	backend: BackendContext;
	db: Database;
	shard: Shard;
}
export interface State {}
export type Method = 'delete' | 'get' | 'post' | 'put';
export type Middleware = Koa.Middleware<State, Context>;

export type Endpoint = {
	path: string;
	method?: Method;

	execute(context: Router.RouterContext<State, Context>): any;
};

// `RoomObject` render symbols
type RenderedRoomObject = {
	_id: string;
	type: string;
	x: number;
	y: number;
};
declare module 'xxscreeps/game/object' {
	interface RoomObject {
		[Render]: (previousTime?: number) => RenderedRoomObject | undefined;
		[MapRender]: (object: any) => string | undefined;
		[TerrainRender]: (object: any) => number | undefined;
	}
}

export function registerBackendMiddleware(fn: (koa: Koa<State, Context>, router: Router<State, Context>) => void) {
	middleware.push(fn);
}

export function registerBackendRoute(endpoint: Endpoint) {
	routes.push(endpoint);
}

// Backend render hooks
export function bindRenderer<Type extends RoomObject>(
	object: Implementation<Type>,
	render: (object: Type, next: () => RenderedRoomObject, ...rest: Parameters<RoomObject[typeof Render]>) => RenderedRoomObject | undefined,
) {
	const { prototype } = object;
	const parent = Object.getPrototypeOf(prototype);
	prototype[Render] = function(...rest) {
		return render(this, () => parent[Render].call(this, ...rest), ...rest);
	};
}

export function bindMapRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => string | undefined) {
	object.prototype[MapRender] = render;
}

export function bindTerrainRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => number | undefined) {
	object.prototype[TerrainRender] = render;
}

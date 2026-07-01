import type { BackendContext } from './context.js';
import type { JSONSchemaType } from 'ajv';
import type Koa from 'koa';
import type { RouterContext } from 'koa-router';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Implementation } from 'xxscreeps/utility/types.js';
import { Ajv } from 'ajv';
import { MapRender, Render, TerrainRender } from './symbols.js';

export { hooks } from './symbols.js';

// Koa middleware & generic backend route types
export interface Context {
	backend: BackendContext;
	db: Database;
	shard: Shard;
	request: RequestType;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface State {}
export type Method = 'delete' | 'get' | 'post' | 'put';
export type Middleware = Koa.Middleware<State, Context>;

type ExecuteRoute<RouteContext = Context> = (context: RouterContext<State, RouteContext>) => unknown;
type ValidatedExecuteRoute<Request extends RequestType> = ExecuteRoute<ValidatedRequestContext<Request>>;

// Endpoint middleware shape
interface RequestType {
	body?: unknown;
	query?: unknown;
}

interface ValidatedQueryRequest<Query> extends RequestType {
	body?: unknown;
	query: Query;
}

interface ValidatedPayloadRequest<Body> extends RequestType {
	body: Body;
	query?: unknown;
}

interface ValidatedRequestContext<Request extends RequestType> extends Context {
	request: Request;
}

export interface Endpoint {
	path: string;
	method?: Method;
	execute: ExecuteRoute;
}

// `RoomObject` render symbols
type RenderedRoomObject = {
	_id: string;
	type: string;
	x: number;
	y: number;
};
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		[Render]: (previousTime?: number) => RenderedRoomObject | undefined;
		[MapRender]: (object: any) => string | undefined;
		[TerrainRender]: (object: any) => number | undefined;
	}
}

// Note: `ajv` doesn't properly support `undefined`....
// https://github.com/ajv-validator/ajv/issues/2040
const ajv = new Ajv();
// Separate instance for routes that opt into `coerceTypes` (e.g. the official client sends numeric
// fields as strings). `coerceTypes` is an Ajv constructor option, so it can't be set per-schema.
const coercingAjv = new Ajv({ coerceTypes: true });

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

export function makeValidatedPayloadRoute<Body>(
	schema: JSONSchemaType<Body>,
	execute: ValidatedExecuteRoute<ValidatedPayloadRequest<Body>>,
	options?: { coerceTypes?: boolean },
): ExecuteRoute {
	// When `coerceTypes` is set the compiled validator mutates the body in place (e.g. "180" → 180),
	// so `execute` sees the coerced values.
	const validate = (options?.coerceTypes ? coercingAjv : ajv).compile(schema);
	return context => {
		if (validate(context.request.body)) {
			return execute(context as RouterContext<State, ValidatedRequestContext<ValidatedPayloadRequest<Body>>>);
		} else {
			return { error: 'invalid' };
		}
	};
}

export function makeValidatedQueryRoute<Query>(
	schema: JSONSchemaType<Query>,
	execute: ValidatedExecuteRoute<ValidatedQueryRequest<Query>>,
): ExecuteRoute {
	const validate = ajv.compile(schema);
	return context => {
		if (validate(context.request.query)) {
			return execute(context as RouterContext<State, ValidatedRequestContext<ValidatedQueryRequest<Query>>>);
		} else {
			return { error: 'invalid' };
		}
	};
}

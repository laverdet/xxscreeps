import type { BackendContext } from './context.js';
import type Koa from 'koa';
import type Router from 'koa-router';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';

export { hooks } from './symbols.js';

// Koa middleware & generic backend route types

/// <reference path="./auth/index.ts" />
export interface Context {
	backend: BackendContext;
	db: Database;
	request: {
		body: any;
	};
	shard: Shard;
}
export interface State {}
export type Method = 'delete' | 'get' | 'post' | 'put';
export type Middleware = Koa.Middleware<State, Context>;

export type Endpoint = {
	path: string;
	method?: Method;

	execute: (context: Router.RouterContext<State, Context>) => any;
};

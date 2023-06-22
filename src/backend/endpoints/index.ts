import type Koa from 'koa';
import type Router from 'koa-router';
import type { Context, State } from 'xxscreeps/backend/index.js';

import { VersionEndpoint } from './version.js';
import gameEndpoints from './game/index.js';
import registrationEndpoints from './register.js';
import userEndpoints from './user/index.js';
import { hooks } from 'xxscreeps/backend/index.js';

import './assets/terrain.js';

export function installEndpointHandlers(koa: Koa<State, Context>, router: Router<State, Context>) {
	const endpoints = [
		VersionEndpoint,
		...gameEndpoints,
		...registrationEndpoints,
		...userEndpoints,
		...hooks.map('route'),
	];
	for (const endpoint of endpoints) {
		router[endpoint.method ?? 'get'](endpoint.path, async(context, next) => {
			const value = await endpoint.execute(context);
			if (value === undefined) {
				return next();
			} else if (value !== true) {
				context.body = value;
			}
		});
	}
}

import type Koa from 'koa';
import type Router from 'koa-router';
import type { Context, State } from 'xxscreeps/backend';

import { VersionEndpoint } from './version';
import gameEndpoints from './game';
import registrationEndpoints from './register';
import userEndpoints from './user';
import { hooks } from 'xxscreeps/backend';

import './assets/terrain';

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

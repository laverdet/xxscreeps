import type Koa from 'koa';
import type Router from 'koa-router';
import type { Context, State } from 'xxscreeps/backend';

import { VersionEndpoint } from './version';
import { TerrainEndpoint, TerrainZoomEndpoint } from './assets/terrain';
import gameEndpoints from './game';
import registrationEndpoints from './register';
import userEndpoints from './user';
import { routes } from '../symbols';

export function installEndpointHandlers(koa: Koa<State, Context>, router: Router<State, Context>) {
	const endpoints = [
		VersionEndpoint,
		TerrainEndpoint, TerrainZoomEndpoint,
		...gameEndpoints,
		...registrationEndpoints,
		...userEndpoints,
		...routes,
	];
	for (const endpoint of endpoints) {
		router[endpoint.method ?? 'get'](endpoint.path, async(context, next) => {
			const value = await endpoint.execute(context);
			if (value === undefined) {
				return next();
			} else if (value !== true) {
				context.set('Content-Type', 'text/json');
				context.status = 200;
				context.body = value;
			}
		});
	}
}

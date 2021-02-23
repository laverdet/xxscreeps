import { Express, Router } from 'express';
import { useAuth, useToken } from '../auth';
import { BackendContext } from '../context';
import { AbstractResponse, Endpoint } from '../endpoint';

import { VersionEndpoint } from './version';

import { TerrainEndpoint, TerrainZoomEndpoint } from './assets/terrain';

import { MeEndpoint } from './auth/me';
import { SteamTicketEndpoint } from './auth/steam-ticket';

import gameEndpoints from './game';
import registrationEndpoints from './register';
import userEndpoints from './user';

function bindRoutes(context: BackendContext, router: Router, endpoints: Endpoint[]) {
	for (const endpoint of endpoints) {
		router[endpoint.method ?? 'get'](endpoint.path, (req, res, next) => {
			req.locals = res.locals;
			Promise.resolve(endpoint.execute.call({ context }, req, res)).then(value => {
				if (value === undefined) {
					next();
				} else if (value instanceof AbstractResponse) {
					value.send(res);
				} else if (value !== true) {
					res.set('Content-Type', 'text/json');
					res.writeHead(200);
					res.end(JSON.stringify(value));
				}
			}, err => {
				console.error('Unhandled error', err);
				res.writeHead(500);
				res.end();
			});
		});
	}
	return router;
}

export function installEndpointHandlers(express: Express, context: BackendContext) {
	const apiRouter = Router();
	bindRoutes(context, apiRouter, [ VersionEndpoint ]);
	apiRouter.use('/auth', bindRoutes(context, Router(), [
		MeEndpoint,
		SteamTicketEndpoint,
	]));
	apiRouter.use('/game', useAuth(bindRoutes(context, Router(), gameEndpoints)));
	apiRouter.use('/register', useToken(bindRoutes(context, Router(), registrationEndpoints)));
	apiRouter.use('/user', useAuth(bindRoutes(context, Router(), userEndpoints)));

	express.use('/api', apiRouter);
	express.use('/assets', bindRoutes(context, Router(), [
		TerrainEndpoint,
		TerrainZoomEndpoint,
	]));
}

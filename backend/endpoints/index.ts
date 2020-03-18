import { Express, Router } from 'express';
import { Endpoint } from '../endpoint';

import { VersionEndpoint } from './version';

import { TerrainEndpoint } from './assets/terrain';

import { MeEndpoint } from './auth/me';
import { SteamTicketEndpoint } from './auth/steam-ticket';

import { BranchesEndpoint } from './user/branches';
import { UnreadCountEndpoint } from './user/unread-count';
import { WorldStartRoomEndpoint } from './user/world-start-room';
import { WorldStatusEndpoint } from './user/world-status';

function bindRoutes(router: Router, endpoints: Endpoint[]) {
	for (const endpoint of endpoints) {
		router[endpoint.method](endpoint.path, (req, res, next) => {
			Promise.resolve(endpoint.execute(req, res)).then(value => {
				if (value === undefined) {
					next();
				} else if (value !== false) {
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

export function installEndpointHandlers(express: Express) {
	const apiRouter = Router();
	bindRoutes(apiRouter, [ VersionEndpoint ]);
	apiRouter.use('/auth', bindRoutes(Router(), [
		MeEndpoint,
		SteamTicketEndpoint,
	]));
	apiRouter.use('/user', bindRoutes(Router(), [
		BranchesEndpoint,
		UnreadCountEndpoint,
		WorldStartRoomEndpoint,
		WorldStatusEndpoint,
	]));

	express.use('/api', apiRouter);
	express.use('/assets', bindRoutes(Router(), [ TerrainEndpoint ]));
}

import { Express, Router } from 'express';
import { Endpoint } from '../endpoint';

import { VersionEndpoint } from './version';

import { TerrainEndpoint } from './assets/terrain';

import { MeEndpoint } from './auth/me';
import { SteamTicketEndpoint } from './auth/steam-ticket';

import { MapStatsEndpoint } from './game/map-stats';
import { RoomStatusEndpoint } from './game/room-status';
import { RoomTerrainEndpoint } from './game/room-terrain';
import { TimeEndpoint } from './game/time';

import { CheckEmailEndpoint, CheckUsernameEndpoint, SubmitRegistrationEndpoint } from './register';

import { BranchesEndpoint } from './user/branches';
import { CodeEndpoint } from './user/code';
import { RespawnProhibitedRoomsEndpoint } from './user/respawn-prohibited-rooms';
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
	apiRouter.use('/game', bindRoutes(Router(), [
		MapStatsEndpoint,
		RoomStatusEndpoint,
		RoomTerrainEndpoint,
		TimeEndpoint,
	]));
	apiRouter.use('/register', bindRoutes(Router(), [
		CheckEmailEndpoint,
		CheckUsernameEndpoint,
		SubmitRegistrationEndpoint,
	]));
	apiRouter.use('/user', bindRoutes(Router(), [
		BranchesEndpoint,
		CodeEndpoint,
		RespawnProhibitedRoomsEndpoint,
		UnreadCountEndpoint,
		WorldStartRoomEndpoint,
		WorldStatusEndpoint,
	]));

	express.use('/api', apiRouter);
	express.use('/assets', bindRoutes(Router(), [ TerrainEndpoint ]));
}

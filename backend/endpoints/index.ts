import { Express, Router } from 'express';
import { useAuth, useToken } from '../auth';
import { BackendContext } from '../context';
import { AbstractResponse, Endpoint } from '../endpoint';

import { VersionEndpoint } from './version';

import { TerrainEndpoint, TerrainZoomEndpoint } from './assets/terrain';

import { MeEndpoint } from './auth/me';
import { SteamTicketEndpoint } from './auth/steam-ticket';

import { MapStatsEndpoint } from './game/map-stats';
import { RoomStatusEndpoint } from './game/room-status';
import { RoomTerrainEndpoint } from './game/room-terrain';
import { TickEndpoint, TimeEndpoint } from './game/time';

import { CheckEmailEndpoint, CheckUsernameEndpoint, SetUsernameEndpoint, SubmitRegistrationEndpoint } from './register';

import { BadgeEndpoint } from './user/badge';
import { BranchesEndpoint, BranchCloneEndpoint, BranchSetEndpoint, CodeEndpoint, CodePostEndpoint } from './user/code';
import { RespawnProhibitedRoomsEndpoint } from './user/respawn-prohibited-rooms';
import { UnreadCountEndpoint } from './user/unread-count';
import { WorldStartRoomEndpoint } from './user/world-start-room';
import { WorldStatusEndpoint } from './user/world-status';

function bindRoutes(context: BackendContext, router: Router, endpoints: Endpoint[]) {
	for (const endpoint of endpoints) {
		router[endpoint.method ?? 'get'](endpoint.path, (req, res, next) => {
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
	apiRouter.use('/game', useAuth(bindRoutes(context, Router(), [
		MapStatsEndpoint,
		RoomStatusEndpoint,
		RoomTerrainEndpoint,
		TickEndpoint,
		TimeEndpoint,
	])));
	apiRouter.use('/register', useToken(bindRoutes(context, Router(), [
		CheckEmailEndpoint,
		CheckUsernameEndpoint,
		SetUsernameEndpoint,
		SubmitRegistrationEndpoint,
	])));
	apiRouter.use('/user', useToken(bindRoutes(context, Router(), [
		BadgeEndpoint,
		BranchesEndpoint,
		BranchCloneEndpoint,
		BranchSetEndpoint,
		CodeEndpoint,
		CodePostEndpoint,
		RespawnProhibitedRoomsEndpoint,
		UnreadCountEndpoint,
		WorldStartRoomEndpoint,
		WorldStatusEndpoint,
	])));
	express.use('/api', apiRouter);
	express.use('/assets', bindRoutes(context, Router(), [
		TerrainEndpoint,
		TerrainZoomEndpoint,
	]));
}

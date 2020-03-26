import bodyParser from 'body-parser';
import Express from 'express';
import http from 'http';

import { BackendContext } from './context';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';

export default async function() {
	const context = await BackendContext.connect();
	const express = Express();
	const httpServer = http.createServer(express);
	express.use(bodyParser.urlencoded({
		limit: '8mb',
		extended: false,
	}));
	express.use(bodyParser.json({ limit: '8mb' }));

	installEndpointHandlers(express, context);
	installSocketHandlers(httpServer, context);

	httpServer.listen(21025, () => console.log('🌎 Listening'));
}

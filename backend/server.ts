import bodyParser from 'body-parser';
import Express from 'express';
import http from 'http';

import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';
import { bindRenderers } from './render';

export default function() {
	const express = Express();
	const httpServer = http.createServer(express);
	express.use(bodyParser.urlencoded({
		limit: '8mb',
		extended: false,
	}));
	express.use(bodyParser.json({ limit: '8mb' }));

	installEndpointHandlers(express);
	installSocketHandlers(httpServer);
	bindRenderers();

	httpServer.listen(21025, () => console.log('🌎 Listening'));
}

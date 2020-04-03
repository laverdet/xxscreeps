import bodyParser from 'body-parser';
import Express from 'express';
import http from 'http';

import { ServiceMessage } from '~/engine/service';
import { Channel } from '~/storage/channel';

import { BackendContext } from './context';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';

export default async function() {
	// Initialize services
	const context = await BackendContext.connect();
	const express = Express();
	const httpServer = http.createServer(express);

	// Shutdown handler
	const serviceChannel = await Channel.connect<ServiceMessage>('service');
	serviceChannel.listen(() => {
		httpServer.close();
		context.disconnect();
	});

	// Set up endpoints
	express.use(bodyParser.urlencoded({
		limit: '8mb',
		extended: false,
	}));
	express.use(bodyParser.json({ limit: '8mb' }));

	installEndpointHandlers(express, context);
	installSocketHandlers(httpServer, context);

	httpServer.listen(21025, () => console.log('🌎 Listening'));
}

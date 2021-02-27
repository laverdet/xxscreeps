import 'xxscreeps/config/mods/backend';
import bodyParser from 'body-parser';
import Express from 'express';
import http from 'http';

import { ServiceMessage } from 'xxscreeps/engine/service';
import { Channel } from 'xxscreeps/storage/channel';
import { BackendContext } from './context';
import { setupGracefulShutdown } from './graceful';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';

// Initialize services
const context = await BackendContext.connect();
const express = Express();
express.disable('x-powered-by');

const httpServer = http.createServer(express);
const shutdownServer = setupGracefulShutdown(express, httpServer);

// Shutdown handler
const serviceChannel = await new Channel<ServiceMessage>(context.storage, 'service').subscribe();
const serviceUnlistener = serviceChannel.listen(message => {
	if (message.type === 'shutdown') {
		serviceUnlistener();
		shutdownServer();
		void context.disconnect();
	}
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

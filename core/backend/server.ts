import bodyParser from 'body-parser';
import Express from 'express';
import http from 'http';

import { ServiceMessage } from 'xxscreeps/engine/service';
import { Channel } from 'xxscreeps/storage/channel';
import { BackendContext } from './context';
import { setupGracefulShutdown } from './graceful';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';

import 'xxscreeps/config/mods/import/game';
import 'xxscreeps/config/mods/import/processor';
import 'xxscreeps/config/mods/import/backend';

// Initialize services
const context = await BackendContext.connect();
const express = Express();
express.disable('x-powered-by');

// Set up endpoints
const httpServer = http.createServer(express);
express.use(bodyParser.urlencoded({
	limit: '8mb',
	extended: false,
}));
express.use(bodyParser.json({ limit: '8mb' }));
installEndpointHandlers(express, context);
const socketServer = installSocketHandlers(httpServer, context);

// Shutdown handler
const shutdownServer = setupGracefulShutdown(httpServer, socketServer);
const serviceChannel = await new Channel<ServiceMessage>(context.storage, 'service').subscribe();
const serviceUnlistener = serviceChannel.listen(message => {
	if (message.type === 'shutdown') {
		serviceUnlistener();
		shutdownServer();
		void context.disconnect();
	}
});

httpServer.listen(21025, () => console.log('🌎 Listening'));

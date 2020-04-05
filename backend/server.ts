import bodyParser from 'body-parser';
import Express from 'express';
import http, { IncomingMessage, Server, ServerResponse } from 'http';
import { Socket } from 'net';

import { ServiceMessage } from '~/engine/service';
import { Channel } from '~/storage/channel';

import { BackendContext } from './context';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';

// Note: None of this is HTTP/2.0 compatible!
function graceful(server: Server) {

	// Keep track of all connections
	const connections = new Set<Socket>();
	const isIdle = (connection: Socket) => {
		if (shuttingDown) {
			connection.end();
		} else {
			connections.add(connection);
		}
	};
	server.on('connection', (connection: Socket) => {
		isIdle(connection);
		connection.on('close', () => connections.delete(connection));
	});
	server.on('request', (req: IncomingMessage, res: ServerResponse) => {
		const { connection } = res;
		if (!req.url?.startsWith('/socket/')) {
			connections.delete(connection);
		}
		res.on('finish', () => isIdle(connection));
	});

	// Shutdown callback
	let shuttingDown = false;
	return () => {
		// Shutdown listening socket
		shuttingDown = true;
		server.close();

		// Close all idle connections
		for (const socket of connections) {
			socket.end();
		}
	};
}

export default async function() {
	// Initialize services
	const context = await BackendContext.connect();
	const express = Express();
	express.disable('x-powered-by');

	const httpServer = http.createServer(express);
	const shutdownServer = graceful(httpServer);

	// Shutdown handler
	const serviceChannel = await Channel.connect<ServiceMessage>('service');
	const serviceUnlistener = serviceChannel.listen(message => {
		if (message.type === 'shutdown') {
			serviceUnlistener();
			shutdownServer();
			context.disconnect();
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
}

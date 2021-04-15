import type { Context, State } from '.';

import bodyParser from 'koa-bodyparser';
import Koa from 'koa';
import Router from 'koa-router';
import http from 'http';

import { getServiceChannel } from 'xxscreeps/engine/service';
import { authentication } from './auth';
import { BackendContext } from './context';
import { setupGracefulShutdown } from './graceful';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers } from './socket';
import { middleware } from './symbols';

import 'xxscreeps/config/mods/import/game';
import 'xxscreeps/config/mods/import/processor';
import 'xxscreeps/config/mods/import/backend';

// Initialize services
const backendContext = await BackendContext.connect();
const koa = new Koa<State, Context>();
const router = new Router<State, Context>();

// Set up endpoints
const httpServer = http.createServer(koa.callback());
koa.use(async(context, next) => {
	try {
		await next();
	} catch (err) {
		console.error(`Unhandled error. Endpoint: ${context.url}\n`, err);
		context.status = 500;
		context.body = '';
	}
});
koa.use((context, next) => {
	context.backend = backendContext;
	context.shard = backendContext.shard;
	return next();
});
koa.use(bodyParser());
koa.use(authentication());
middleware.forEach(fn => fn(koa, router));
koa.use(router.routes());
koa.use(router.allowedMethods());
installEndpointHandlers(koa, router);
const socketServer = installSocketHandlers(httpServer, backendContext);

// Shutdown handler
const shutdownServer = setupGracefulShutdown(httpServer, socketServer);
const serviceChannel = await getServiceChannel(backendContext.shard).subscribe();
const serviceUnlistener = serviceChannel.listen(message => {
	if (message.type === 'shutdown') {
		serviceUnlistener();
		shutdownServer();
		void backendContext.disconnect();
	}
});

httpServer.listen(21025, () => console.log('🌎 Listening'));

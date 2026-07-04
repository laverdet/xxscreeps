import type { Context, State } from './index.js';
import * as http from 'node:http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import ConditionalGet from 'koa-conditional-get';
import Router from 'koa-router';
import { config } from 'xxscreeps/config/index.js';
import { handleInterruptSignal } from 'xxscreeps/engine/service/signal.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { authentication } from './auth/index.js';
import { BackendContext } from './context.js';
import { installEndpointHandlers } from './endpoints/index.js';
import { setupGracefulShutdown } from './graceful.js';
import { installSocketHandlers, installUpgradeHandlers } from './socket.js';
import { hooks } from './symbols.js';
import 'xxscreeps:mods/backend';
import 'xxscreeps:mods/game';
import 'xxscreeps:mods/processor';

initializeGameEnvironment();

// Initialize services
await using backendContext = await BackendContext.connect();
hooks.makeIterated('backendReady')(backendContext.db, backendContext.shard);
const koa = new Koa<State, Context>({
	proxy: config.backend.proxy,
	...config.backend.proxyIpHeader !== undefined && { proxyIpHeader: config.backend.proxyIpHeader },
	...config.backend.maxIpsCount !== undefined && { maxIpsCount: config.backend.maxIpsCount },
});
const router = new Router<State, Context>();

// Set up endpoints
const httpServer = http.createServer(koa.callback());
const unlistenServer = setupGracefulShutdown(httpServer);
installUpgradeHandlers(koa, httpServer);
const socketHandler = installSocketHandlers(koa, backendContext);
koa.use(ConditionalGet());
koa.use(async (context, next) => {
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
	context.db = backendContext.db;
	context.shard = backendContext.shard;
	return next();
});
koa.use(bodyParser({
	jsonLimit: '8mb',
}));
koa.use(authentication());
hooks.makeIterated('middleware')(koa, router);
koa.use(router.routes());
koa.use(router.allowedMethods());
installEndpointHandlers(koa, router);

// Read configuration
const addr: any[] = config.backend.bind.split(':');
addr[1] = Number(addr[1] ?? 21025);
if (addr[0] === '*') {
	addr.shift();
}
addr.reverse();
httpServer.listen(...addr, () => console.log('🌎 Listening'));

// Interrupt handler
const halt = Promise.withResolvers<void>();
using _signal = handleInterruptSignal(halt.resolve);
await halt.promise;

// Start graceful exit
await unlistenServer();
await socketHandler.flush();

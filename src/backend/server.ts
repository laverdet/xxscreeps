import type { Effect } from 'xxscreeps/utility/types';
import type { Context, State } from '.';

import * as Async from 'xxscreeps/utility/async';
import bodyParser from 'koa-bodyparser';
import Koa from 'koa';
import ConditionalGet from 'koa-conditional-get';
import Router from 'koa-router';
import http from 'http';
import config from 'xxscreeps/config';

import { getServiceChannel, handleInterrupt } from 'xxscreeps/engine/service';
import { authentication } from './auth';
import { BackendContext } from './context';
import { setupGracefulShutdown } from './graceful';
import { installEndpointHandlers } from './endpoints';
import { installSocketHandlers, installUpgradeHandlers } from './socket';
import { hooks } from './symbols';

import 'xxscreeps/config/mods/import/game';
import 'xxscreeps/config/mods/import/processor';
import 'xxscreeps/config/mods/import/backend';

// Initialize services
const backendContext = await BackendContext.connect();
const koa = new Koa<State, Context>();
const router = new Router<State, Context>();

// Set up endpoints
const httpServer = http.createServer(koa.callback());
const unlistenServer = setupGracefulShutdown(httpServer);
installUpgradeHandlers(koa, httpServer);
installSocketHandlers(koa, backendContext);
koa.use(ConditionalGet());
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
let halt: Effect | undefined;
handleInterrupt(() => halt?.());

// Wait for shutdown message
const serviceChannel = await getServiceChannel(backendContext.shard).subscribe();
for await (const message of Async.breakable(serviceChannel, breaker => halt = breaker)) {
	if (message.type === 'shutdown') {
		break;
	}
}

// Start graceful exit
serviceChannel.disconnect();
await unlistenServer();
await backendContext.disconnect();

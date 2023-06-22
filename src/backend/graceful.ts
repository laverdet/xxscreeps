import type { Effect } from 'xxscreeps/utility/types.js';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import type { Socket } from 'net';
import type sockjs from 'sockjs';
import { Deferred } from 'xxscreeps/utility/async.js';
import Fn from 'xxscreeps/utility/functional.js';

type Options = {
	timeout?: number;
};
type Reference = Socket | sockjs.Connection;

export function setupGracefulShutdown(server: Server, { timeout = 2000 }: Options = {}) {

	// Keep track of all connections
	let flushedHandler: Effect | undefined;
	const sockets = new Map<Reference, boolean>();
	const markIdle = (conn: Reference) => {
		sockets.set(conn, true);
		if (flushedHandler) {
			// Currently shutting down
			conn.destroy();
			if (Fn.every(sockets.values())) {
				flushedHandler();
			}
		}
	};
	server.on('connection', conn => {
		markIdle(conn);
		conn.once('close', () => sockets.delete(conn));
	});
	server.on('request', (req: IncomingMessage, res: ServerResponse) => {
		const { socket } = res;
		if (socket) {
			sockets.set(socket, false);
			res.once('finish', () => markIdle(socket));
			res.writeHead = function(writeHead) {
				return function(this: any, ...args: any) {
					markIdle(socket);
					return writeHead.apply(this, args);
				};
			}(res.writeHead);
		}
	});
	server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
		markIdle(socket);
		socket.on('close', () => sockets.delete(socket));
	});

	// Shutdown handler
	let deferred: Deferred | undefined;
	return () => {
		if (deferred) {
			return deferred.promise;
		}
		deferred = new Deferred();
		flushedHandler = () => deferred!.resolve();
		server.close();

		// Close all idle connections
		for (const [ socket, idle ] of sockets) {
			if (idle) {
				socket.end();
			}
		}
		if (Fn.every(sockets.values())) {
			flushedHandler();
		}

		// Close after timeout
		if (timeout) {
			setTimeout(() => {
				for (const socket of sockets.keys()) {
					socket.end();
				}
				flushedHandler!();
			}, timeout).unref();
		}
	};
}

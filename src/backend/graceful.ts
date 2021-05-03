import type { IncomingMessage, Server, ServerResponse } from 'http';
import type { Socket } from 'net';
import type sockjs from 'sockjs';

type Options = {
	timeout?: number;
};
type Reference = Socket | sockjs.Connection;

export function setupGracefulShutdown(
	server: Server,
	sockjs: sockjs.Server,
	{ timeout = 2000 }: Options = {},
) {

	// Keep track of all connections
	const sockets = new Map<Reference, boolean>();
	const markIdle = (conn: Reference) => {
		if (shuttingDown) {
			conn.destroy();
		}
		sockets.set(conn, true);
	};
	server.on('connection', conn => {
		markIdle(conn);
		conn.once('close', () => sockets.delete(conn));
	});
	server.on('request', (req: IncomingMessage, res: ServerResponse) => {
		const conn = res.connection!;
		sockets.set(conn, false);
		res.once('finish', () => markIdle(conn));
	});

	sockjs.on('connection', conn => {
		markIdle(conn);
		conn.on('close', () => sockets.delete(conn));
	});

	// Shutdown handler
	let shuttingDown = false;
	return () => {
		// Close HTTP listener
		shuttingDown = true;
		server.close();

		// Close all idle connections
		for (const [ socket, idle ] of sockets) {
			if (idle) {
				socket.end();
			}
		}

		// Close after timeout
		if (timeout) {
			setTimeout(() => {
				for (const socket of sockets.keys()) {
					socket.end();
				}
			}, timeout).unref();
		}
	};
}

import { Express } from 'express';
import { Socket } from 'net';
import { IncomingMessage, Server, ServerResponse } from 'http';

type Options = {
	timeout?: number;
};
type ConnectionInfo = Socket & {
	_idle: boolean;
};

export function setupGracefulShutdown(express: Express, server: Server, { timeout = 2000 }: Options = {}): () => void {

	// Keep track of all connections
	const sockets = new Set<ConnectionInfo>();
	const markIdle = (connection: ConnectionInfo) => {
		if (shuttingDown) {
			connection.end();
		}
		connection._idle = true;
	};
	server.on('connection', (conn: ConnectionInfo) => {
		markIdle(conn);
		sockets.add(conn);
		conn.on('close', () => sockets.delete(conn));
	});
	server.on('request', (req: IncomingMessage, res: ServerResponse) => {
		const connection = res.connection as ConnectionInfo;
		connection._idle = false;
		res.on('finish', () => markIdle(connection));
	});

	// Express middleware to keep track of event streams
	express.use((req, res, next) => {
		res.writeHead = function(writeHead) {
			return function(this: any, ...args: any) {
				return writeHead.call(this, args);
			};
		}(res.writeHead);
		next();
	});

	// Shutdown handler
	let shuttingDown = false;
	return () => {
		// Close HTTP listener
		shuttingDown = true;
		server.close();

		// Close all idle connections
		for (const socket of sockets) {
			if (socket._idle) {
				socket.end();
			}
		}

		// Close after timeout
		if (timeout) {
			const timeoutRef = setTimeout(() => {
				for (const socket of sockets) {
					socket.end();
				}
			}, timeout);
			timeoutRef.unref();
		}
	};
}

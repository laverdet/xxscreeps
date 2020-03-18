import type { Server } from 'http';
import sockjs from 'sockjs';

const socketServer = sockjs.createServer({ prefix: '/socket' });

export function installSocketHandlers(httpServer: Server) {
	socketServer.installHandlers(httpServer);
	socketServer.on('connection', connection => {
		connection.write(`time ${Date.now()}`);
		connection.write('protocol 14');
		connection.on('data', message => {
			if (/^auth /.exec(message) !== null) {
				connection.write('auth ok 123');
			}
		});
	});
}

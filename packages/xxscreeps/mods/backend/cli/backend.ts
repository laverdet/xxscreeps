import { hooks } from 'xxscreeps/backend/index.js';
import { startSocketServer } from './socket.js';

// Start the CLI socket server when the backend context is ready.
hooks.register('backendReady', (db, shard) => {
	startSocketServer(db, shard);
});

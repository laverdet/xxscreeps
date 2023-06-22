import * as RoomSchema from 'xxscreeps/engine/db/room.js';
import 'xxscreeps/config/mods/import/game.js';

// Writes room schema to archive
try {
	RoomSchema.read(new Uint8Array());
} catch {}

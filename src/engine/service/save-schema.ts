import * as RoomSchema from 'xxscreeps/engine/db/room';
import 'xxscreeps/config/mods/import/game';

// Writes room schema to archive
try {
	RoomSchema.read(new Uint8Array());
} catch {}

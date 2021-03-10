import * as Fn from 'xxscreeps/utility/functional';
import { BackendContext } from 'xxscreeps/backend/context';
import { Room } from 'xxscreeps/game/room';
import { read, write } from 'xxscreeps/engine/room';

export async function loadRoom(context: BackendContext, room: string) {
	return read(await context.persistence.get(`room/${room}`));
}

export async function loadRooms(context: BackendContext, roomNames: Iterable<string>) {
	return Promise.all(Fn.map(roomNames, room => loadRoom(context, room)));
}

export function saveRoom(context: BackendContext, room: Room) {
	return context.persistence.set(`room/${room.name}`, write(room));
}

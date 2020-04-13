import { BackendContext } from '~/backend/context';
import * as Room from '~/engine/schema/room';
import { mapInPlace } from '~/lib/utility';

export async function loadRoom(context: BackendContext, room: string) {
	return Room.read(await context.persistence.get(`room/${room}`));
}

export async function loadRooms(context: BackendContext, roomNames: Iterable<string>) {
	return Promise.all(mapInPlace(roomNames, room => loadRoom(context, room)));
}

export function saveRoom(context: BackendContext, room: Room.Shape) {
	return context.persistence.set(`room/${room.name}`, Room.write(room));
}

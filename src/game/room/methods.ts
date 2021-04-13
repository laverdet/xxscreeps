import type { RoomObject } from 'xxscreeps/game/object';
import type { RoomPosition } from 'xxscreeps/game/position';
import type { LookConstants, Room } from './room';
import * as Game from '../state';
import { FlushFindCache, LookFor, MoveObject, Objects, InsertObject, RemoveObject } from './symbols';

export function flushFindCache(room: Room) {
	room[FlushFindCache]();
}

export function getObjects(room: Room) {
	return room[Objects];
}

export function lookFor<Type extends LookConstants>(room: Room, type: Type) {
	return room[LookFor](type);
}

export function insertObject(room: Room, object: RoomObject) {
	room[InsertObject](object);
}

export function moveObject(object: RoomObject, pos: RoomPosition) {
	return object.room[MoveObject](object, pos);
}

export function removeObject(object: RoomObject) {
	object.room[RemoveObject](object);
	Game.removeObject(object);
}

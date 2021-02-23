// `RoomObject` variant hook
import {} from 'xxscreeps/config/mods/schema';
export const _objectFormats: RoomObjectFormats[keyof RoomObjectFormats][] = [];
export function registerRoomObjectFormat<Type>(format: Type): void | Type {
	_objectFormats.push(format as never);
}
export interface RoomObjectFormats {}

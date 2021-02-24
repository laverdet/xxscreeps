// `RoomObject` variant hook
export const _objectFormats: RoomObjectFormats[keyof RoomObjectFormats][] = [];
export function registerRoomObjectFormat<Type>(format: Type) {
	_objectFormats.push(format as never);
}
export interface RoomObjectFormats {}

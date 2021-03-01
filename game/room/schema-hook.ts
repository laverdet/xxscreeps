// `RoomObject` variant hook
export const objectFormats: RoomObjectFormats[keyof RoomObjectFormats][] = [];
export function registerRoomObjectFormat<Type>(format: Type) {
	objectFormats.push(format as never);
}
export interface RoomObjectFormats {}

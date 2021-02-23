import type { RoomObject } from 'xxscreeps/game/objects/room-object';

export type LocalIntent<Receiver extends RoomObject, Intent extends string, Parameters = undefined> = {
	receiver: Receiver;
	intent: Intent;
	parameters: Parameters;
};

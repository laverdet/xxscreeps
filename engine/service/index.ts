export type LoopStatus = 'paused' | 'runUserCode' | 'proccessRoomIntents' | 'processGlobalIntents';

export type LoopStatusChanged = { type: 'changed'; time: number; status: LoopStatus };
export type LoopStatusNotification = { type: 'notify'; time: number; status: LoopStatus };

export type ProcessorConnectedMessage = { type: 'processorConnected' };
export type ProcessRoomsMessage = { type: 'processRooms'; time: number };
export type ProcessedRoomMessage = { type: 'processedRoom'; roomName: string };
export type FlushRoomsMessage = { type: 'flushRooms' };
export type FlushedRoomMessage = { type: 'flushedRooms'; roomNames: string[] };
export type ProcessorMessage =
	ProcessorConnectedMessage |
	ProcessRoomsMessage | ProcessedRoomMessage |
	FlushRoomsMessage | FlushedRoomMessage;

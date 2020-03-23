type RunnerConnectedMessage = { type: 'runnerConnected' };
type RunnerProcessUsers = { type: 'processUsers'; time: number };
type RunnerProcessedUser = { type: 'processedUser'; userId: string; roomNames: string[] };
export type RunnerMessage = RunnerConnectedMessage | RunnerProcessUsers | RunnerProcessedUser;

type ProcessorConnectedMessage = { type: 'processorConnected' };
type ProcessRoomsMessage = { type: 'processRooms'; time: number };
type ProcessedRoomMessage = { type: 'processedRoom'; roomName: string };
type FlushRoomsMessage = { type: 'flushRooms' };
type FlushedRoomMessage = { type: 'flushedRooms'; roomNames: string[] };
export type ProcessorMessage =
	ProcessorConnectedMessage |
	ProcessRoomsMessage | ProcessedRoomMessage |
	FlushRoomsMessage | FlushedRoomMessage;

export type ProcessorQueueElement = {
	room: string;
	users: string[];
};

export type GameMessage = { type: 'tick'; time: number } | { type: null };

type RunnerConnectedMessage = { type: 'runnerConnected' };
type RunnerProcessUsers = { type: 'processUsers'; time: number };
type RunnerProcessedUser = { type: 'processedUser'; userId: string; roomNames: string[] };
export type RunnerMessage = RunnerConnectedMessage | ShutdownMessage | RunnerProcessUsers | RunnerProcessedUser;

type ProcessorConnectedMessage = { type: 'processorConnected' };
type ProcessRoomsMessage = { type: 'processRooms'; time: number };
type ProcessedRoomMessage = { type: 'processedRoom'; roomName: string };
type FlushRoomsMessage = { type: 'flushRooms' };
type FlushedRoomMessage = { type: 'flushedRooms'; roomNames: string[] };
export type ProcessorMessage =
	ProcessorConnectedMessage | ShutdownMessage |
	ProcessRoomsMessage | ProcessedRoomMessage |
	FlushRoomsMessage | FlushedRoomMessage;

type ShutdownMessage = { type: 'shutdown' };
export type ServiceMessage = { type: 'mainConnected' } | ShutdownMessage;

export type ProcessorQueueElement = {
	room: string;
	users: string[];
};

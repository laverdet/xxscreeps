import intents from './intents';
import { MapStatsEndpoint } from './map-stats';
import { RoomStatusEndpoint } from './room-status';
import { RoomTerrainEndpoint } from './room-terrain';
import time from './time';
export default [ ...intents, ...time, MapStatsEndpoint, RoomStatusEndpoint, RoomTerrainEndpoint ];

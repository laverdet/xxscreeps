import { MapStatsEndpoint } from './map-stats';
import { RoomStatusEndpoint } from './room-status';
import { RoomTerrainEndpoint } from './room-terrain';
import time from './time';
export default [ ...time, MapStatsEndpoint, RoomStatusEndpoint, RoomTerrainEndpoint ];

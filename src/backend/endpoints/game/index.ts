import intents from './intents';
import { MapStatsEndpoint } from './map-stats';
import { RoomStatusEndpoint } from './room-status';
import './terrain';
import './shards';
import './world';
import time from './time';
export default [ ...intents, ...time, MapStatsEndpoint, RoomStatusEndpoint ];

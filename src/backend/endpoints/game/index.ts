import intents from './intents.js';
import { MapStatsEndpoint } from './map-stats.js';
import './leaderboard.js';
import './room.js';
import './terrain.js';
import './shards.js';
import './world.js';
import time from './time.js';
export default [ ...intents, ...time, MapStatsEndpoint ];

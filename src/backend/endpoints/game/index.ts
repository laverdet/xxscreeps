import intents from './intents';
import { MapStatsEndpoint } from './map-stats';
import './leaderboard';
import './room';
import './terrain';
import './shards';
import './world';
import time from './time';
export default [ ...intents, ...time, MapStatsEndpoint ];

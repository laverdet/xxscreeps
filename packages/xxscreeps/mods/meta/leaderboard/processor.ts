import { hooks } from 'xxscreeps/mods/meta/stats/model.js';
import { writeScores } from './model.js';

// Scores accumulate off the same batched flush the stat series are written from, so a leaderboard
// costs no extra writes during the tick. A batch which straddles the turn of the month is credited
// in full to the month its bucket began in — the same bounded attribution error the stat buckets
// already accept.
hooks.register('flush', (shard, entries, bucketTime) => writeScores(shard.db, entries, bucketTime));

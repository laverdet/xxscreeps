import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import { getRoomChannel } from 'xxscreeps/engine/processor/model.js';
import * as C from 'xxscreeps/game/constants/index.js';

const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const gameMutex = await Mutex.connect('game', shard.data, shard.pubsub);

const room = await shard.loadRoom('W9N1');
const channel = getRoomChannel(shard, 'W9N1');
const creep = room.find(C.FIND_CREEPS)[0];
creep.pos.x += Math.random() < 0.5 ? 1 : -1;
creep.pos.y += Math.random() < 0.5 ? 1 : -1;
await shard.saveRoom('W9N1', shard.time, room);
await channel.publish({ type: 'didUpdate', time: shard.time + 1 });
console.log(creep.pos);

await gameMutex.disconnect();
shard.disconnect();
db.disconnect();

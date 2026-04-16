import { registerStorageProvider } from 'xxscreeps/engine/db/storage/register.js';
import { RedisProvider } from './keyval.js';
import { RedisPubSubProvider } from './pubsub.js';

registerStorageProvider('redis', 'keyval', url => RedisProvider.connect(url));
registerStorageProvider('redis', 'pubsub', url => RedisPubSubProvider.connect(url));

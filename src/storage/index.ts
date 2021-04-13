import './local/blob';
import './local/keyval';
import './local/pubsub';

export type { BlobProvider, KeyValProvider, PubSubProvider } from './provider';
export { connectToProvider, registerStorageProvider } from './register';

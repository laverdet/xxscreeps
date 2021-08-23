import './local/blob';
import './local/keyval';
import './local/pubsub';

export type { KeyValProvider, PubSubProvider } from './provider';
export { connectToProvider, registerStorageProvider } from './register';

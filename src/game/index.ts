import './room';

import { IntentManager } from './intents';
export { registerGlobal } from './runtime';
export {
	instance, Game,
	me, rooms, time,
	getObjectById,
	registerGameInitializer,
	runAsUser, runForUser, runWithState,
 } from './state';

// Intents
export let intents: IntentManager;

export function initializeIntents() {
	intents = new IntentManager;
}

export function flushIntents() {
	const instance = intents;
	intents = undefined as never;
	return instance;
}

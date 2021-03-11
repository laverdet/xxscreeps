import { IntentManager } from './intents';
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
	return intents;
}

import type { QueuedNotification } from './notifications.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { hooks, intents } from 'xxscreeps/game/index.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { OwnedStructure, Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { flush, notify } from './notifications.js';
import './schema.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickResult {
		notificationsQueued?: QueuedNotification[];
	}
}

declare module 'xxscreeps/mods/classic/creep/creep.js' {
	interface Creep {
		/**
		 * Toggle auto notification when the creep is under attack. The notification will be sent to
		 * your account email. Turned on by default.
		 * @param notifyWhenAttacked Whether to enable notification or disable.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_ARGS`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.notifyWhenAttacked
		 */
		notifyWhenAttacked: (this: Creep, notifyWhenAttacked?: boolean) => ReturnType<typeof checkCreepNotifyWhenAttacked>;
	}
}

declare module 'xxscreeps/mods/classic/structure/structure.js' {
	interface Structure {
		/**
		 * Toggle auto notification when the structure is under attack. The notification will be sent to
		 * your account email. Turned on by default.
		 * @param notifyWhenAttacked Whether to enable notification or disable.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_INVALID_ARGS`
		 * @public
		 * @see https://docs.screeps.com/api/#Structure.notifyWhenAttacked
		 */
		notifyWhenAttacked: (this: Structure, notifyWhenAttacked: boolean) => ReturnType<typeof checkStructureNotifyWhenAttacked>;
	}
}

/** @internal */
export function checkCreepNotifyWhenAttacked(creep: Creep, enabled: unknown) {
	if (!creep.my) {
		return C.ERR_NOT_OWNER;
	} else if (creep.spawning) {
		return C.ERR_BUSY;
	} else if (typeof enabled !== 'boolean') {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

/** @internal */
export function checkStructureNotifyWhenAttacked(structure: Structure, notifyWhenAttacked: unknown) {
	if (structure.my === false || structure.room.controller?.my === false) {
		return C.ERR_NOT_OWNER;
	} else if (typeof notifyWhenAttacked !== 'boolean') {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

Creep.prototype.notifyWhenAttacked = function(this: Creep, notifyWhenAttacked = true) {
	return chainIntentChecks(
		() => checkCreepNotifyWhenAttacked(this, notifyWhenAttacked),
		() => {
			if (notifyWhenAttacked === this['#noAttackNotify']) {
				intents.save(this, 'notifyWhenAttacked', Boolean(notifyWhenAttacked));
			}
		});
};

Structure.prototype.notifyWhenAttacked = function(this: Structure, notifyWhenAttacked: boolean) {
	return chainIntentChecks(
		() => checkStructureNotifyWhenAttacked(this, notifyWhenAttacked),
		() => {
			if (this instanceof OwnedStructure && notifyWhenAttacked === this['#noAttackNotify']) {
				intents.save(this, 'notifyWhenAttacked', Boolean(notifyWhenAttacked));
			}
		});
};

hooks.register('gameInitializer', Game => {
	Game.notify = notify;
});

hooks.register('runtimeConnector', {
	send(payload) {
		payload.notificationsQueued = flush();
	},
});

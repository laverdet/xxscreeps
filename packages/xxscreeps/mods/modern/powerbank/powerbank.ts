import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject, createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { captureDamage } from 'xxscreeps/game/processor.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { powerBankShape } from './schema.js';
import { PowerBankStore } from './store.js';

export class StructurePowerBank extends withOverlay(Structure, powerBankShape) {
	@enumerable get power() { return this.store[C.RESOURCE_POWER]; }
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#nextDecayTime']); }
	@enumerable get owner() { return { username: 'Power Bank' }; }
	@enumerable override get my() { return false; }
	override get hitsMax() { return C.POWER_BANK_HITS; }
	override get structureType() { return C.STRUCTURE_POWER_BANK; }

	override '#applyDamage'(power: number, type: number, source?: RoomObject) {
		// FIXME: removal is deferred to the object flush, so a creep can still attack this bank the
		// tick it dies; bail to suppress the spurious second hit-back. Remove once intents stop
		// resolving queued-for-removal targets.
		if (this.hits <= 0) {
			return;
		}
		super['#applyDamage'](power, type, source);
		// Divergence from Screeps, which also emits a hit-back event for non-creep attackers that
		// never take the damage
		if (source instanceof Creep && this.room.controller?.safeMode === undefined) {
			const damage = captureDamage(source, power * C.POWER_BANK_HIT_BACK, C.EVENT_ATTACK_TYPE_HIT_BACK, null);
			if (damage > 0) {
				appendEventLog(this.room, {
					event: C.EVENT_ATTACK,
					objectId: this.id,
					targetId: source.id,
					attackType: C.EVENT_ATTACK_TYPE_HIT_BACK,
					damage,
				});
				source['#applyDamage'](damage, C.EVENT_ATTACK_TYPE_HIT_BACK, this);
			}
		}
	}
}

export function create(pos: RoomPosition, power: number) {
	const bank = assign(createRoomObject(new StructurePowerBank(), pos), {
		hits: C.POWER_BANK_HITS,
		store: PowerBankStore['#create'](power),
	});
	bank['#nextDecayTime'] = Game.time + C.POWER_BANK_DECAY;
	return bank;
}

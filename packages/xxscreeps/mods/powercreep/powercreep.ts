import type { PowerCreepRecord, PowerLevel } from './record.js';
import { levelOf, nestPowers } from './record.js';

/**
 * An account-scoped power creep. Slice 3 materializes the roster for visibility only; an unspawned
 * power creep has no room presence (`shard` is `null`, `ticksToLive` is `undefined`). Spawn/renew
 * and the mutating verbs arrive with the room entity in slice 4.
 */
export class PowerCreep {
	id;
	name;
	className;
	level;
	powers: Record<number, PowerLevel>;
	spawnCooldownTime;
	deleteTime;
	shard: string | null = null;
	ticksToLive: number | undefined = undefined;

	constructor(record: PowerCreepRecord) {
		this.id = record.id;
		this.name = record.name;
		this.className = record.className;
		this.level = levelOf(record);
		this.powers = nestPowers(record.powers);
		this.spawnCooldownTime = record.spawnCooldownTime;
		this.deleteTime = record.deleteTime;
	}
}

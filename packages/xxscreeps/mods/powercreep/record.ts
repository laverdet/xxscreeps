import { Fn } from 'xxscreeps/functional/fn.js';

// The stored roster record and the pure helpers over it. Kept free of `engine/db` imports so the
// runtime view (`powercreep.ts`, loaded into the game isolate) can share them without dragging
// server-only database code across the slot boundary; `model.ts` owns the keyspace operations.
export interface PowerCreepRecord {
	id: string;
	name: string;
	className: string;
	powers: Record<number, number>;
	/** Wall-clock ms; set when a spawned creep dies (slice 4), `0` while idle. */
	spawnCooldownTime: number;
	/** Wall-clock ms; deletion scheduled this far out, cancellable until it elapses. */
	deleteTime?: number;
}

export interface PowerLevel { level: number }

export function levelOf(record: PowerCreepRecord) {
	return Fn.accumulate(Object.values(record.powers));
}

/** Expand the flat `{ [PWR]: level }` store into the public `{ [PWR]: { level } }` shape. */
export function nestPowers(powers: Record<number, number>): Record<number, PowerLevel> {
	return Object.fromEntries(Object.entries(powers).map(([ power, level ]) => [ Number(power), { level } ] as const));
}

import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { Terrain } from 'xxscreeps/game/terrain.js';
import * as assert from 'node:assert';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { makeSignedRoomName, parseSignedRoomName } from 'xxscreeps/game/room/name.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { deterministicRandomForTesting } from 'xxscreeps/test/fixtures.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { generateRoom, generateSector } from './room-gen.js';

interface SideInfo {
	dxx: number;
	dyy: number;
	/** This room's border on this side, as its `packExits` bit. */
	bit: number;
	/** The neighbor's bit for the border it shares with this room. */
	sharedBit: number;
}

const kSideInfo: Record<'top' | 'right' | 'bottom' | 'left', SideInfo> = {
	top: { dxx: 0, dyy: -1, bit: 1, sharedBit: 4 },
	right: { dxx: 1, dyy: 0, bit: 2, sharedBit: 8 },
	bottom: { dxx: 0, dyy: 1, bit: 4, sharedBit: 1 },
	left: { dxx: -1, dyy: 0, bit: 8, sharedBit: 2 },
};

interface RoomRecord {
	exits: number;
}

// No room may open onto a room the world doesn't have, and a shared border reads the same from
// both of its sides.
function assertClosedWorld(terrain: ReadonlyMap<string, RoomRecord>) {
	for (const [ roomName, { exits } ] of terrain) {
		const { rx, ry } = parseSignedRoomName(roomName);
		for (const [ dir, side ] of Object.entries(kSideInfo)) {
			const neighborName = makeSignedRoomName(rx + side.dxx, ry + side.dyy);
			const neighbor = terrain.get(neighborName);
			if (neighbor === undefined) {
				assert.strictEqual(exits & side.bit, 0, `${roomName} opens ${dir} onto missing ${neighborName}`);
			} else {
				assert.strictEqual(
					(exits & side.bit) !== 0, (neighbor.exits & side.sharedBit) !== 0,
					`${roomName} disagrees with ${neighborName} about their shared border`);
			}
		}
	}
}

const terrainString = (terrain: Terrain) =>
	[ ...Fn.map(Fn.range(2500), ii => terrain.get(ii % 50, Math.floor(ii / 50))) ].join('');

// A punch only removes wall: every tile that changed was wall and is now plain, so swamp and every
// object position survive it untouched.
function assertPunchedOnly(before: string, after: string, roomName: string) {
	for (const [ ii, tile ] of [ ...after ].entries()) {
		const prior = before[ii]!;
		if (tile !== prior) {
			assert.strictEqual(prior, `${C.TERRAIN_MASK_WALL}`,
				`${roomName} changed a non-wall tile at ${ii % 50},${Math.floor(ii / 50)}`);
			assert.strictEqual(tile, '0',
				`${roomName} grew terrain at ${ii % 50},${Math.floor(ii / 50)}`);
		}
	}
}

// No exit is a dead end: every open border tile can walk (8-connected, as `checkFlood` floods) to
// the room's main ground, however many stretches its border openings break into.
function assertExitsReachGround(terrain: Terrain, roomName: string) {
	const isOpen = (xx: number, yy: number) => terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL;
	const seen = new Set<number>();
	let main: Set<number> | undefined;
	for (let yy = 0; yy < 50; ++yy) {
		for (let xx = 0; xx < 50; ++xx) {
			if (!isOpen(xx, yy) || seen.has(yy * 50 + xx)) {
				continue;
			}
			const component = new Set([ yy * 50 + xx ]);
			const stack = [ [ xx, yy ] as const ];
			while (stack.length > 0) {
				const [ cxx, cyy ] = stack.pop()!;
				for (let dyy = -1; dyy <= 1; ++dyy) {
					for (let dxx = -1; dxx <= 1; ++dxx) {
						const nxx = cxx + dxx;
						const nyy = cyy + dyy;
						if (
							nxx >= 0 && nyy >= 0 && nxx <= 49 && nyy <= 49 &&
							isOpen(nxx, nyy) && !component.has(nyy * 50 + nxx)
						) {
							component.add(nyy * 50 + nxx);
							stack.push([ nxx, nyy ]);
						}
					}
				}
			}
			for (const key of component) {
				seen.add(key);
			}
			if (component.size > (main?.size ?? 0)) {
				main = component;
			}
		}
	}
	for (let ii = 0; ii < 50; ++ii) {
		for (const [ xx, yy ] of [ [ ii, 0 ], [ ii, 49 ], [ 0, ii ], [ 49, ii ] ] as const) {
			if (isOpen(xx, yy)) {
				assert.ok(main?.has(yy * 50 + xx), `${roomName} has a dead-end exit at ${xx},${yy}`);
			}
		}
	}
}

// Generation force-opens the tile behind every exit (`markExits`); a punched border upholds the
// same, so a creep entering any exit tile can step straight into the room.
function assertExitsBacked(terrain: Terrain, roomName: string) {
	const isOpen = (xx: number, yy: number) => terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL;
	for (let ii = 1; ii < 49; ++ii) {
		for (const [ [ xx, yy ], [ ix, iy ] ] of [
			[ [ ii, 0 ], [ ii, 1 ] ],
			[ [ ii, 49 ], [ ii, 48 ] ],
			[ [ 0, ii ], [ 1, ii ] ],
			[ [ 49, ii ], [ 48, ii ] ],
		] as const) {
			if (isOpen(xx, yy)) {
				assert.ok(isOpen(ix, iy), `${roomName} exit at ${xx},${yy} backs onto wall`);
			}
		}
	}
}

const objectSnapshot = (room: Room) =>
	[ ...Fn.map(room['#objects'], object => `${object.id}@${object.pos.x},${object.pos.y}`) ].sort();

// The suite builds its worlds from nothing: drop the imported fixture world, keeping the clock.
async function emptyShard(shard: Shard) {
	await shard.data.flushdb();
	await shard.data.set('time', shard.time);
}

describe('scripts/room-gen', () => {
	test('walls a lone room off from the void', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await emptyShard(shard);
		// A normal room's terrain re-rolls until its objects fit; highway terrain cannot re-roll, so
		// a fully sealed crossing leans on the unreachable-fill guard to keep its ground.
		await generateRoom(shard, 'W5N5');
		await generateRoom(shard, 'E0S0', { controller: false, highway: 'crossing', mineral: false, sources: 0 });
		const { terrain } = await shard.loadWorld();
		for (const roomName of [ 'W5N5', 'E0S0' ]) {
			const record = terrain.get(roomName);
			assert.strictEqual(record?.exits, 0, `${roomName} is sealed`);
			assert.ok(Fn.some(Fn.range(2500), ii =>
				record.terrain.get(ii % 50, Math.floor(ii / 50)) !== C.TERRAIN_MASK_WALL),
			`${roomName} keeps its ground`);
		}
	});

	test('punches a sealed border when generating beside it', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await emptyShard(shard);
		// W5N5 is a center-type room, whose punch reopens deterministically; the seed pins the
		// terrain and span rolls.
		using rng = deterministicRandomForTesting();
		const built = await generateRoom(shard, 'W5N5');
		const objects = objectSnapshot(built);
		const sealedRecord = (await shard.loadWorld()).terrain.get('W5N5');
		assert.ok(sealedRecord !== undefined);
		const sealed = terrainString(sealedRecord.terrain);
		await generateRoom(shard, 'W4N5');
		const { terrain } = await shard.loadWorld();
		assertClosedWorld(terrain);
		// W4N5 lies east across W5N5's right border; the shared border rolled open, and W5N5's other
		// sides still face the void and stay sealed.
		const punched = terrain.get('W5N5');
		assert.strictEqual(punched?.exits, 2);
		assert.strictEqual(terrain.get('W4N5')?.exits, 8);
		assert.notStrictEqual(terrainString(punched.terrain), sealed, 'W5N5 was punched');
		assertPunchedOnly(sealed, terrainString(punched.terrain), 'W5N5');
		assertExitsReachGround(punched.terrain, 'W5N5');
		assertExitsBacked(punched.terrain, 'W5N5');
		assert.deepStrictEqual(objectSnapshot(await shard.loadRoom('W5N5')), objects);
	});

	test('reconnects every stretch of a gapped punch', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await emptyShard(shard);
		// This seed rolls the punched span with an interior gap, and the sealed maze cuts one of its
		// stretches off from the room's ground -- a punch anchored on any single tile would leave the
		// other stretch a dead end.
		using rng = deterministicRandomForTesting(4);
		await generateRoom(shard, 'W5N5');
		const sealedRecord = (await shard.loadWorld()).terrain.get('W5N5');
		assert.ok(sealedRecord !== undefined);
		const sealed = terrainString(sealedRecord.terrain);
		await generateRoom(shard, 'W4N5');
		const { terrain } = await shard.loadWorld();
		assertClosedWorld(terrain);
		const punched = terrain.get('W5N5');
		assert.ok(punched !== undefined);
		const stretches = [ ...Fn.range(1, 49) ]
			.filter(yy => punched.terrain.get(49, yy) !== C.TERRAIN_MASK_WALL &&
				punched.terrain.get(49, yy - 1) === C.TERRAIN_MASK_WALL)
			.length;
		assert.ok(stretches >= 2, `the punched span carries a gap (got ${stretches} stretch(es))`);
		assertPunchedOnly(sealed, terrainString(punched.terrain), 'W5N5');
		assertExitsReachGround(punched.terrain, 'W5N5');
		assertExitsBacked(punched.terrain, 'W5N5');
	});

	test('punches a room that is not the highway its name claims', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await emptyShard(shard);
		using rng = deterministicRandomForTesting();
		// `generateRoom` builds the caller's loadout as-is at any name, and an imported world's real
		// highways carry foreign walls the same way -- the punch has to work the stored terrain, not
		// regenerate the wall field the room's name suggests and erase the maze under it.
		await generateRoom(shard, 'W10N5');
		const sealedRecord = (await shard.loadWorld()).terrain.get('W10N5');
		assert.ok(sealedRecord !== undefined);
		const sealed = terrainString(sealedRecord.terrain);
		await generateRoom(shard, 'W10N6');
		const { terrain } = await shard.loadWorld();
		assertClosedWorld(terrain);
		const punched = terrain.get('W10N5');
		assert.ok(punched !== undefined);
		const after = terrainString(punched.terrain);
		assertPunchedOnly(sealed, after, 'W10N5');
		assertExitsReachGround(punched.terrain, 'W10N5');
		assertExitsBacked(punched.terrain, 'W10N5');
		// A punch opens at most a border span two tiles deep plus one carved slot per stretch;
		// regenerating the field would strip hundreds of the maze's interior walls.
		const changed = [ ...after ].filter((tile, ii) => tile !== sealed[ii]).length;
		assert.ok(changed < 150, `W10N5 lost ${changed} tiles`);
	});

	test('punches a player-held room like any other', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await emptyShard(shard);
		using rng = deterministicRandomForTesting();
		await generateRoom(shard, 'W5N5');
		const beforeRecord = (await shard.loadWorld()).terrain.get('W5N5');
		assert.ok(beforeRecord !== undefined);
		const before = terrainString(beforeRecord.terrain);
		const held = await shard.loadRoom('W5N5');
		const controller = Fn.find(held['#objects'], instanceOfPredicate(StructureController));
		assert.ok(controller !== undefined);
		controller['#user'] = '100';
		flushUsers(held);
		await shard.saveRoom('W5N5', shard.time, held);
		// The punch never touches the room's objects, so a player holding the room is no reason to
		// keep it sealed -- the world grows past it like any other.
		await generateRoom(shard, 'W4N5');
		const { terrain } = await shard.loadWorld();
		assertClosedWorld(terrain);
		const punched = terrain.get('W5N5');
		assert.strictEqual(punched?.exits, 2);
		assertPunchedOnly(before, terrainString(punched.terrain), 'W5N5');
		assertExitsReachGround(punched.terrain, 'W5N5');
		assertExitsBacked(punched.terrain, 'W5N5');
		const after = await shard.loadRoom('W5N5');
		const heldController = Fn.find(after['#objects'], instanceOfPredicate(StructureController));
		assert.strictEqual(heldController?.['#user'], '100');
	});

	test('seals a sector at the frontier and reopens it for the next', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await emptyShard(shard);
		using rng = deterministicRandomForTesting();
		const rooms = await generateSector(shard, 'W20N20');
		assert.strictEqual(rooms.length, 121);
		assertClosedWorld((await shard.loadWorld()).terrain);
		// Re-entering a complete sector builds nothing and punches nothing.
		assert.strictEqual((await generateSector(shard, 'W20N20')).length, 0);
		// The shared ring's outward borders were all frontier-sealed; the next sector punches them
		// open in place rather than rebuilding the rooms, so only its own 110 rooms are built.
		const ringNames = [ ...Fn.map(Fn.range(11), ii => `W30N${20 + ii}`) ];
		const worldBefore = await shard.loadWorld();
		const ringBefore = new Map(Fn.map(ringNames, name =>
			[ name, terrainString(worldBefore.terrain.get(name)!.terrain) ] as const));
		const nextRooms = await generateSector(shard, 'W30N20');
		assert.strictEqual(nextRooms.length, 110);
		const { terrain } = await shard.loadWorld();
		assertClosedWorld(terrain);
		for (const name of ringNames) {
			assertPunchedOnly(ringBefore.get(name)!, terrainString(terrain.get(name)!.terrain), name);
			assertExitsReachGround(terrain.get(name)!.terrain, name);
			assertExitsBacked(terrain.get(name)!.terrain, name);
		}
		// A crossing reopens its lane end deterministically, so the sectors connect along their
		// highway rings.
		assert.ok(((terrain.get('W30N20')?.exits ?? 0) & kSideInfo.left.bit) !== 0, 'the crossings reconnect');
		// The punched ring room sits on the edge of both sectors and carries both centers.
		assert.deepStrictEqual([ ...terrain.get('W30N25')?.sectors ?? [] ].sort(), [ 'W25N25', 'W35N25' ]);
		assert.ok(terrain.get('W25N25')?.sectorControl, 'the first sector keeps its control record');
	});
});

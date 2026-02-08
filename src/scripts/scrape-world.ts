import type { RoomObject } from 'xxscreeps/game/object.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import type { Store } from 'xxscreeps/mods/resource/store.js';
import type { Structure } from 'xxscreeps/mods/structure/structure.js';

import Loki from 'lokijs';
import jsYaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';

import Configs from 'xxscreeps/config/mods/import/config.js';
import config, { configPath } from 'xxscreeps/config/index.js';
import { checkArguments } from 'xxscreeps/config/arguments.js';

import { RoomPosition } from 'xxscreeps/game/position.js';
import { TerrainWriter, packExits } from 'xxscreeps/game/terrain.js';
import C from 'xxscreeps/game/constants/index.js';
import Fn from 'xxscreeps/utility/functional.js';

// Schemas
import * as CodeSchema from 'xxscreeps/engine/db/user/code.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import * as Badge from 'xxscreeps/engine/db/user/badge.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { saveMemoryBlob } from 'xxscreeps/mods/memory/model.js';
import { utf16ToBuffer } from 'xxscreeps/utility/string.js';
import { Room, flushUsers } from 'xxscreeps/game/room/room.js';

// Objects
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';
import { Source } from 'xxscreeps/mods/source/source.js';
import { StructureSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { StructureKeeperLair } from 'xxscreeps/mods/source/keeper-lair.js';
import { StructureExtension } from 'xxscreeps/mods/spawn/extension.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { StructureRoad } from 'xxscreeps/mods/road/road.js';
import { StructureRampart } from 'xxscreeps/mods/defense/rampart.js';
import { StructureWall } from 'xxscreeps/mods/defense/wall.js';
import { StructureExtractor } from 'xxscreeps/mods/mineral/extractor.js';
import { OpenStore, SingleStore } from 'xxscreeps/mods/resource/store.js';
import { merge } from 'xxscreeps/utility/utility.js';

const argv = checkArguments({
	argv: true,
	boolean: ['dont-overwrite', 'shard-only'] as const,
	string: ['overwrite-code'] as const
});
const dontOverwrite = argv['dont-overwrite'];
const shardOnly = argv['shard-only'];
const jsonSource = argv.argv[0] ??
	new URL('../init_dist/db.json', await import.meta.resolve!('@screeps/launcher', import.meta.url));

function forUser(userId: string | null) {
	return userId === 'f4b532d08c3952a' ? '1' : userId;
}

function withRoomObject(from: any, into: RoomObject) {
	into.id = from._id;
	into.pos = new RoomPosition(from.x, from.y, from.room);
	if (from.user !== undefined) {
		into['#user'] = forUser(from.user ?? null);
	}
}

function withStructure(from: any, into: Structure) {
	withRoomObject(from, into);
	if (from.hits) {
		into.hits = from.hits;
	}
}

function withStore(from: any, into: { store: Store }) {
	for (const type in from.store) {
		into.store['#add'](type as ResourceType, from.store[type]);
	}
}

// Create .screepsrc.yaml
const rcInfo = await fs.stat(configPath).catch(() => undefined);
if ((rcInfo?.size ?? 0) === 0) {
	console.log('Writing default `.screepsrc.yaml`');

	// Get default `mods`
	const fetched = new Set<string>();
	const mods = new Set<string>(config.mods);
	const fetch = async function(specifier: string, depth: number) {
		if (depth === 0 || fetched.has(specifier)) {
			return;
		}
		fetched.add(specifier);
		try {
			// Find `package.json` for this specifier
			const indexPath = new URL(await import.meta.resolve!(specifier, `${configPath}`));
			const packagePath = await async function() {
				let path = indexPath;
				while (true) {
					const packagePath = new URL('package.json', path);
					try {
						await fs.stat(packagePath);
						return packagePath;
					} catch (err) {}
					const next = new URL('..', path);
					if (`${next}` === `${path}`) {
						return;
					}
					path = next;
				}
			}();
			// Read package.json contents
			if (packagePath) {
				const info = JSON.parse(await fs.readFile(packagePath, 'utf8'));
				const dependencies = Object.keys(info.dependencies ?? {});
				await Promise.all(dependencies.map(specifier => fetch(specifier, depth - 1)));
				if (info.xxscreeps) {
					mods.add(info.name);
				}
			}
		} catch (err) {}
	};
	await fetch('.', 2);

	// Write yaml content
	const schema = await (async () => {
		try {
			return await import.meta.resolve!('xxscreeps/config/mods.static/config.schema.json');
		} catch {
			return undefined;
		}
	})();
	const preamble = schema ? `# yaml-language-server: $schema=${schema}\n` : '';
	const defaultConfig: any = {};
	for (const modConfig of Configs) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		merge(defaultConfig, modConfig.configDefaults ?? {});
	}
	defaultConfig.mods = [ ...mods ];
	await fs.writeFile(configPath, preamble + jsYaml.dump(defaultConfig));
}

// Initialize import source
const loki = new Loki(jsonSource as string);
await new Promise<void>((resolve, reject) => {
	loki.loadDatabase({}, (err?: Error) => err ? reject(err) : resolve());
});
const env = loki.getCollection('env').findOne().data;
const gameTime: number = env.gameTime - 1;

// Initialize and connect to database & shard
const db = await Database.connect();
if (dontOverwrite && await db.data.scard('users') > 0) {
	console.log('Found existing data, exiting');
	process.exit(0);
}
{
	// Flush databases at the same time because they may point to the same service
	const shard = await Shard.connect(db, 'shard0');
	await Promise.all([
		shardOnly ? undefined : db.data.flushdb(),
		shard.data.flushdb(),
	]);
	// Initialize blank database
	await shard.data.set('time', gameTime);
	await Promise.all([
		shardOnly ? undefined : db.data.save(),
		shard.data.save(),
	]);
	shard.disconnect();
}
const shard = await Shard.connect(db, 'shard0');
const { data } = shard;

// Save terrain data
const roomsTerrain = new Map(loki.getCollection('rooms.terrain').find().map(({ room, terrain }) => {
	const writer = new TerrainWriter;
	for (let xx = 0; xx < 50; ++xx) {
		for (let yy = 0; yy < 50; ++yy) {
			// 3 == WALL + SWAMP.. turn that back into WALL
			const value = Number(terrain[yy * 50 + xx]);
			writer.set(xx, yy, value > 2 ? 1 : value);
		}
	}
	return [ room as string, {
		exits: packExits(writer),
		terrain: writer,
	} ];
}));
await data.set('terrain', makeWriter(MapSchema.schema)(roomsTerrain));

// Collect room data
const roomObjects = loki.getCollection('rooms.objects');
const rooms = loki.getCollection('rooms').find().map(room => {
	const objects = roomObjects.find({ room: room._id });
	const instance = new Room;
	instance.name = room._id;
	instance['#level'] = -1;
	instance['#objects'] = [ ...Fn.filter(objects.map(object => {
		switch (object.type) {
			case 'constructedWall': {
				const wall = new StructureWall;
				withStructure(object, wall);
				return wall;
			}

			case 'controller': {
				instance['#level'] = object.level ?? 0;
				instance['#safeModeUntil'] = object.safeMode;
				instance['#user'] = forUser(object.user ?? null);

				const controller = new StructureController;
				withStructure(object, controller);
				controller.isPowerEnabled = object.isPowerEnabled;
				controller.safeModeAvailable = object.safeModeAvailable;
				controller['#downgradeTime'] = object.downgradeTime;
				controller['#progress'] = object.progress;
				controller['#safeModeCooldownTime'] = object.safeModeCooldown;
				controller['#upgradeBlockedUntil'] = object.upgradeBlocked;
				return controller;
			}

			case 'creep': {
				const creep = new Creep;
				withRoomObject(object, creep);
				creep.store = OpenStore['#create'](object.storeCapacity);
				withStore(object, creep);
				creep.body = object.body;
				creep.hits = object.hits;
				creep.name = object.name;
				creep['#ageTime'] = object.ageTime;
				return creep;
			}

			case 'extension': {
				const extension = new StructureExtension;
				withStructure(object, extension);
				extension.store = SingleStore['#create'](C.RESOURCE_ENERGY, object.storeCapacityResource.energy);
				withStore(object, extension);
				return extension;
			}

			case 'extractor': {
				const extractor = new StructureExtractor;
				withStructure(object, extractor);
				return extractor;
			}

			case 'keeperLair': {
				const keeperLair = new StructureKeeperLair;
				withStructure(object, keeperLair);
				keeperLair['#user'] = '3';
				return keeperLair;
			}

			case 'mineral': {
				const mineral = new Mineral;
				withRoomObject(object, mineral);
				mineral.density = object.density;
				mineral.mineralAmount = object.mineralAmount;
				mineral.mineralType = object.mineralType;
				return mineral;
			}

			case 'rampart': {
				const rampart = new StructureRampart;
				withStructure(object, rampart);
				rampart.isPublic = object.isPublic;
				rampart['#nextDecayTime'] = object.nextDecayTime;
				return rampart;
			}

			case 'road': {
				const road = new StructureRoad;
				withStructure(object, road);
				road['#terrain'] = roomsTerrain.get(road.pos.roomName)!.terrain.get(road.pos.x, road.pos.y);
				road['#nextDecayTime'] = object.nextDecayTime;
				return road;
			}

			case 'source': {
				const source = new Source;
				withRoomObject(object, source);
				source.energy = object.energy;
				source.energyCapacity = object.energyCapacity;
				source['#nextRegenerationTime'] = gameTime + (object.ticksToRegeneration as number);
				return source;
			}

			case 'spawn': {
				const spawn = new StructureSpawn;
				withStructure(object, spawn);
				spawn.store = SingleStore['#create'](C.RESOURCE_ENERGY, object.storeCapacityResource.energy);
				withStore(object, spawn);
				spawn.name = object.name;
				return spawn;
			}
		}
	})) ];
	flushUsers(instance);
	return instance;
});

// Save rooms
const roomNames = new Set(Fn.map(rooms, room => room.name));
await shard.data.sadd('rooms', [ ...roomNames ]);
for (const room of rooms) {
	await shard.saveRoom(room.name, gameTime, room as never);
}

// Save users
if (!shardOnly) {
	const code = loki.getCollection('users.code');
	const users = loki.getCollection('users');
	const activeUserIds = new Set<string>();
	for (const user of users.find()) {
		const id = forUser(user._id)!;
		const branch = code.find({ user: id, activeWorld: true })[0]?.branch ?? '';
		const memory: string | undefined = env[`memory:${id}`];
		if (user.active && user.cpu > 0) {
			activeUserIds.add(id);
		}
		await User.create(db, id, user.username);
		if (user.badge) {
			await Badge.save(db, id, JSON.stringify(user.badge));
		}
		await db.data.hmset(User.infoKey(id), {
			branch,
			...user.registeredDate && {
				registeredDate: +new Date(user.registeredDate),
			},
		});
		if (memory !== undefined) {
			await saveMemoryBlob(shard, id, utf16ToBuffer(memory));
		}
	}

	// Save user code content
	const overwriteModules = new Map<string, string>()
	const codePath = argv['overwrite-code']
	if (codePath) {
		const names = await fs.readdir(codePath)
		const files = await Promise.all(names.map(async name => {
			const data = await fs.readFile(path.join(codePath, name), 'utf8')
			return { name, data }
		}))
		for (const { name, data } of files) {
			overwriteModules.set(name, data)
		}
	}
	for (const branch of code.find()) {
		const modules = overwriteModules.size ? overwriteModules : new Map(Object.entries(branch.modules).map(([ key, data ]) => {
			const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
			return [ name, data as string ];
		}));
		await CodeSchema.saveContent(db, forUser(branch.user)!, branch.branch, modules);
	}
}

// Finish up
await db.save();
await shard.save();
db.disconnect();
shard.disconnect();

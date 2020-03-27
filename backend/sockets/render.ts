import { RoomObject } from '~/game/objects/room-object';
import { Creep } from '~/game/objects/creep';
import { Source } from '~/game/objects/source';
import { Structure } from '~/game/objects/structures';
import { StructureController } from '~/game/objects/structures/controller';
import { StructureSpawn } from '~/game/objects/structures/spawn';
import { Store, CapacityByResource } from '~/game/store';
import { Variant } from '~/lib/schema';

export const Render: unique symbol = Symbol('render');
function bindRenderer<Type>(impl: Constructor<Type>, renderer: (this: Type) => object) {
	impl.prototype[Render] = renderer;
}

function renderObject(object: RoomObject) {
	return {
		_id: object.id,
		type: object[Variant],
		x: object.pos.x,
		y: object.pos.y,
		user: '123',
		//user: (object as any)[Owner],
	};
}

function renderStructure(structure: Structure) {
	return {
		...renderObject(structure),
		structureType: structure.structureType,
	};
}

function renderStore(store: Store) {
	const result: any = {
		store: { ...store },
		storeCapacity: store.getCapacity(),
	};
	if (store[CapacityByResource]) {
		const capacityByResource: any = {};
		for (const [ resourceType, value ] of store[CapacityByResource]!.entries()) {
			capacityByResource[resourceType] = value;
		}
		result.storeCapacityResource = capacityByResource;
	}
	return result;
}

bindRenderer(Creep, function render() {
	return {
		...renderObject(this),
		...renderStore(this.store),
		name: this.name,
		body: this.body,
		hits: this.hits,
		hitsMax: 100,
		spawning: false,
		fatigue: 0,
		ageTime: 0,
		actionLog: {
			attacked: null,
			healed: null,
			attack: null,
			rangedAttack: null,
			rangedMassAttack: null,
			rangedHeal: null,
			harvest: null,
			heal: null,
			repair: null,
			build: null,
			say: null,
			upgradeController: null,
			reserveController: null,
		},
	};
});

bindRenderer(Source, function render() {
	return {
		_id: this.id,
		type: 'source',
		x: this.pos.x,
		y: this.pos.y,
		energy: this.energy,
		energyCapacity: this.energyCapacity,
		ticksToRegeneration: this.ticksToRegeneration,
	};
});

bindRenderer(StructureController, function render() {
	return {
		...renderStructure(this),
		type: 'controller',
		level: this.level,
		progress: this.progress,
		downgradeTime: this.ticksToDowngrade,
		safeMode: 0,
	};
});

bindRenderer(StructureSpawn, function render() {
	return {
		...renderStructure(this),
		...renderStore(this.store),
		name: this.name,
		hits: this.hits,
		hitsMax: 100,
	};
});

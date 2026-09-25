const building = require('building');
const roleBuilder = require('role.builder');
const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const tower = require('tower');

module.exports.loop = function() {
	building.run(Game.spawns.Spawn1);

	const towers = Game.spawns.Spawn1.room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER, my: true } });
	towers.forEach(tower.run);

	for (const name in Game.creeps) {
		const creep = Game.creeps[name];

		if (creep.memory.role === 'harvester') {
			roleHarvester.run(creep);
		}
		if (creep.memory.role === 'upgrader') {
			roleUpgrader.run(creep);
		}
		if (creep.memory.role === 'builder') {
			roleBuilder.run(creep);
		}
	}
};

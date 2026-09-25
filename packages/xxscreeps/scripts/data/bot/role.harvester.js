const roleHarvester = {
	/** @param {Creep} creep **/
	run(creep) {
		if (creep.carry.energy < creep.carryCapacity) {
			const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
			if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
				creep.moveTo(source);
			}
		} else {
			const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
				filter: structure => (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN ||
                        structure.structureType === STRUCTURE_TOWER) && structure.energy < structure.energyCapacity,
			});
			if (target) {
				if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
					creep.moveTo(target);
				}
			}
		}
	},
};

module.exports = roleHarvester;

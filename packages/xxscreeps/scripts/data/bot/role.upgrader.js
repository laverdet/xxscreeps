const roleUpgrader = {
	/** @param {Creep} creep **/
	run(creep) {

		if (creep.memory.upgrading && creep.carry.energy === 0) {
			creep.memory.upgrading = false;
			creep.say('harvesting');
		}
		if (!creep.memory.upgrading && creep.carry.energy === creep.carryCapacity) {
			creep.memory.upgrading = true;
			creep.say('upgrading');
		}

		if (creep.memory.upgrading) {
			if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
				creep.moveTo(creep.room.controller);
			}
		} else {
			const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
			if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
				creep.moveTo(source);
			}
		}
	},
};

module.exports = roleUpgrader;

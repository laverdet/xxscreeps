module.exports = {
	run(tower) {
		const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
			filter: structure => structure.hits < structure.hitsMax,
		});
		if (closestDamagedStructure) {
			tower.repair(closestDamagedStructure);
		}

		const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
		if (closestHostile) {
			tower.attack(closestHostile);
		}
	},
};

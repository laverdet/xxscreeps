function getRandomFreePos(startPos, distance) {
    var x,y;
    do {
        x = startPos.x + Math.floor(Math.random()*(distance*2+1)) - distance;
        y = startPos.y + Math.floor(Math.random()*(distance*2+1)) - distance;
    }
    while((x+y)%2 != (startPos.x+startPos.y)%2 || Game.map.getTerrainAt(x,y,startPos.roomName) == 'wall');
    return new RoomPosition(x,y,startPos.roomName);
}

function build(spawn, structureType) {
    var structures = spawn.room.find(FIND_STRUCTURES, {filter: {structureType, my: true}});
    for(var i=0; i < CONTROLLER_STRUCTURES[structureType][spawn.room.controller.level] - structures.length; i++) {
        getRandomFreePos(spawn.pos, 5).createConstructionSite(structureType);
    }
}

function calcBodyCost(body) {
    return _.reduce(body, (sum, part) => sum + BODYPART_COST[part], 0);
}

exports.run = function(spawn) {

    build(spawn, STRUCTURE_EXTENSION);
    build(spawn, STRUCTURE_TOWER);

    var workerBody = [], bodyIteration = [MOVE,MOVE,WORK,CARRY];
    while(calcBodyCost(workerBody) + calcBodyCost(bodyIteration) <= Game.spawns.Spawn1.room.energyAvailable) {
        workerBody = workerBody.concat(bodyIteration);
    }

    spawn.createCreep(workerBody, 'u2', {role: 'upgrader'});
    spawn.createCreep(workerBody, 'u1', {role: 'upgrader'});
    if(spawn.room.find(FIND_CONSTRUCTION_SITES).length > 0) {
        spawn.createCreep(workerBody, 'b1', {role: 'builder'});
    }
    spawn.createCreep(workerBody, 'h2', {role: 'harvester'});
    spawn.createCreep(workerBody, 'h1', {role: 'harvester'});
}

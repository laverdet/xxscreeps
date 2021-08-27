import * as C from "xxscreeps/game/constants";
import { RoomPosition } from "xxscreeps/game/position";
import { assert, describe, simulate, test } from "xxscreeps/test";
import { create } from "./creep";

describe("Movement", () => {
  const movement = simulate({
    W0N0: (room) => {
      room["#insertObject"](
        create(new RoomPosition(25, 25, "W0N0"), [C.MOVE], "topLeft", "100")
      );
      room["#insertObject"](
        create(new RoomPosition(26, 25, "W0N0"), [C.MOVE], "topRight", "100")
      );
      room["#insertObject"](
        create(new RoomPosition(25, 26, "W0N0"), [C.MOVE], "bottomLeft", "100")
      );
      room["#insertObject"](
        create(new RoomPosition(26, 26, "W0N0"), [C.MOVE], "bottomRight", "100")
      );
    },
  });

  test("following", () =>
    movement(async ({ player, tick }) => {
      await player("100", (Game) => {
        Game.creeps.topLeft.move(C.RIGHT);
        Game.creeps.topRight.move(C.RIGHT);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(26, 25, "W0N0"))
        );
        assert.ok(
          Game.creeps.topRight.pos.isEqualTo(new RoomPosition(27, 25, "W0N0"))
        );
      });
    }));

  test("swapping", () =>
    movement(async ({ player, tick }) => {
      await player("100", (Game) => {
        Game.creeps.bottomLeft.move(C.TOP);
        Game.creeps.bottomRight.move(C.LEFT);
        Game.creeps.topLeft.move(C.RIGHT);
        Game.creeps.topRight.move(C.LEFT);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(26, 25, "W0N0"))
        );
        assert.ok(
          Game.creeps.topRight.pos.isEqualTo(new RoomPosition(25, 25, "W0N0"))
        );
        assert.ok(
          Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, "W0N0"))
        );
        assert.ok(
          Game.creeps.bottomRight.pos.isEqualTo(
            new RoomPosition(26, 26, "W0N0")
          )
        );
      });
    }));

  test("swapping second", () =>
    movement(async ({ player, tick }) => {
      await player("100", (Game) => {
        Game.creeps.topLeft.move(C.RIGHT);
        Game.creeps.topRight.move(C.LEFT);
        Game.creeps.bottomLeft.move(C.TOP);
        Game.creeps.bottomRight.move(C.LEFT);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(26, 25, "W0N0"))
        );
        assert.ok(
          Game.creeps.topRight.pos.isEqualTo(new RoomPosition(25, 25, "W0N0"))
        );
        assert.ok(
          Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, "W0N0"))
        );
        assert.ok(
          Game.creeps.bottomRight.pos.isEqualTo(
            new RoomPosition(26, 26, "W0N0")
          )
        );
      });
    }));

  test("with followers", () =>
    movement(async ({ player, tick }) => {
      await player("100", (Game) => {
        Game.creeps.bottomLeft.move(C.TOP_LEFT);
        Game.creeps.topLeft.move(C.LEFT);
        Game.creeps.topRight.move(C.LEFT);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(24, 25, "W0N0"))
        );
        assert.ok(
          Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, "W0N0"))
        );
      });
    }));

  const fastSlow = simulate({
    W0N0: (room) => {
      room["#insertObject"](
        create(
          new RoomPosition(25, 25, "W0N0"),
          [C.MOVE, C.MOVE],
          "topLeft",
          "100"
        )
      );
      room["#insertObject"](
        create(new RoomPosition(25, 26, "W0N0"), [C.MOVE], "bottomLeft", "100")
      );
    },
  });

  test("fast wins", () =>
    fastSlow(async ({ player, tick }) => {
      await player("100", (Game) => {
        Game.creeps.bottomLeft.move(C.TOP_LEFT);
        Game.creeps.topLeft.move(C.LEFT);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, "W0N0"))
        );
        assert.ok(
          Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(24, 25, "W0N0"))
        );
      });
    }));

  const hostile = simulate({
    W1N1: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room.controller!.safeModeAvailable = 1;
      room["#insertObject"](
        create(new RoomPosition(25, 25, "W1N1"), [C.MOVE], "creep", "100")
      );
      room["#insertObject"](
        create(
          new RoomPosition(25, 26, "W1N1"),
          [C.MOVE, C.MOVE],
          "creep",
          "101"
        )
      );
    },
  });
  test("safe mode", () =>
    hostile(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(
          Game.rooms.W1N1.controller!.activateSafeMode(),
          C.OK
        );
      });
      await tick();
      await player("100", (Game) => {
        assert.strictEqual(Game.creeps.creep.move(C.BOTTOM), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.creep.pos.isEqualTo(new RoomPosition(25, 26, "W1N1"))
        );
        assert.strictEqual(Game.creeps.creep.move(C.TOP), C.OK);
      });
      await player("101", (Game) => {
        assert.strictEqual(Game.creeps.creep.move(C.TOP), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.creep.pos.isEqualTo(new RoomPosition(25, 25, "W1N1"))
        );
      });
    }));
	
  const enterHostileTakenPosition = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room["#safeModeUntil"] = 100;
      room["#insertObject"](create(new RoomPosition(20, 20, "W2N2"), [C.MOVE], "owner", "100"));
      room["#insertObject"](create(new RoomPosition(20, 21, "W2N2"), [C.MOVE], "hostile", "101"));
    },
  });
  test("safe mode - owner enters position occupied by hostile", () =>
    enterHostileTakenPosition(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller?.safeMode != undefined, true);
      });
      await player("100", (Game) => {
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 20, "W2N2")));
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
      });
    }));

  const enterSameTile = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room["#safeModeUntil"] = 100;
      room["#insertObject"](create(new RoomPosition(20, 20, "W2N2"), [C.MOVE], "owner", "100"));
      room["#insertObject"](create(new RoomPosition(20, 22, "W2N2"), [C.MOVE], "hostile", "101"));
    },
  });
  test("safe mode - owner&hostile try to enter same empty tile - owner moves", () =>
    enterSameTile(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller?.safeMode != undefined, true);
      });
      await player("100", (Game) => {
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 20, "W2N2")));
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await player("101", (Game) => {
        assert.ok(Game.creeps.hostile.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
        assert.strictEqual(Game.creeps.hostile.move(C.TOP), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
      });
      await player("101", (Game) => { 
        assert.ok(Game.creeps.hostile.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
      });
    }));
    
    
  const enterSameTileOwnerObstacle = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room["#safeModeUntil"] = 100;
      room["#insertObject"](create(new RoomPosition(20, 20, "W2N2"), [C.MOVE], "owner", "100"));
      room["#insertObject"](create(new RoomPosition(20, 21, "W2N2"), [C.MOVE], "ownerObstacle", "100"));
      room["#insertObject"](create(new RoomPosition(20, 22, "W2N2"), [C.MOVE, C.MOVE], "hostile2", "101"));
    },
  });
  test("safe mode - owner&hostile want to enter a ownerObstacle position - noone moves", () =>
    enterSameTileOwnerObstacle(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller?.safeMode != undefined, true);
      });
      await player("100", (Game) => {
        assert.ok(Game.creeps.ownerObstacle.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 20, "W2N2")));
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await player("101", (Game) => {
        assert.ok(Game.creeps.hostile2.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
        assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(Game.creeps.ownerObstacle.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 20, "W2N2")));
      });
      await player("101", (Game) => {
        assert.ok(Game.creeps.hostile2.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
      });
    }));

  const enterSameTileHostileObstacle = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room["#safeModeUntil"] = 100;
      room["#insertObject"](create(new RoomPosition(20, 20, "W2N2"), [C.MOVE], "owner", "100"));
      room["#insertObject"](create(new RoomPosition(20, 21, "W2N2"), [C.MOVE], "hostileObstacle", "101"));
      room["#insertObject"](create(new RoomPosition(20, 22, "W2N2"), [C.MOVE, C.MOVE], "hostile2", "101"));
    },
  });
  test("safe mode - owner&hostile want to enter a hostile2-occupied position - owner moves", () =>
    enterSameTileHostileObstacle(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller?.safeMode != undefined, true);
      });
      await player("100", (Game) => {
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 20, "W2N2")));
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await player("101", (Game) => {
        assert.ok(Game.creeps.hostileObstacle.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
        assert.ok(Game.creeps.hostile2.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
        assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
      });
      await player("101", (Game) => {
        assert.ok(Game.creeps.hostileObstacle.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
        assert.ok(Game.creeps.hostile2.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
      });
    }));

  const enterPossiblyFreeTile = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room["#safeModeUntil"] = 100;
      room["#insertObject"](create(new RoomPosition(20, 20, "W2N2"), [C.MOVE], "owner", "100"));
      room["#insertObject"](create(new RoomPosition(19, 21, "W2N2"), [C.MOVE], "ownerObstacle", "100"));
      room["#insertObject"](create(new RoomPosition(20, 21, "W2N2"), [C.MOVE], "hostile", "101"));
      room["#insertObject"](create(new RoomPosition(20, 22, "W2N2"), [C.MOVE, C.MOVE], "hostile2", "101"));
    },
  });
  test("safe mode - owner&hostile2 try to enter position occupied by hostile, who try to move to blocked position - owner moves", () =>
    enterPossiblyFreeTile(async ({ player, tick }) => {
    // tick1
    // ownerObstacle does not move
    // onwer -> hostile (success -> room is in safemode so can walk on-top of enemy player creeps)
    // hostile -> ownerObstacle (fail -> ownerObstacle in place)
    // hostile2 -> hostile (fail -> hostile in position )
      await player("100", (Game) => {
        assert.strictEqual(
          Game.rooms.W2N2.controller?.safeMode != undefined,
          true
        );
      });
      await player("100", (Game) => {
        assert.ok(Game.creeps.ownerObstacle.pos.isEqualTo(new RoomPosition(19, 21, "W2N2")));
        
        // try to move into hostile position
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 20, "W2N2")));
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await player("101", (Game) => {
        // try to move into ownerObstacle position
        assert.ok(Game.creeps.hostile.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
        assert.strictEqual(Game.creeps.hostile.move(C.LEFT), C.OK);
        
        // try to move into hostile position
        assert.ok(Game.creeps.hostile2.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
        assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
      });
      await tick();
      await player("101", (Game) => {
        // hostile&hostile2 did not move
        assert.ok(Game.creeps.hostile.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")));
        assert.ok(Game.creeps.hostile2.pos.isEqualTo(new RoomPosition(20, 22, "W2N2")));
      });
      await player("100", (Game) => {
        // owner moved to hostile position
        assert.ok(Game.creeps.owner.pos.isEqualTo(new RoomPosition(20, 21, "W2N2")), `Owner.pos:${Game.creeps.owner.pos} should be ${new RoomPosition(20, 21, "W2N2")}`);
        assert.ok(Game.creeps.owner2.pos.isEqualTo(new RoomPosition(19, 21, "W2N2")));
      });
    }));
});


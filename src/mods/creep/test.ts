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
  const moveThrough = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room["#safeModeUntil"] = 100;
      room["#insertObject"](
        create(new RoomPosition(1, 1, "W2N2"), [C.MOVE], "owner", "100")
      );
      room["#insertObject"](
        create(new RoomPosition(1, 2, "W2N2"), [C.MOVE], "hostile", "101")
      );
    },
  });
  test("safe mode walk-through hostile creep", () =>
    moveThrough(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(
          Game.rooms.W2N2.controller?.safeMode != undefined,
          true
        );
      });
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.owner.pos.isEqualTo(new RoomPosition(1, 1, "W2N2"))
        );
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.owner.pos.isEqualTo(new RoomPosition(1, 2, "W2N2"))
        );
        assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
      });
      await player("101", (Game) => {
        assert.ok(
          Game.creeps.owner.pos.isEqualTo(new RoomPosition(1, 2, "W2N2"))
        );
        assert.strictEqual(Game.creeps.hostile.move(C.BOTTOM), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.ok(
          Game.creeps.owner.pos.isEqualTo(new RoomPosition(1, 3, "W2N2"))
        );
      });
      await player("101", (Game) => {
        assert.ok(
          Game.creeps.owner.pos.isEqualTo(new RoomPosition(1, 3, "W2N2"))
        );
      });
    }));
});

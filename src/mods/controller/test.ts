import * as C from "xxscreeps/game/constants";
import { assert, describe, simulate, test } from "xxscreeps/test";

describe("Safe Mode", () => {
  const noSafeMode = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room.controller!.safeModeAvailable =  1;
    },
  });
  test("No safe-mode controller returns undefined for safeMode property", () =>
    noSafeMode(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
      });
    }));
  test("Can trigger safe-mode in owned room when no other safe-mode active", () =>
    noSafeMode(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert.strictEqual(Game.rooms.W2N2.controller!.activateSafeMode(), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode != undefined);
      });
    }));
  test("Triggering safe mode sets correct Safe-Mode duration ", () =>
    noSafeMode(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert.strictEqual(Game.rooms.W2N2.controller!.activateSafeMode(), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller!.safeModeCooldown, C.SAFE_MODE_COOLDOWN - 1);
      });
    }));
  test("Triggering safe mode  sets correct Safe-Mode cooldown on controller", () =>
    noSafeMode(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert.strictEqual(Game.rooms.W2N2.controller!.activateSafeMode(), C.OK);
      });
      await tick();
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller!.safeModeCooldown,  C.SAFE_MODE_COOLDOWN - 1);
      });
    }));
  const singleRoomInSafeMode = simulate({
    W1N1: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room.controller!.safeModeAvailable =  1;
      room["#safeModeUntil"] = 100;
    }
  });
  test("Cannot trigger safe-mode in room already in safe-mode", () =>
    singleRoomInSafeMode(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W1N1.controller!.safeMode, 99);
        assert.strictEqual(
          Game.rooms.W1N1.controller!.activateSafeMode(),
          C.ERR_BUSY
        );
      });
      await tick();
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W1N1.controller!.safeMode, 98);
      });
    }));

  const oneRoomInSafeModeSecondWithout = simulate({
    W2N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room.controller!.safeModeAvailable =  1;
      room["#safeModeUntil"] = 100;
    },
    W3N2: (room) => {
      room["#level"] = 1;
      room["#user"] = room.controller!["#user"] = "100";
      room.controller!.safeModeAvailable =  1;
    },
  });
  test("Cannot trigger safe-mode if one of owned rooms already has one", () =>
    oneRoomInSafeModeSecondWithout(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller!.safeMode, 99);
        assert.strictEqual(Game.rooms.W3N2.controller!.safeMode, undefined);
        assert.strictEqual(
          Game.rooms.W3N2.controller!.activateSafeMode(),
          C.ERR_BUSY
        );
      });
      await tick();
      await player("100", (Game) => {
        assert.strictEqual(Game.rooms.W2N2.controller!.safeMode, 98);
        assert.strictEqual(Game.rooms.W3N2.controller!.safeMode, undefined);
      });
    }));
    
     const haveRoomWithSafeModeCooldown = simulate({
        W2N2: (room) => {
            room["#level"] = 1;
            room["#user"] = room.controller!["#user"] = "100";
            room.controller!.safeModeAvailable =  1;
            room.controller!["#safeModeCooldownTime"] =  2000;
        }
    });
    test("Cannot trigger safe-mode in room with safe-mode on cooldown", () =>
    haveRoomWithSafeModeCooldown(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert(Game.rooms.W2N2.controller!.safeModeCooldown! > 0);
        assert.strictEqual(
          Game.rooms.W2N2.controller!.activateSafeMode(),
          C.ERR_TIRED
        );
      });
      await tick();
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert(Game.rooms.W2N2.controller!.safeModeCooldown! > 0);
      });
    }));

    const haveRoomWithNoSafeModeAvaialble = simulate({
        W2N2: (room) => {
            room["#level"] = 1;
            room["#user"] = room.controller!["#user"] = "100";
            room.controller!.safeModeAvailable = 0;
        }
    });
    test("Cannot trigger safe-mode in room without safe-mode available", () =>
    haveRoomWithNoSafeModeAvaialble(async ({ player, tick }) => {
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert(Game.rooms.W2N2.controller!.safeModeAvailable == 0);
        assert.strictEqual(
          Game.rooms.W2N2.controller!.activateSafeMode(),
          C.ERR_NOT_ENOUGH_RESOURCES
        );
      });
      await tick();
      await player("100", (Game) => {
        assert(Game.rooms.W2N2.controller!.safeMode == undefined);
        assert(Game.rooms.W2N2.controller!.safeModeCooldown == undefined);
      });
    }));
});

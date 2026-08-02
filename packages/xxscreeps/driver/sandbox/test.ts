import { describe, simulate, test } from 'xxscreeps/test/index.js';

// `registerGlobal(Creep)` publishes a class under whatever `Creep.name` says at runtime, so the
// names have to survive the build the isolated sandbox does of the runtime. They did not: webpack
// minifies that bundle, and a mangled `class CN {}` reached the sandbox as a global named `CN`.
// Player code asking for `Creep` — or `RoomVisual`, or any other class — got a `ReferenceError`.
//
// The rest of the suite runs in the unsafe sandbox, which shares this realm and never goes near
// webpack, so nothing else here can catch this.
describe('driver/sandbox', () => {
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 1;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('game classes reach the isolated sandbox under their own names', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', () => {
			// No closures: this arrives in the isolate as source text.
			const global = globalThis as unknown as Record<string, unknown>;
			// A class from the core runtime, one from a mod, and one whose name is spelled out at
			// registration — the last one keeps working even when the other two do not, which is what
			// made the failure look like it was about one mod.
			const names = [ 'RoomObject', 'RoomPosition', 'Room', 'Creep', 'Structure', 'Flag', 'RoomVisual', 'PathFinder' ];
			const missing = names.filter(name => global[name] === undefined);
			if (missing.length > 0) {
				throw new Error(`missing from the player sandbox: ${missing.join(', ')}`);
			}
		}, { isolated: true });
		await tick(1);
	}));
});

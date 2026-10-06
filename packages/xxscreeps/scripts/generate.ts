import { checkArguments } from 'xxscreeps/config/arguments.js';
import { initializeWorld, worldArguments } from 'xxscreeps/scripts/import.js';
import { generateWorld } from 'xxscreeps/scripts/room-gen.js';

// Seeds a new server with a generated world: one sector, spanning the same rooms as the map `import`
// bundles.
async function main() {
	const argv = checkArguments(worldArguments);
	await initializeWorld(argv, () => generateWorld('W0N0'));
}

if (process.argv[1] === 'generate') {
	await main();
}

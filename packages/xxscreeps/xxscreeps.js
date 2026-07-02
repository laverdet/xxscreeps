#!/usr/bin/env node
import 'xxscreeps/config/mods.js';

// Get script and remove `xxscreeps.js` from args
process.argv.splice(1, 1);
const specifier = process.argv[1];

// Launch entry command
const commands = {
	import: './dist/scripts/scrape-world.js',
	manage: './dist/scripts/manage.js',
	'generate-room': './dist/scripts/generate-room.js',
	start: './dist/engine/service/launcher.js',
	main: './dist/engine/service/main.js',
	backend: './dist/backend/server.js',
	cli: './dist/cli/cli.js',
	eval: './dist/cli/eval.js',
	processor: './dist/engine/service/processor.js',
	runner: './dist/engine/service/runner.js',
	test: './dist/test/run.js',
};
const command = specifier.startsWith('file:') ? specifier : commands[specifier ?? 'cli'];
if (command === undefined) {
	console.error(`Invalid command '${specifier}', built in commands are ${Object.keys(commands).join(', ')}`);
	process.exit(1);
} else {
	await import(command);
}

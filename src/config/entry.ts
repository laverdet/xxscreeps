#!/usr/bin/env node
// `registerStorageProvider` needs to be imported early to allow local keyval/blob providers to
// register
import 'xxscreeps/engine/db/storage/register';

// Get script and remove `dist/config/entry.js` from args
process.argv.splice(1, 1);
const specifier = process.argv[1];

// Load mods
await import('./mods');

if (specifier) {
	// Run
	const base = new URL('../..', import.meta.url);
	await import(`${new URL(specifier, base)}`);
} else {
	// Start repl
	const repl = await import('repl');
	repl.start('> ');
}

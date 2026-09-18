import * as fs from 'node:fs/promises';
import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { mappedInvertedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { exportPayload } from 'xxscreeps/scripts/payload.js';

const plural = (count: number) => count === 1 ? '' : 's';

async function main() {
	const argv = checkArguments({
		argv: true,
		string: [ 'shard' ] as const,
	});
	const file = argv.argv[0];
	if (!file?.endsWith('.json')) {
		console.log('Usage: xxscreeps export <file.json> [--shard shard]');
		process.exitCode = 1;
		return;
	}

	await using db = await Database.connect();
	await using shard = await Shard.connect(db, argv.shard ?? config.shards[0]!.name);
	const { payload, dropped } = await exportPayload(shard);
	await fs.writeFile(file, JSON.stringify(payload, null, 1));
	const count = Object.keys(payload).length;
	console.log(`Exported ${count} room${plural(count)} to ${file}`);
	if (dropped.size > 0) {
		const total = Fn.accumulate(dropped.values());
		const byCount = [ ...dropped ].sort(mappedInvertedNumericComparator(([ , value ]) => value));
		const breakdown = Fn.join(Fn.map(byCount, ([ name, value ]) => `  ${value} ${name}`), '\n');
		console.error(`Dropped ${total} object${plural(total)} no payload codec claims:\n${breakdown}`);
	}
}

if (process.argv[1] === 'export') {
	await main();
}

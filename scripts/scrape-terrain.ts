import { promises as fs } from 'fs';
import { TerrainWriter } from '~/engine/game/terrain';
import * as MapSchema from '~/engine/game/map';
import { getWriter } from '~/engine/schema/write';
import { BufferView } from '~/engine/schema/buffer-view';

const [ jsonSource, blobDestination ] = process.argv.slice(2);
if (jsonSource === undefined || blobDestination === undefined) {
	console.error(`Usage: ${process.argv[1]} <src> <dst>`);
	process.exit(1);
}

(async() => {
	const data = JSON.parse(await fs.readFile(jsonSource, 'utf8'));
	for (const collection of data.collections) {
		if (collection.name === 'rooms.terrain') {

			// Read room data from rooms.terrain collection
			const rooms = (collection.data as { room: string; terrain: string }[]).map(room => {
				const terrain = new TerrainWriter;
				for (let xx = 0; xx < 50; ++xx) {
					for (let yy = 0; yy < 50; ++yy) {
						terrain.set(xx, yy, Number(room.terrain[yy * 50 + xx]));
					}
				}
				return {
					roomName: room.room,
					terrain,
				};
			});
			rooms.sort((left, right) => left.roomName.localeCompare(right.roomName));

			// Make writer and save
			const write = getWriter(MapSchema.schema.World, MapSchema.interceptorSchema);
			const view = new BufferView(new ArrayBuffer(1024 * 1024 * 32));
			const length = write(rooms, view, 0);
			await fs.writeFile(blobDestination, view.uint8.subarray(0, length));
			return;
		}
	}

	console.error("Didn't find anything");
})().catch(err => console.error(err));

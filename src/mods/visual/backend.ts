import { registerRoomSocketHandler } from 'xxscreeps/backend';
import { Variant } from 'xxscreeps/schema';
import { stringifyInherited } from 'xxscreeps/utility/string';
import { getVisualChannel, loadVisuals } from './model';

registerRoomSocketHandler(async(shard, userId, roomName) => {
	if (!userId) {
		return;
	}

	// Subscribe to visuals channel and listen for publishes to this room
	let lastTime = shard.time;
	const unlisten = await getVisualChannel(shard, userId).listen(message => {
		if (message.type === 'publish' && message.roomNames.includes(roomName)) {
			lastTime = message.time;
		}
	});

	return [
		unlisten,
		async time => {
			// Stringify visuals for this room only if visuals were sent for this room+time
			if (time <= lastTime) {
				const visuals = (await loadVisuals(shard, userId))?.find(visual => visual.name === roomName);
				if (visuals) {
					let visualsString = '';
					for (const visual of visuals.visual) {
						(visual as any).t = visual[Variant];
						visualsString += stringifyInherited(visual) + '\n';
					}
					return { visual: visualsString };
				}
			}
		},
	];
});

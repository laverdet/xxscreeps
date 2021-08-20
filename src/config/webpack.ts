import type { Transform } from 'xxscreeps/driver/webpack';
export const configTransform: Transform = {
	externals: ({ context, request }) => {
		if (request === 'xxscreeps/config/mods/import') {
			return 'xxscreeps/config/mods.static';
		} else if (request === 'xxscreeps/config/mods') {
			return false;
		} else if (request === 'xxscreeps/config') {
			throw new Error(`Config included by ${context}`);
		}
	},
};

declare module 'xxscreeps:packages' {
	import type { Package } from 'xxscreeps/schema/build.js';

	const packages: Record<string, Package>;
	export default packages;
}

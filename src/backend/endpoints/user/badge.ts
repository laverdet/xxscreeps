import type { Endpoint } from 'xxscreeps/backend';
import { loadUser } from 'xxscreeps/backend/model/user';
import * as Badge from 'xxscreeps/engine/metadata/badge';
import * as User from 'xxscreeps/engine/metadata/user';

const BadgeEndpoint: Endpoint = {
	path: '/api/user/badge',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const badge = Badge.validate(context.request.body.badge);
		await context.backend.gameMutex.scope(async() => {
			const fragment = `user/${userId}/info`;
			const user = User.read(await context.shard.blob.reqBuffer(fragment));
			user.badge = JSON.stringify(badge);
			await context.shard.blob.set(fragment, User.write(user));
		});
		return { ok: 1 };
	},
};

const BadgeSvgEndpoint: Endpoint = {
	path: '/api/user/badge-svg',

	async execute(context) {
		// Look up userid
		const username = `${context.query.username}`;
		const usernameKey = context.backend.auth.usernameToProviderKey(username);
		const userid = context.backend.auth.lookupUserByProvider(usernameKey);
		if (userid === undefined) {
			return;
		}
		const user = await loadUser(context.backend, userid);
		const badge: Badge.Badge = JSON.parse(user.badge);

		// Extract or calculate paths
		const { color1, color2, color3 } = badge;
		const { path1, path2, rotate } = function() {
			if (typeof badge.type === 'number') {
				const { flip, param, type } = badge as Badge.UserBadge;
				const { rotate, path1, path2 } = BadgePaths[type - 1](param);
				return {
					path1, path2,
					rotate: flip ? rotate ?? 0 : 0,
				};
			} else {
				return {
					path1: badge.type.path1,
					path2: badge.type.path2,
					rotate: 0,
				};
			}
		}();

		// Send markup payload
		context.set('Content-Type', 'image/svg+xml; charset=utf-8');
		context.body = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 100 100" shape-rendering="geometricPrecision">' +
			'<defs><clipPath id="clip"><circle cx="50" cy="50" r="52" /></clipPath></defs>' +
			`<g transform="rotate(${rotate} 50 50)">` +
			`<rect x="0" y="0" width="100" height="100" fill="${color1}" clip-path="url(#clip)" />` +
			`<path d="${path1}" fill="${color2}" clip-path="url(#clip)" />` +
			(path2 === '' ? '' : `<path d="${path2}" fill="${color3}" clip-path="url(#clip)" />`) +
			'</g></svg>';
	},
};

export default [ BadgeEndpoint, BadgeSvgEndpoint ];

//
// Pretty printed and fixed up from badge.js
const BadgePaths: ((param: number) => { rotate?: number; path1: string; path2: string })[] = [
	param => {
		const vert = param > 0 ? param * 30 / 100 : 0;
		const hor = param < 0 ? -param * 30 / 100 : 0;
		return {
			path1: `M 50 ${100 - vert} L ${hor} 50 H ${100 - hor} Z`,
			path2: `M ${hor} 50 H ${100 - hor} L 50 ${vert} Z`,
		};
	},

	param => {
		const x = param > 0 ? param * 30 / 100 : 0;
		const y = param < 0 ? -param * 30 / 100 : 0;
		return {
			path1: `M ${x} ${y} L 50 50 L ${100 - x} ${y} V -1 H -1 Z`,
			path2: `M ${x} ${100 - y} L 50 50 L ${100 - x} ${100 - y} V 101 H -1 Z`,
		};
	},

	param => {
		const angle = Math.PI / 4 + Math.PI / 4 * (param + 100) / 200;
		const angle1 = -Math.PI / 2;
		const angle2 = Math.PI / 2 + Math.PI / 3;
		const angle3 = Math.PI / 2 - Math.PI / 3;
		return {
			path1: `M 50 50 L ${50 + 100 * Math.cos(angle1 - angle / 2)} ${50 + 100 * Math.sin(angle1 - angle / 2)} L ${50 + 100 * Math.cos(angle1 + angle / 2)} ${50 + 100 * Math.sin(angle1 + angle / 2)} Z`,
			path2: `M 50 50 L ${50 + 100 * Math.cos(angle2 - angle / 2)} ${50 + 100 * Math.sin(angle2 - angle / 2)} L ${50 + 100 * Math.cos(angle2 + angle / 2)} ${50 + 100 * Math.sin(angle2 + angle / 2)} Z M 50 50 L ${50 + 100 * Math.cos(angle3 - angle / 2)} ${50 + 100 * Math.sin(angle3 - angle / 2)} L ${50 + 100 * Math.cos(angle3 + angle / 2)} ${50 + 100 * Math.sin(angle3 + angle / 2)}`,
			rotate: 180,
		};
	},

	param => {
		const adjusted = param + 100;
		const y1 = 50 - adjusted * 30 / 200;
		const y2 = 50 + adjusted * 30 / 200;
		return {
			path1: `M 0 ${y2} H 100 V 100 H 0 Z`,
			path2: adjusted > 0 ? `M 0 ${y1} H 100 V ${y2} H 0 Z` : '',
			rotate: 90,
		};
	},

	param => {
		const adjusted = param + 100;
		const x1 = 50 - adjusted * 10 / 200 - 10;
		const x2 = 50 + adjusted * 10 / 200 + 10;
		return {
			path1: `M ${x1} 0 H ${x2} V 100 H ${x1} Z`,
			path2: `M 0 ${x1} H 100 V ${x2} H 0 Z`,
			rotate: 45,
		};
	},

	param => {
		const width = 5 + (param + 100) * 8 / 200;
		const x1 = 50;
		const x2 = 20;
		const x3 = 80;
		return {
			path1: `M ${x1 - width} 0 H ${x1 + width} V 100 H ${x1 - width}`,
			path2: `M ${x2 - width} 0 H ${x2 + width} V 100 H ${x2 - width} Z M ${x3 - width} 0 H ${x3 + width} V 100 H ${x3 - width} Z`,
			rotate: 90,
		};
	},
	param => {
		const width = 20 + param * 10 / 100;
		return {
			path1: 'M 0 50 Q 25 30 50 50 T 100 50 V 100 H 0 Z',
			path2: `M 0 ${50 - width} Q 25 ${30 - width} 50 ${50 - width} T 100 ${50 - width} V ${50 + width} Q 75 ${70 + width} 50 ${50 + width} T 0 ${50 + width} Z`,
			rotate: 90,
		};
	},

	param => {
		const yy = param * 20 / 100;
		return {
			path1: 'M 0 50 H 100 V 100 H 0 Z',
			path2: `M 0 50 Q 50 ${yy} 100 50 Q 50 ${100 - yy} 0 50 Z`,
			rotate: 90,
		};
	},

	param => {
		let y1 = 0;
		let y2 = 50;
		const height = 70;
		if (param > 0) y1 += param / 100 * 20;
		if (param < 0) y2 += param / 100 * 30;
		return {
			path1: `M 50 ${y1} L 100 ${y1 + height} V 101 H 0 V ${y1 + height} Z`,
			path2: `M 50 ${y1 + y2} L 100 ${y1 + y2 + height} V 101 H 0 V ${y1 + y2 + height} Z`,
			rotate: 180,
		};
	},

	param => {
		let r = 30;
		let d = 7;
		if (param > 0) r += param * 50 / 100;
		if (param < 0) d -= param * 20 / 100;
		return {
			path1: `M ${50 + d + r} ${50 - r} A ${r} ${r} 0 0 0 ${50 + d + r} ${50 + r} H 101 V ${50 - r} Z`,
			path2: `M ${50 - d - r} ${50 - r} A ${r} ${r} 0 0 1 ${50 - d - r} ${50 + r} H -1 V ${50 - r} Z`,
			rotate: 90,
		};
	},

	param => {
		let a1 = 30;
		let a2 = 30;
		const xx = 50 - 50 * Math.cos(Math.PI / 4);
		const yy = 50 - 50 * Math.sin(Math.PI / 4);
		if (param > 0) {
			a1 += param * 25 / 100;
			a2 += param * 25 / 100;
		}
		if (param < 0) {
			a2 -= param * 50 / 100;
		}
		return {
			path1: `M ${xx} ${yy} Q ${a1} 50 ${xx} ${100 - yy} H 0 V ${yy} Z M ${100 - xx} ${yy} Q ${100 - a1} 50 ${100 - xx} ${100 - yy} H 100 V ${yy} Z`,
			path2: `M ${xx} ${yy} Q 50 ${a2} ${100 - xx} ${yy} V 0 H ${xx} Z M ${xx} ${100 - yy} Q 50 ${100 - a2} ${100 - xx} ${100 - yy} V 100 H ${xx} Z`,
			rotate: 90,
		};
	},

	param => {
		let a1 = 30;
		let a2 = 35;
		if (param > 0) a1 += param * 30 / 100;
		if (param < 0) a2 += param * 15 / 100;
		return {
			path1: `M 0 ${a1} H 100 V 100 H 0 Z`,
			path2: `M 0 ${a1} H ${a2} V 100 H 0 Z M 100 ${a1} H ${100 - a2} V 100 H 100 Z`,
			rotate: 180,
		};
	},

	param => {
		let r = 30;
		let d = 0;
		if (param > 0) r += param * 50 / 100;
		if (param < 0) d -= param * 20 / 100;
		return {
			path1: 'M 0 0 H 50 V 100 H 0 Z',
			path2: `M ${50 - r} ${50 - d - r} A ${r} ${r} 0 0 0 ${50 + r} ${50 - r - d} V 0 H ${50 - r} Z`,
			rotate: 180,
		};

	},

	param => {
		const angle = Math.PI / 4 + param * Math.PI / 4 / 100;
		return {
			path1: `M 50 0 Q 50 ${50} ${50 + 50 * Math.cos(angle)} ${50 + 50 * Math.sin(angle)} H 100 V 0 H 50 Z`,
			path2: `M 50 0 Q 50 ${50} ${50 - 50 * Math.cos(angle)} ${50 + 50 * Math.sin(angle)} H 0 V 0 H 50 Z`,
			rotate: 180,
		};
	},

	param => {
		const width = 13 + param * 6 / 100;
		const r1 = 80;
		const r2 = 45;
		const d = 10;
		return {
			path1: `M ${50 - r1 - width} ${100 + d} A ${r1 + width} ${r1 + width} 0 0 1 ${50 + r1 + width} ${100 + d} H ${50 + r1 - width} A ${r1 - width} ${r1 - width} 0 1 0 ${50 - r1 + width} ${100 + d}`,
			path2: `M ${50 - r2 - width} ${100 + d} A ${r2 + width} ${r2 + width} 0 0 1 ${50 + r2 + width} ${100 + d} H ${50 + r2 - width} A ${r2 - width} ${r2 - width} 0 1 0 ${50 - r2 + width} ${100 + d}`,
			rotate: 180,
		};
	},

	param => {
		let angle = 30 * Math.PI / 180;
		let d = 25;
		if (param > 0) {
			angle += 30 * Math.PI / 180 * param / 100;
		}
		if (param < 0) {
			d += param * 25 / 100;
		}
		let path1 = '';
		for (let ii = 0; ii < 3; ii++) {
			const angle1 = ii * Math.PI * 2 / 3 + angle / 2 - Math.PI / 2;
			const angle2 = ii * Math.PI * 2 / 3 - angle / 2 - Math.PI / 2;
			path1 += `M ${50 + 100 * Math.cos(angle1)} ${50 + 100 * Math.sin(angle1)} L ${50 + 100 * Math.cos(angle2)} ${50 + 100 * Math.sin(angle2)} L ${50 + d * Math.cos(angle2)} ${50 + d * Math.sin(angle2)} A ${d} ${d} 0 0 1 ${50 + d * Math.cos(angle1)} ${50 + d * Math.sin(angle1)} Z`;
		}

		let path2 = '';
		for (let ii = 0; ii < 3; ii++) {
			const angle1 = ii * Math.PI * 2 / 3 + angle / 2 + Math.PI / 2;
			const angle2 = ii * Math.PI * 2 / 3 - angle / 2 + Math.PI / 2;
			path2 += `M ${50 + 100 * Math.cos(angle1)} ${50 + 100 * Math.sin(angle1)} L ${50 + 100 * Math.cos(angle2)} ${50 + 100 * Math.sin(angle2)} L ${50 + d * Math.cos(angle2)} ${50 + d * Math.sin(angle2)} A ${d} ${d} 0 0 1 ${50 + d * Math.cos(angle1)} ${50 + d * Math.sin(angle1)} Z`;
		}
		return { path1, path2 };
	},

	param => {
		let width = 35;
		let height = 45;
		if (param > 0) {
			width += param * 20 / 100;
		}
		if (param < 0) {
			height -= param * 30 / 100;
		}
		return {
			path1: `M 50 45 L ${50 - width} ${height + 45} H ${50 + width} Z`,
			path2: `M 50 0 L ${50 - width} ${height} H ${50 + width} Z`,
		};
	},

	param => {
		let angle = 90 * Math.PI / 180;
		let d = 10;
		if (param > 0) {
			angle -= 60 / 180 * Math.PI * param / 100;
		}
		if (param < 0) {
			d -= param * 15 / 100;
		}
		let path1 = '';
		let path2 = '';
		for (let ii = 0; ii < 3; ii++) {
			const angle1 = Math.PI * 2 / 3 * ii + angle / 2 - Math.PI / 2;
			const angle2 = Math.PI * 2 / 3 * ii - angle / 2 - Math.PI / 2;
			const path = `M ${50 + 100 * Math.cos(angle1)} ${50 + 100 * Math.sin(angle1)} L ${50 + 100 * Math.cos(angle2)} ${50 + 100 * Math.sin(angle2)} L ${50 + d * Math.cos((angle1 + angle2) / 2)} ${50 + d * Math.sin((angle1 + angle2) / 2)} Z`;
			if (ii === 0) {
				path1 += path;
			} else {
				path2 += path;
			}
		}
		return {
			path1, path2,
			rotate: 180,
		};
	},

	param => {
		let w2 = 20;
		let w1 = 60;
		w1 += param * 20 / 100;
		w2 += param * 20 / 100;
		return {
			path1: `M 50 -10 L ${50 - w1} 100 H ${50 + w1} Z`,
			path2: w2 > 0 ? `M 50 0 L ${50 - w2} 100 H ${50 + w2} Z` : '',
			rotate: 180,
		};
	},

	param => {
		let width = 10;
		let height = 20;
		if (param > 0) width += param * 20 / 100;
		if (param < 0) height += param * 40 / 100;
		return {
			path1: `M 0 ${50 - height} H ${50 - width} V 100 H 0 Z`,
			path2: `M ${50 + width} 0 V ${50 + height} H 100 V 0 Z`,
			rotate: 90,
		};
	},

	param => {
		let width = 40;
		let height = 50;
		if (param > 0) width -= param * 20 / 100;
		if (param < 0) height += param * 20 / 100;
		return {
			path1: `M 50 ${height} Q ${50 + width} 0 50 0 T 50 ${height} Z M 50 ${100 - height} Q ${50 + width} 100 50 100 T 50 ${100 - height} Z`,
			path2: `M ${height} 50 Q 0 ${50 + width} 0 50 T ${height} 50 Z M ${100 - height} 50 Q 100 ${50 + width} 100 50 T ${100 - height} 50 Z`,
			rotate: 45,
		};
	},

	param => {
		let width = 20;
		width += param * 10 / 100;
		const path1 = `M ${50 - width} ${50 - width} H ${50 + width} V ${50 + width} H ${50 - width} Z`;
		let path2 = '';
		for (let ii = -4; ii < 4; ii++) {
			for (let jj = -4; jj < 4; jj++) {
				const angle = (ii + jj) % 2;
				path2 += `M ${50 - width - width * 2 * ii} ${50 - width - width * 2 * (jj + angle)} H ${-width * 2} v ${width * 2} H ${width * 2} Z`;
			}
		}
		return {
			path1, path2,
			rotate: 45,
		};
	},

	param => {
		let width = 17;
		let height = 25;
		if (param > 0) width += param * 35 / 100;
		if (param < 0) height -= param * 23 / 100;
		let path1 = '';
		for (let ii = -4; ii <= 4; ii++) {
			path1 += `M ${50 - width * ii * 2} ${50 - height} l ${-width} ${-height} l ${-width} ${height} l ${width} ${height} Z`;
		}
		let path2 = '';
		for (let ii = -4; ii <= 4; ii++) {
			path2 += `M ${50 - width * ii * 2} ${50 + height} l ${-width} ${-height} l ${-width} ${height} l ${width} ${height} Z`;
		}
		return {
			path1, path2,
			rotate: 90,
		};
	},

	param => {
		let width = 50;
		let height = 45;
		if (param > 0) width += param * 60 / 100;
		if (param < 0) height += param * 30 / 100;
		return {
			path1: `M 0 ${height} L 50 70 L 100 ${height} V 100 H 0 Z`,
			path2: `M 50 0 L ${50 + width} 100 H 100 V ${height} L 50 70 L 0 ${height} V 100 H ${50 - width} Z`,
			rotate: 180,
		};
	},
];

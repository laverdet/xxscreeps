import type { Database } from 'xxscreeps/engine/db/index.js';
import { Ajv } from 'ajv';
import jsonSchema from './badge.schema.json' with { type: 'json' };
import * as User from './index.js';

// To rebuild schema:
// npx typescript-json-schema tsconfig.json UserBadge --include engine/user/badge.ts --defaultProps --required -o engine/user/badge.schema.json

/** @pattern ^#[a-f0-9]{6}$ */
type Color = string;

export interface UserBadge {
	color1: Color;
	color2: Color;
	color3: Color;
	flip: boolean;

	/** @minimum -100 @maximum 100 */
	param: number;

	/** @minimum 1 @maximum 24 */
	type: number;
}

interface SvgBadge {
	color1: Color;
	color2: Color;
	color3: Color;
	type: {
		path1: string;
		path2: string;
	};
}

export type Badge = UserBadge | SvgBadge;

const ajv = new Ajv();
const validator = ajv.compile<UserBadge>(jsonSchema);

export function isUserBadge(badge: Badge): badge is UserBadge {
	return typeof badge.type === 'number';
}

export function validate(badge: object): UserBadge {
	// @ts-expect-error
	delete badge._watching;
	if (!validator(badge)) {
		throw new Error(`Invalid badge\n${validator.errors![0]!.message}`);
	}
	return badge;
}

export async function save(db: Database, userId: string, badge: string) {
	await db.data.hSet(User.infoKey(userId), 'badge', badge);
}

// Mirrors the vanilla private-server bot CLI (genRandomBadge) so freshly-added bots get a
// distinct badge on the map instead of the default blank one.
export function generateRandom(): UserBadge {
	const color = () => `#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')}`;
	return {
		color1: color(),
		color2: color(),
		color3: color(),
		flip: Math.random() > 0.5,
		param: Math.floor(Math.random() * 200) - 100,
		type: Math.floor(Math.random() * 24) + 1,
	};
}

import type { KeyValProvider } from './storage/provider';
import { KeyvalScript } from './storage/script';

/**
 * Returns an async generator which pops every member out of a set and yields the result.
 */
export async function *consumeSet(keyval: KeyValProvider, key: string) {
	while (true) {
		const next = await keyval.spop(key);
		if (next === null) {
			return;
		}
		yield next;
	}
}

/**
 * Removes a single member from the given set from those members which exist in `members`. Returns
 * the index of the remove member or `null` if none were found.
 */
const RemOne = new KeyvalScript((keyval, [ key ]: [ string ], members: string[]) => {
	for (let ii = 0; ii < members.length; ++ii) {
		if (keyval.srem(key, [ members[ii] ]) === 1) {
			return ii;
		}
	}
	return null;
}, {
	lua:
`for ii = 1, #ARGV do
	if redis.call('srem', KEYS[1], ARGV[ii]) == 1 then
		return ii - 1
	end
end`,
});

/**
 * Removes every member from a set which exists in `members` and yields them one by one. This
 * modifies the `members` array in place, removing those elements from it as well as the database
 * set.
 */
export async function *consumeSetMembers(keyval: KeyValProvider, key: string, members: string[]) {
	while (members.length > 0) {
		const ii = await keyval.eval(RemOne, [ key ], members);
		if (ii === null) {
			return;
		}
		const member = members[ii];
		members[ii] = members[members.length - 1];
		members.pop();
		yield member;
	}
}

/**
 * Removes a single member from the sorted set within range [min, max]. Returns the removed member
 * or `null` if none matched the range.
 */
const ZPopByScore = new KeyvalScript((keyval, [ key ]: [ string ], [ min, max ]: [ number, number ]) => {
	const range: string[] = keyval.zrange(key, min, max, { by: 'score', limit: [ 0, 1 ] });
	if (range.length === 0) {
		return null;
	} else {
		keyval.zrem(key, range);
		return range[0];
	}
}, {
	lua:
`local range = redis.call('zrange', KEYS[1], ARGV[1], ARGV[2], 'BYSCORE', 'LIMIT', 0, 1)
if #range == 0 then
	return
else
	redis.call('zrem', KEYS[1], range[1])
	return range[1]
end`,
});

/**
 * Removes each member from the sorted set within range [min, max], yield the members one by one.
 */
export async function *consumeSortedSet(keyval: KeyValProvider, key: string, min = -Infinity, max = Infinity) {
	while (true) {
		const next = await keyval.eval(ZPopByScore, [ key ], [ min, max ]);
		if (next === null) {
			return;
		}
		yield next;
	}
}

/**
 * Removes a single member from the sorted set within range [min, max]. Returns a bulk response
 * where the first element is the index of the removed member, or `null` if none were found.
 * Subsequent elements represent members which are not in the set.
 */
const ZRemOneInRange = new KeyvalScript((
	keyval,
	[ key ]: [ string ],
	[ min, max, ...members ]: [ number, number, ...string[] ],
): number[] => {
	const result = [ -1 ];
	for (let ii = 0; ii < members.length; ii += 16) {
		const scores = keyval.zmscore(key, members.slice(ii, ii + 16));
		for (let jj = 0; jj < scores.length; ++jj) {
			const score = scores[jj];
			if (score === null) {
				result.push(ii + jj);
			} else if (score >= min && score <= max) {
				result[0] = ii + jj;
			}
		}
		if (result[0] !== -1) {
			keyval.zrem(key, [ members[result[0]] ]);
			break;
		}
	}
	return result;
}, {
	lua:
`local key = KEYS[1]
local min, max = tonumber(ARGV[1]), tonumber(ARGV[2])
local result = { -1 }
for ii = 3, #ARGV, 16 do
	local scores = redis.call('zmscore', key, unpack(ARGV, ii, math.min(ii + 15, #ARGV)))
	for jj = 1, #scores do
		local score = tonumber(scores[jj])
		if score == nil then
			result[#result + 1] = ii + jj - 4
		elseif score >= min and score <= max then
			result[1] = ii + jj - 4
		end
	end
	if result[1] ~= -1 then
		redis.call('zrem', key, ARGV[result[1] + 3])
		break
	end
end
return result
`,
});

/**
 * Removes every member from a sorted set within range [min, max] and also exists in `members`,
 * yielding them one by one. This modifies the `members` array in place, removing those elements
 * from it as well as the database set.
 */
export async function *consumeSortedSetMembers(keyval: KeyValProvider, key: string, members: string[], min = -Infinity, max = Infinity) {
	while (members.length > 0) {
		const result = await keyval.eval(ZRemOneInRange, [ key ], [ min, max, ...members ]);
		let cursor = members.length;
		const index = result[0];
		if (index !== -1) {
			yield members[index];
			members[index] = members[--cursor];
		}
		for (let ii = 1; ii < result.length; ++ii) {
			members[result[ii]] = members[--cursor];
		}
		members.splice(cursor);
		if (index === -1) {
			return;
		}
	}
}

import * as Fn from 'xxscreeps/utility/functional';

export class SortedSet {
	readonly #members: string[] = [];
	readonly #scores = new Map<string, number>();

	constructor(entries?: Iterable<[ number, string ]>) {
		if (entries) {
			this.insert(entries);
		}
	}

	get size() {
		return this.#members.length;
	}

	add(member: string, score: number) {
		if (this.#scores.has(member)) {
			this.#scores.set(member, score);
			this.sort();
			return 0;
		} else {
			this.#scores.set(member, score);
			this.#members.push(member);
			this.sort();
			return 1;
		}
	}

	delete(member: string) {
		if (this.#scores.has(member)) {
			this.#scores.delete(member);
			this.#members.splice(this.#members.indexOf(member), 1);
			return 1;
		} else {
			return 0;
		}
	}

	*entries(min = -Infinity, max = Infinity): Iterable<[ number, string ]> {
		for (const member of this.#members) {
			const score = this.#scores.get(member)!;
			if (score > max) {
				break;
			} else if (score >= min) {
				yield [ score, member ];
			}
		}
	}

	*entriesByLex(minInclusive: boolean, min: string, maxInclusive: boolean, max: string) {
		for (const member of this.#members) {
			if (
				maxInclusive ?
					member.localeCompare(max) > 0 :
					member.localeCompare(max) >= 0
			) {
				break;
			} else if (
				minInclusive ?
					member.localeCompare(min) >= 0 :
					member.localeCompare(min) > 0
			) {
				yield member;
			}
		}
	}

	has(member: string) {
		return this.#scores.has(member);
	}

	insert(entries: Iterable<[ number, string ]>, accumulator = (left: number, right: number) => left + right) {
		let count = 0;
		for (const [ score, member ] of entries) {
			const currentScore = this.#scores.get(member);
			if (currentScore === undefined) {
				this.#members.push(member);
				this.#scores.set(member, accumulator(0, score));
				++count;
			} else {
				this.#scores.set(member, accumulator(currentScore, score));
			}
		}
		this.sort();
		return count;
	}

	score(member: string) {
		return this.#scores.get(member);
	}

	values() {
		return this.#members;
	}

	[Symbol.for('nodejs.util.inspect.custom')]() {
		return Object.fromEntries(Fn.map(this.entries(), entry => [ entry[1], entry[0] ]));
	}

	private sort() {
		this.#members.sort((left, right) =>
			(this.#scores.get(left)! - this.#scores.get(right)!) ||
			left.localeCompare(right));
	}
}

export class SortedSet<Type> {
	readonly #members: Type[] = [];
	readonly #scores = new Map<Type, number>();

	constructor(entries?: Iterable<[ Type, number ]>) {
		if (entries) {
			this.insert(entries);
		}
	}

	get size() {
		return this.#members.length;
	}

	add(member: Type, score: number) {
		if (this.#scores.has(member)) {
			this.#scores.set(member, score);
			this.sort();
			return 1;
		} else {
			this.#scores.set(member, score);
			this.#members.push(member);
			this.sort();
			return 0;
		}
	}

	delete(member: Type) {
		if (this.#scores.has(member)) {
			this.#scores.delete(member);
			this.#members.splice(this.#members.indexOf(member), 1);
			return 1;
		} else {
			return 0;
		}
	}

	*entries(min = -Infinity, max = Infinity): Iterable<[ Type, number ]> {
		for (const member of this.#members) {
			const score = this.#scores.get(member)!;
			if (score > max) {
				break;
			} else if (score >= min) {
				yield [ member, score ];
			}
		}
	}

	insert(entries: Iterable<[ Type, number ]>) {
		for (const [ member, score ] of entries) {
			if (!this.#scores.has(member)) {
				this.#members.push(member);
			}
			this.#scores.set(member, score);
		}
		this.sort();
	}

	merge(entries: Iterable<[ Type, number ]>, accumulator = (left: number, right: number) => left + right) {
		for (const [ member, score ] of entries) {
			const currentScore = this.#scores.get(member);
			if (currentScore === undefined) {
				this.#members.push(member);
				this.#scores.set(member, score);
			} else {
				this.#scores.set(member, accumulator(currentScore, score));
			}
		}
		this.sort();
	}

	score(member: Type) {
		return this.#scores.get(member);
	}

	values() {
		return this.#members;
	}

	[Symbol.for('nodejs.util.inspect.custom')]() {
		return Object.fromEntries(this.entries());
	}

	private sort() {
		this.#members.sort((left, right) => this.#scores.get(left)! - this.#scores.get(right)!);
	}
}

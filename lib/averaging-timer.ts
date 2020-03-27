const accuracy = 2 ** 32;
const bigAccuracy = BigInt(accuracy);

export class AveragingTimer {
	index = 0;
	samples: bigint[] = [];
	sum = 0n;
	started: bigint | undefined;

	constructor(
		private readonly size = 100,
		private readonly ignoreFirst = 1,
	) {
		this.samples = Array(size).fill(undefined).map(() => 0n);
	}

	start() {
		this.started = process.hrtime.bigint();
	}

	stop() {
		const ii = (++this.index) % this.size;
		const duration = process.hrtime.bigint() - this.started!;
		if (ii <= this.ignoreFirst) {
			return Number(duration * bigAccuracy) / accuracy;
		}
		const previous = this.samples[ii];
		this.samples[ii] = duration;
		this.sum += duration - previous;
		return Number(this.sum * bigAccuracy / BigInt(Math.min(this.size, this.index))) / accuracy;
	}
}

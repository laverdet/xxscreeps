const accuracy = 2 ** 32;
const bigAccuracy = BigInt(accuracy);

export class AveragingTimer {
	index = 0;
	samples: bigint[] = [];
	sum = 0n;
	started: bigint | undefined;
	readonly size;
	readonly ignoreFirst;

	constructor(size = 100, ignoreFirst = 1) {
		this.size = size;
		this.ignoreFirst = ignoreFirst;
		this.samples = Array(size).fill(undefined).map(() => 0n);
	}

	start() {
		this.started = process.hrtime.bigint();
	}

	stop() {
		const duration = process.hrtime.bigint() - this.started!;
		if (++this.index <= this.ignoreFirst) {
			return Number(duration * bigAccuracy) / accuracy;
		}
		const ii = this.index % this.size;
		const previous = this.samples[ii];
		this.samples[ii] = duration;
		this.sum += duration - previous;
		const samplesCount = BigInt(Math.min(this.size, this.index - this.ignoreFirst));
		return Number(this.sum * bigAccuracy / samplesCount) / accuracy;
	}
}

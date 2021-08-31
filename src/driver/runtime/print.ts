const kHalfMax = 50;

// Marker for `result` message in console socket
export const resultPrefix = '\x1b[1m>\x1b[22m ';

type Log = { fd: number; data: string };
let head: Log[] = [];
let tail: Log[] = [];
let omitted = 0;

const previousFd = 1;
let logRepeat = 0;
let previousLog: string | undefined;

function push(fd: number, data: string) {
	if (head.length < kHalfMax) {
		head.push({ fd, data });
	} else {
		tail.push({ fd, data });
		if (tail.length > kHalfMax) {
			tail.shift();
			++omitted;
		}
	}
}

function flushRepeat() {
	if (logRepeat > 0) {
		if (logRepeat === 1) {
			// If it was only repeated once, just save the line
			push(previousFd, previousLog!);
		} else {
			push(1, `\x1b[90m[Previous message repeated \x1b[1m${logRepeat}\x1b[22m times]`);
		}
		previousLog = undefined;
		logRepeat = 0;
	}
}

export function print(fd: number, line: string) {
	if (line === previousLog && fd === previousFd) {
		++logRepeat;
	} else {
		flushRepeat();
		push(fd, line);
		logRepeat = 0;
		previousLog = line;
	}
}

export function flush() {
	flushRepeat();
	if (omitted > 0) {
		head[kHalfMax - 1] = { fd: 0, data: `\x1b[90m[Omitted \x1b[1m${omitted + 1}\x1b[22m lines]` };
		omitted = 0;
	}
	head.push(...tail);
	const result = head;
	logRepeat = 0;
	previousLog = undefined;
	head = [];
	tail = [];
	if (result.length) {
		return JSON.stringify(result);
	}
}

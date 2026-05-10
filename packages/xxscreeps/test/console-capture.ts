type Capture = {
	lines: string[];
	[Symbol.dispose]: () => void;
};

export function captureConsoleLog(): Capture {
	const lines: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(value => typeof value === 'string' ? value : String(value)).join(' '));
	};
	return {
		lines,
		[Symbol.dispose]() { console.log = original; },
	};
}

type NotifyLine = {
	event: string;
	userId: string;
	message: string;
	date: number;
	count: number;
	type: string;
};

export function parseNotifyLines(lines: readonly string[]): NotifyLine[] {
	const out: NotifyLine[] = [];
	for (const line of lines) {
		try {
			const parsed = JSON.parse(line) as Partial<NotifyLine>;
			if (parsed.event === 'notify') {
				out.push(parsed as NotifyLine);
			}
		} catch {}
	}
	return out;
}

export function withFakeNow(start: number) {
	const original = Date.now;
	let now = start;
	Date.now = () => now;
	return {
		advance(ms: number) { now += ms; },
		set(value: number) { now = value; },
		now() { return now; },
		[Symbol.dispose]() { Date.now = original; },
	};
}

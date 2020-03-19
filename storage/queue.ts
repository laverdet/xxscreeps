import { Responder } from './responder';

export abstract class Queue {
	abstract pop(): Promise<string | undefined>;
	abstract push(entries: string[]): Promise<void>;

	static connect(name: string) {
		return Responder.connect<QueueHost, QueueClient>(name, QueueClient);
	}

	static create(name: string) {
		return Responder.create(name, QueueHost);
	}

	request(method: string, payload?: any): any {
		if (method === 'pop') {
			return this.pop();
		} else if (method === 'push') {
			return this.push(payload);
		} else {
			return Promise.reject(new Error(`Unknown method: ${method}`));
		}
	}

	async *[Symbol.asyncIterator]() {
		for (
			let value = await this.pop();
			value !== undefined;
			value = await this.pop()
		) {
			yield value;
		}
	}
}

class QueueHost extends Queue {
	readonly queue: string[] = [];

	pop() {
		return Promise.resolve(this.queue.shift());
	}

	push(entries: string[]) {
		this.queue.push(...entries);
		return Promise.resolve();
	}
}

class QueueClient extends Queue {
	pop(): Promise<string | undefined> { return this.request('pop') }
	push(entries: string[]): Promise<void> { return this.request('push', entries) }
}

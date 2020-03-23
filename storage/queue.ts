import { Responder } from './responder';

export abstract class Queue<Type> {
	abstract pop(): Promise<Type | undefined>;
	abstract push(entries: Type[]): Promise<void>;
	protected currentVersion: any;

	static connect<Type = string>(name: string) {
		return Responder.connect<QueueHost<Type>, QueueClient<Type>>(name, QueueClient);
	}

	static create<Type = string>(name: string) {
		return Responder.create(name, () => Promise.resolve(new QueueHost));
	}

	request(method: string, payload?: any): any {
		if (payload.version !== this.currentVersion) {
			return Promise.resolve();
		}
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

class QueueHost<Type> extends Queue<Type> {
	readonly queue: Type[] = [];

	pop() {
		return Promise.resolve(this.queue.shift());
	}

	push(entries: Type[]) {
		this.queue.push(...entries);
		return Promise.resolve();
	}

	version(version: any) {
		if (this.currentVersion !== version) {
			this.currentVersion = version;
			this.queue.splice(0, this.queue.length);
		}
	}
}

class QueueClient<Type> extends Queue<Type> {
	pop(): Promise<Type | undefined> {
		return this.request('pop', { version: this.currentVersion });
	}

	push(entries: Type[]): Promise<void> {
		return this.request('push', { version: this.currentVersion, entries });
	}

	version(version: any) {
		this.currentVersion = version;
	}
}

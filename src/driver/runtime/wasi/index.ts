/* eslint-disable camelcase */
// https://github.com/WebAssembly/WASI/blob/main/phases/snapshot/witx/wasi_snapshot_preview1.wit
import * as C from './constants.js';

// Adapted from:
// https://github.com/emscripten-core/emscripten/blob/9af077b01455277a8d38f9a2cb74c0bfbe012b0e/src/runtime_strings.js#L48
function readUTF8(buffers: Uint8Array[]) {
	// For UTF8 byte structure, see:
	// http://en.wikipedia.org/wiki/UTF-8#Description
	// https://www.ietf.org/rfc/rfc2279.txt
	// https://tools.ietf.org/html/rfc3629
	let str = '';
	for (const buffer of buffers) {
		for (let ii = 0; ii < buffer.length;) {
			let u0 = buffer[ii++];
			if (u0 & 0x80) {
				const u1 = buffer[ii++] & 63;
				if ((u0 & 0xe0) === 0xc0) {
					str += String.fromCharCode(((u0 & 31) << 6) | u1);
				} else {
					const u2 = buffer[ii++] & 63;
					if ((u0 & 0xf0) === 0xe0) {
						u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
					} else if ((u0 & 0xf8) === 0xf0) {
						u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (buffer[ii++] & 63);
					} else {
						// Replacement character, invalid UTF-8
						u0 = 0xfffd;
					}
					if (u0 < 0x10000) {
						str += String.fromCharCode(u0);
					} else {
						const ch = u0 - 0x10000;
						str += String.fromCharCode(0xd800 | (ch >> 10), 0xdc00 | (ch & 0x3ff));
					}
				}
			} else {
				str += String.fromCharCode(u0);
			}
		}
	}
	return str;
}

function writeASCII(buffer: Uint8Array, offset: number, value: string) {
	const { length } = value;
	for (let ii = 0; ii < length; ++ii) {
		buffer[offset + ii] = value.charCodeAt(ii);
	}
	buffer[offset + length] = 0;
	return offset + length + 1;
}

// Methods which will be imported into WASM must be bound to the instance, since they will lose
// `this` context. It's also required that they are enumerable, in order to be exported to the
// module.
export class WASI {
	#dv!: DataView;
	#i32: Int32Array = {} as never;
	#u8!: Uint8Array;
	#output: Uint8Array[][] = [ [], [], [] ];
	#env: Record<string, string>;
	#memory!: WebAssembly.Memory & { addGrowCallback?: (fn: () => void) => void };
	#title;

	constructor(title: string, env: Record<string, string> = {}) {
		this.#title = title;
		this.#env = env;
	}

	/**
	 * Reset TypedArray views if the underlying linear memory buffer has changed.
	 */
	reset() {
		const { buffer } = this.#memory;
		if (buffer !== this.#i32.buffer) {
			this.#dv = new DataView(buffer);
			this.#i32 = new Int32Array(buffer);
			this.#u8 = new Uint8Array(buffer);
		}
	}

	/**
	 * This differs from the nodejs version in that it does *not* invoke `initialize_`.
	 * https://nodejs.org/api/wasi.html#wasi_wasi_initialize_instance
	 */
	initialize = (instance: WebAssembly.Instance) => {
		this.#memory = instance.exports.memory as never;
		this.reset();
		if (this.#memory.addGrowCallback) {
			// If a memory growth callback is provided we don't need to check memory growth each time.
			this.#memory.addGrowCallback(this.reset.bind(this));
			this.reset = () => {};
		}
	};

	/**
	 * Return the resolution of a clock. Implementations are required to provide a non-zero value for
	 * supported clocks. For unsupported clocks, return `errno::inval`.
	 * Note: This is similar to `clock_getres` in POSIX.
	 * @param clockId int - The clock for which to return the resolution.
	 * @param resolution uint64_t* - The resolution of the clock, or an error if one happened.
	 */
	clock_getres = (clockId: number, resolution: number) => {
		this.reset();
		let result: bigint;
		switch (clockId) {
			case C.realtime:
				result = 1000000n;
				break;
			case C.monotonic:
			case C.process_cputime_id:
			case C.thread_cputime_id:
				result = 1n;
				break;
			default:
				return C.inval;
		}
		this.#dv.setBigUint64(resolution, result, true);
		return C.success;
	};

	/**
	 * Return the time value of a clock.
	 * Note: This is similar to `clock_gettime` in POSIX.
	 * @param clockId int - The clock for which to return the time.
	 * @param precision int64_t - The maximum lag (exclusive) that the returned time value may have,
	 * compared to its actual value.
	 * @param timestamp uint64_t* - The time value of the clock.
	 */
	clock_time_get = (clockId: number, precision: bigint, timestamp: number) => {
		this.reset();
		let now: bigint;
		switch (clockId) {
			case C.realtime:
				now = BigInt(Date.now()) * 1000000n;
				break;
			case C.monotonic:
				now = process.hrtime.bigint();
				break;
			case C.process_cputime_id:
			case C.thread_cputime_id: {
				const usage = process.cpuUsage();
				now = BigInt(usage.user + usage.system);
				break;
			}
			default:
				return C.inval;
		}
		this.#dv.setBigUint64(timestamp, now, true);
		return C.success;
	};

	/**
	 * Read environment variable data. The sizes of the buffers should match that returned by
	 * `environ_sizes_get`. Key/value pairs are expected to be joined with `=`s, and terminated with
	 * `\0`s.
	 * @param environ char**
	 * @param environBuf char*
	 */
	environ_get = (environ: number, environBuf: number) => {
		this.reset();
		let envIndex = environ >>> 2;
		let bufAddr = environBuf;
		for (const [ key, value ] of Object.entries(this.#env)) {
			this.#i32[envIndex++] = bufAddr;
			bufAddr = writeASCII(this.#u8, bufAddr, key);
			this.#u8[bufAddr - 1] = 0x3d; // '='
			bufAddr = writeASCII(this.#u8, bufAddr, value);
		}
		return C.success;
	};

	/**
	 * Return environment variable data sizes.
	 * @param count int*
	 * @param size int*
	 */
	environ_sizes_get = (count: number, size: number) => {
		this.reset();
		const entries = Object.entries(this.#env);
		this.#i32[count >>> 2] = entries.length;
		this.#i32[size >>> 2] = entries.reduce((sum, entry) => sum + entry[0].length + entry[1].length + 2, 0);
		return C.success;
	};

	/**
	 * Write to a file descriptor.
	 * Note: This is similar to `writev` in POSIX.
	 * @param fd int
	 * @param iov iovec* - List of scatter/gather vectors from which to retrieve data.
	 * @param iovs int
	 * @param size int*
	 */
	fd_write = (fd: number, iov: number, iovs: number, size: number) => {
		if (fd !== 1 && fd !== 2) {
			return C.inval;
		}
		this.reset();
		let totalSize = 0;
		for (let ii = 0; ii < iovs; ++ii) {
			// Read iovector
			const iovN = (iov >>> 2) + (ii << 1);
			const size = this.#i32[iovN + 1];
			totalSize += size;
			let addr = this.#i32[iovN];
			const end = addr + size;

			// Check for newlines
			for (let ii = addr; ii < end; ++ii) {
				if (this.#u8[ii] === 0x0a) {
					this.#output[fd].push(this.#u8.subarray(addr, ii));
					addr = ii + 1;
					const string = readUTF8(this.#output[fd].splice(0));
					(fd === 1 ? console.log : console.error)(string);
				}
			}

			// Save remaining buffer
			if (addr !== end) {
				this.#output[fd].push(new Uint8Array(this.#u8.subarray(addr, end)));
			}
		}
		this.#i32[size >>> 2] = totalSize;
		return C.success;
	};

	/**
	 * Terminate the process normally. An exit code of 0 indicates successful termination of the
	 * program. The meanings of other values is dependent on the environment.
	 */
	proc_exit = (code: number) => {
		throw new Error(`WebAssembly module '${this.#title}' exited with code: ${code}`);
	};

	/**
	 * Write high-quality random data into a buffer. This function blocks when the implementation is
	 * unable to immediately provide sufficient high-quality random data. This function may execute
	 * slowly, so when large mounts of random data are required, it's advisable to use this function
	 * to seed a pseudo-random number generator, rather than to provide the random data directly.
	 * @param buffer - uint8_t*
	 * @param size - int
	 */
	random_get = (buffer: number, size: number) => {
		this.reset();
		// Math.random() is of course not cryptographically secure, but this is a video game.
		for (let ii = buffer; ii < buffer + size; ++ii) {
			this.#u8[ii] = (Math.random() * 0x100) >>> 0;
		}
	};

	// iostream pulls these in and they apparently can't be optimized out.
	fd_read = () => C.inval;
	fd_seek = () => C.inval;
	fd_close = () => C.inval;
}

import ivm from 'isolated-vm';
import { isolate } from './runtime.js';
declare const processInfo: any;

const { lib } = ivm as any;
export const { arch, platform, version } = processInfo;
export const cwd = () => '.';
export const cpuUsage = () => ({ user: isolate.cpuTime, system: 0 });
export const hrtime = { bigint: () => {
	const [ sec, nsec ] = lib.hrtime();
	return BigInt(sec) * 1000000000n + BigInt(nsec);
} };

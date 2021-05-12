import ivm from 'isolated-vm';
export const isPrivate = true;
export function makeSymbol(name?: string): symbol {
	return (ivm as any).lib.privateSymbol(name);
}

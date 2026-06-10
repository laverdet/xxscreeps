export type Provide = 'backend' | 'config' | 'constants' | 'driver' | 'game' | 'main' | 'processor' | 'storage' | 'test';
export type Manifest = {
	dependencies?: string[];
	provides: Provide | Provide[] | null;
};

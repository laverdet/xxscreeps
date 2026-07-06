import type { Format, TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { declare } from 'xxscreeps/schema/index.js';

export function reconstructor<Type extends Format>(format: Type) {
	const { read, write } = makeReaderAndWriter(declare('Test', format));
	return <Value extends TypeOf<Type>>(value: Value) => read(write(value as never)) as Value;
}

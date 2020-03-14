import type { Schema } from '.';
import type { Layout } from './layout';

function archiveLayout(schema: Schema, layout: Layout, depth = 1): string {
	if (typeof layout === 'string') {
		return `'${layout}' as const`;

	} else if ('array' in layout) {
		return `{ array: ${archiveLayout(schema, layout.array, depth + 1)}, size: ${layout.size} }`;

	} else if ('vector' in layout) {
		return `{ vector: ${archiveLayout(schema, layout.vector, depth + 1)} }`;

	} else {
		const indent = '\n' + '\t'.repeat(depth);
		let code = '{';
		if (layout.inherit) {
			let didFind = false;
			for (const [ name, format ] of Object.entries(schema)) {
				if (format === layout.inherit) {
					didFind = true;
					code += `${indent}inherit: ${name}`;
				}
			}
			if (!didFind) {
				throw new Error('Missing dependent struct in schema');
			}
		}
		code += `${indent}struct: {`;
		for (const [ key, member ] of Object.entries(layout.struct)) {
			code += `${indent}\t${key}: { offset: ${member.offset}, `;
			if (member.pointer) {
				code += 'pointer: true as const, ';
			}
			code += `layout: ${archiveLayout(schema, member.layout, depth + 1)} }`;
		}
		code += `\n${'\t'.repeat(depth - 1)}} }`;
		return code;
	}
}

export function archiveSchema(schema: Schema): string {
	return Object.entries(schema).map(([ name, format ]) =>
		`const ${name} = ${archiveLayout(schema, format)};\n`).join('');
}

import { Variant } from './format';
import type { Layout } from './layout';

function requireIdentifier(code: string) {
	if (!/^[a-zA-Z$_][a-zA-Z0-9$_]+$/.test(code)) {
		throw new Error(`Layout must be named: ${code}`);
	}
	return code;
}

type LayoutToNames = Map<Layout, string>;
function archiveLayout(
	schema: Dictionary<any>,
	layout: Layout,
	layoutToNames: LayoutToNames,
	depth = 1,
): string {

	// Subsequent calls shouldn't rerender the result, messing up references
	const identifierName = layoutToNames.get(layout);
	if (identifierName !== undefined) {
		return identifierName;
	}

	// Render layout to TypeScript
	if (typeof layout === 'string') {
		return `'${layout}' as const`;

	} else if ('array' in layout) {
		return `{ array: ${archiveLayout(schema, layout.array, layoutToNames, depth + 1)}, size: ${layout.size} }`;

	} else if ('enum' in layout) {
		return '{ enum: [ ' +
			layout.enum.map(value => `${JSON.stringify(value)} as const`).join(', ') +
		'] }';

	} else if ('variant' in layout) {
		return '{ variant: [ ' +
			layout.variant.map(layout =>
				requireIdentifier(archiveLayout(schema, layout, layoutToNames, depth + 1))).join(', ') +
		'] }';

	} else if ('vector' in layout) {
		return `{ vector: ${archiveLayout(schema, layout.vector, layoutToNames, depth + 1)} }`;

	} else {
		const indent = '\n' + '\t'.repeat(depth);
		let code = '{';
		if (layout[Variant] !== undefined) {
			code += `${indent}[Variant]: '${layout[Variant]}',`;
		}
		if (layout.inherit !== undefined) {
			code += `${indent}inherit: ${requireIdentifier(archiveLayout(schema, layout.inherit, layoutToNames))},`;
		}
		code += `${indent}struct: {`;
		for (const [ key, member ] of Object.entries(layout.struct)) {
			code += `${indent}\t${key}: { offset: ${member.offset}, `;
			if (member.pointer === true) {
				code += 'pointer: true as const, ';
			}
			code += `layout: ${archiveLayout(schema, member.layout, layoutToNames, depth + 1)} },`;
		}
		code += `\n${'\t'.repeat(depth - 1)}} }`;
		return code;
	}
}

export function archiveSchema(schema: Dictionary<any>): string {
	const layoutToNames: LayoutToNames = new Map();
	const prelude = "import { Variant } from '~/engine/schema/format';\n";
	return prelude + Object.entries(schema).map(([ name, layout ]) => {
		const archived = `const ${name} = ${archiveLayout(schema, layout, layoutToNames)};\n`;
		layoutToNames.set(layout, name);
		return archived;
	}).join('');
}

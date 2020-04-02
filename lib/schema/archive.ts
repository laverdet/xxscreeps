import { BoundInterceptor } from './interceptor';
import type { Layout } from './layout';

class Renderer {
	readonly identifiers = new Set<string>();
	rendered = '';

	withIdentifier(name: string, layout: Layout) {
		if (!this.identifiers.has(name)) {
			this.identifiers.add(name);
			const archived = `export const ${name} = ${archiveLayoutImpl(this, layout)};\n`;
			this.rendered += archived;
		}
		return name;
	}
}

function archiveLayoutImpl(renderer: Renderer, layout: Layout, depth = 1): string {

	if (typeof layout === 'string') {
		return JSON.stringify(layout);

	} else if ('array' in layout) {
		return `{ array: ${archiveNamedLayout(renderer, layout.array, depth + 1)}, size: ${layout.size} }`;

	} else if ('enum' in layout) {
		return '{ enum: [ ' +
			layout.enum.map(value => value === undefined ? 'undefined' : JSON.stringify(value)).join(', ') +
		' ] }';

	} else if ('holder' in layout) {
		return archiveLayoutImpl(renderer, layout.holder, depth);

	} else if ('optional' in layout) {
		return `{ optional: ${archiveNamedLayout(renderer, layout.optional, depth + 1)} }`;

	} else if ('variant' in layout) {
		return '{ variant: [ ' +
			layout.variant.map(layout => archiveNamedLayout(renderer, layout, depth + 1)).join(', ') +
		' ] }';

	} else if ('vector' in layout) {
		return `{ vector: ${archiveNamedLayout(renderer, layout.vector, depth + 1)} }`;

	} else {
		const indent = '\n' + '\t'.repeat(depth);
		let code = '{';
		if (layout['variant!'] !== undefined) {
			code += `${indent}"variant!": ${JSON.stringify(layout['variant!'])},`;
		}
		if (layout.inherit !== undefined) {
			code += `${indent}inherit: ${archiveNamedLayout(renderer, layout.inherit, depth + 1)},`;
		}
		code += `${indent}struct: {`;
		for (const [ key, member ] of Object.entries(layout.struct)) {
			code += `${indent}\t${key}: { offset: ${member.offset}, `;
			if (member.pointer === true) {
				code += 'pointer: true, ';
			}
			code += `layout: ${archiveNamedLayout(renderer, member.layout, depth + 1)} },`;
		}
		code += `\n${'\t'.repeat(depth - 1)}} }`;
		return code;
	}
}

function archiveNamedLayout(renderer: Renderer, layout: Layout, depth = 1) {

	// Check for bound name
	if (typeof layout !== 'string') {
		const bound = layout[BoundInterceptor];
		if (bound?.name !== undefined) {
			return renderer.withIdentifier(bound.name, layout);
		}
	}

	// Render archived layout
	return archiveLayoutImpl(renderer, layout, depth);
}

export function archiveLayout(layout: Layout): string {
	const renderer = new Renderer;
	const name = archiveNamedLayout(renderer, layout);
	return renderer.rendered + `export default ${name};\n`;
}

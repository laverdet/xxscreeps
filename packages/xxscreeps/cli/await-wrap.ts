// Trailing `\n` keeps a `// comment` at end of source from eating the closing paren.

export function wrapExpression(source: string): string {
	return `(async () => (${source}\n))()`;
}

export function wrapBlock(source: string): string {
	return `(async () => {${source}\n})()`;
}

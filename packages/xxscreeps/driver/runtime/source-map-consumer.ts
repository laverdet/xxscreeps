import type { Needle, SourceMapInput } from '@jridgewell/trace-mapping';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

// `source-map-support` resolves `source-map@0.6`, whose consumer materializes and sorts an object
// per mapping before it can answer the first query. For the runtime bundle that is most of a
// player's CPU limit, charged to whichever tick first reads `error.stack`. Webpack aliases
// `source-map` here instead, onto the decoder webpack already uses to build the bundle.
export class SourceMapConsumer {
	private readonly tracer;

	constructor(map: SourceMapInput) {
		this.tracer = new TraceMap(map);
	}

	get sources() {
		return this.tracer.resolvedSources;
	}

	get sourcesContent() {
		return this.tracer.sourcesContent;
	}

	originalPositionFor(needle: Needle) {
		return originalPositionFor(this.tracer, needle);
	}
}

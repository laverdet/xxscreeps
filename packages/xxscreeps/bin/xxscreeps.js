#!/usr/bin/env node
// nb: String template prevents TypeScript from crawling into the dist directory
await import(`${'../dist/config/entry.js'}`);

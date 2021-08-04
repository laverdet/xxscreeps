// There is an issue in Webpack where it duplicates the contents of a module when the module import
// was added by a Babel transformation. This results in two instances of a module existing which
// results in all kinds of chaos.
// This issue was observed in Webpack 5.48.0, but not version 5.39.1.
export * from './runtime';

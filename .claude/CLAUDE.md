# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Conventions

### Functional Guidelines

See: [docs/functional.md](docs/functional.md) for information on working with lists of data.


### Hacks

We don't do hacks here. If it looks like some core component is missing a feature then add that
feature to the core component.

You probably do not need `WeakMap`. If you think you need `WeakMap` then think long and hard about
whether or not it makes sense. The same goes for `Proxy`.

We also don't do copy & pasting here. If an existing function almost does what you want, but not
quite, then figure out a way to abstract out the behavior you need. Don't copy & paste a dozen lines
of code just to change one line.


### Prefer `const` over `let`

`const` is almost always preferred. When a value needs branching or loop logic to initialize,
compute it in an immediately-invoked function expression instead of declaring `let` and assigning
from branches:

```ts
// config/mods.ts
const providesSpecifiers = function() {
	if (Array.isArray(manifest.provides)) {
		return manifest.provides;
	} else {
		return manifest.provides === null ? [] : [ manifest.provides ];
	}
}();
```

`let` can be used for state which updates throughout the lifetime of a closure. Don't do cheeky
garbage like `const state = { current: 0 };` because you're afraid of `let`.


### IIFE

IIFE's are used to approximate the proposed (and abandoned) [do
expressions](https://github.com/tc39/proposal-do-expressions).

The house spelling is a plain anonymous `function() { ... }()` — not an arrow IIFE. There are less
parenthesis to balance with this scheme and by convention an unnamed `function` expression will almost
always mean it's an IIFE.

If the expression needs `this` then use an arrow function, don't capture `const that = this`.

The same trick turns `throw` into an expression:

```ts
// schema/layout.ts
$$ => $$ ?? function() {
	throw new Error('Impossible');
}(),
```


### TypeScript

Avoid `any`.

Prefer `interface` over `type` aliases.

Just don't do crazy stuff, alright?

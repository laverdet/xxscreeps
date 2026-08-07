# Decorations

Room decorations — the cosmetic overlays a player places in their rooms. This mod owns the *catalog*
(which decorations a server offers), *ownership* (who has which of them), *placement*, and serving
what is placed to the room view and the world map.

Decorations are not `RoomObject`s: they cost no bytes in a room blob and the processor never touches
them. Everything is account state in `db.data`, with `active.shard` naming the target shard.

## Decoration packs

A pack is a `pack.yaml` plus, optionally, the images it references:

```
my-pack/
  pack.yaml
  art/wall.png
```

```yaml
name: my-pack
themes:
  my-theme: { name: My Theme, color: '#8f8f8f' }
decorations:
  my-walls:
    type: wallLandscape
    name: My Walls
    theme: my-theme
    rarity: 2
    foregroundUrl: art/wall.png
    props:
      backgroundColor: { type: color, label: Wall, default: '#111111' }
      world: { type: boolean, label: Show on the world map, default: true }
```

Themes and decorations are keyed by their id, so a pack cannot declare one twice.

- `type` is one of `floorLandscape`, `wallLandscape`, `landscape` (both at once), `wallGraffiti`,
  `creep`, `object` (graphics drawn over a kind of game object), `metadata` (a replacement for how
  that kind is drawn, as `objectType` + `resources` + `metadata`) or `badge` (a symbol for the
  account badge, as `badge`: the two paths it is drawn from — see below).
- `props` describes what a player may edit, and seeds the values when a decoration is placed. The
  names are the ones the client reads: `floorBackgroundColor`, `swampColor`, `roadsColor`,
  `backgroundColor`, `strokeColor`, `strokeWidth`, … A `world` property controls whether the
  decoration also shows on the world map.
- `graphics[]` entries reference properties by *name*: `{ url: art/x.png, color: myColor }`
  tints the image with whatever the player picked for `myColor`. Referenced properties have to seed a
  default — see below.
- `layout` holds the placement constraints (`proportional`, `minWidth`, `maxWidth`, `minHeight`,
  `maxHeight`).
- Asset references are either external urls (`https://…`, `data:…`, `/…`) or paths inside the pack.
  Pack-local files are checked when the server starts and served from
  `/assets/decorations/<pack>/<path>`. That url is rooted at `/`, so it means the same thing whatever
  route the client happens to be showing — a client routing through the path would otherwise resolve
  a document-relative url against wherever it stands, turning an overlay texture into
  `/room/shard0/assets/…`. Set `backend.assetBaseUrl` when the backend is not at the root of the
  origin the client is served from; it is prepended verbatim, so it takes an origin
  (`https://screeps.example.com`) or the path a proxy mounts the backend under
  (`/(http://localhost:21025)` for the steamless client).
- `preview` is what the client's inventory shows, as `original`, `128x128` and `256x256`. A landscape
  that declares none gets an svg drawn from its own colors, so a color-only pack needs no image
  files at all, and a badge is drawn from the symbol it grants for the same reason. Declaring a
  `preview` replaces the drawing. Types with artwork of their own — `wallGraffiti`, `creep`, `object`
  — are never drawn for; give them a `preview`. Note that the
  official client sanitizes these urls: a `data:` preview only survives as one of the raster types
  Angular allows, never as `data:image/svg+xml`. Pack-local files and http urls are always fine.

Anything wrong with a pack — an unknown type, a missing asset, a dangling theme or property
reference, a duplicate id, a color property seeded with something that is not `#rrggbb` — fails the
server at startup rather than handing the client something it cannot render.

## What the renderer requires

The client's renderer reads some of this without checking that it is there. A pack that leaves one of
those out does not draw a plainer room — it throws inside the room view, and the room stays blank for
everyone who can see it. So [renderer.ts](./renderer.ts) holds what each type owes, and a pack that
does not deliver fails the server at startup:

| type | definition | properties |
| --- | --- | --- |
| `floorLandscape` | — | `floorBackgroundColor`, `roadsColor` |
| `wallLandscape` | — | `backgroundColor`, `strokeColor` |
| `landscape` | — | all four of the above |
| `wallGraffiti` | `graphics` | `width`, `height`, `x`, `y`, `alpha` |
| `creep` | `graphics` | `width`, `height`, `nameFilter` |
| `object` | `graphics`, `objectType` | `width`, `height` |
| `metadata` | `objectType`, `resources`, `metadata` | — |
| `badge` | `badge` | — |

Every one of those properties must seed a `default`, since the renderer reads it out of *every*
placement rather than out of the definition. `badge` is the exception in the table: the room renderer
never sees one. Its reader is the account badge editor, and a badge granting no symbol is an
inventory entry that grants nothing.

`width` and `height` are on the list because the renderer assigns them to the sprite unchecked, and a
sprite sized `NaN` is one nobody can see. `wallGraffiti` needs `x` and `y` as well — it is the only
type the player positions, and the client's position editor writes back only properties the
definition declares.

On top of the table, a graphic's `color`, `alpha` and `visible` name properties rather than carrying
values, and the renderer looks those up on the placement — so each of them has to exist *and* seed a
default. A graphic naming a `color` also needs a `brightness` property: tinting is one computation
over both, and half of it yields no color at all.

Landscapes also carry a foreground layer — an overlay texture stretched across the floor
(`floorForegroundUrl`) or the walls (`foregroundUrl`), tinted by `…ForegroundColor`,
`…ForegroundBrightness` and `…ForegroundAlpha`. Declare one and the pack owns it, properties
included. Declare none and the catalog stands in with a flat white square at alpha zero, so a
color-only pack still hands the renderer something to draw and looks exactly as it did before.

The two halves must never point at the same url, which is why the stand-in is two identical squares
rather than one. The room view draws the floor foreground in `processors/terrain.js` and the wall
foreground in `decorations.js`, and pixi hands both the same `Texture` when the urls match.
`decorations.js` destroys the textures it drew on every decoration update while the terrain goes on
drawing the floor from the one it already holds — so a `landscape`, which covers both halves, takes
the room view down with it the first time anything in the room changes.

One property is a closed set rather than a free value: `animation`, which the renderer uses to index
its table of keyframes. Only `slow`, `fast`, `blink`, `neon`, `flash` and the empty string are
accepted, both as a definition's seed and in an activation request. It has to be checked here because
the client only offers the closed list when the property is a `string` labelled exactly `Animation` —
spelled any other way the player gets a free text field, and whatever they type would reach the
renderer.

Beyond that the renderer reads plenty it survives without: `swampColor`, `swampStrokeColor`,
`swampStrokeWidth`, `roadsBrightness`, `floorBackgroundBrightness`, `backgroundBrightness`,
`strokeBrightness`, `strokeWidth`, `strokeLighting`. Those merely render wrong when they are missing,
so they are the pack's business rather than an invariant — but a landscape wants all of them.

## Configuration

```yaml
decorations:
  # Load the pack bundled with the server. Default: true
  builtin: true
  # Every user owns the whole catalog. Default: true
  grantAll: true
  # Placing a decoration requires controlling or reserving the room. Default: true
  requireRoomOwnership: true
  # Extra packs, as a path to a pack.yaml or the directory holding one
  packs: [ ./my-pack ]
backend:
  # Only needed when the backend is not at the root of the origin serving the client. An origin of
  # its own, or the path a proxy mounts it under — e.g. "/(http://localhost:21025)" for steamless
  assetBaseUrl: https://screeps.example.com
```

---
"xxscreeps": patch
---

Store schema archives in the database instead of the filesystem. Every persistent store is now self-describing: previous schema versions needed to upgrade old blobs are preloaded from `schema/{name}` hash keys on connect, and archives found in the legacy `schemaArchive` directory are imported automatically. The generated `.ksy` Kaitai documentation files are no longer written.

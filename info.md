# Project structure

- `api/`: Hono/tRPC local and server API
- `contracts/`: shared entities and synchronization contracts
- `db/`: SQLite schema and migrations
- `deploy/server/`: interactive Linux server installer
- `scripts/`: local build helpers
- `src/`: React client
- `src-tauri/`: Tauri desktop and Android shell

Use Node.js 24. Run `npm run check`, `npm test`, `npm run lint`, and `npm run build` before publishing a release.

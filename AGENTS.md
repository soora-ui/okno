<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database

Local dev runs against a Docker copy of the production database, not the cloud Supabase project (that one is stale). Start it with `npm run db:start`, refresh it from prod with `npm run db:sync`, and apply a new migration locally with `npm run db:apply -- <file>`. Do not use the Supabase MCP connector for data or migrations. See `docs/local-database.md`.

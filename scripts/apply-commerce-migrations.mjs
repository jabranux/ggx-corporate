// Applies supabase/migrations/*.sql (in filename order) to the GGX Corporate
// Commerce backend — a dedicated Supabase Postgres project, separate from
// QuadX Bridge/HeyQ's. This script exists because the Supabase CLI is not
// available in this environment; if/when it is, prefer `supabase link
// --project-ref <ref>` + `supabase db push` instead (and reconcile tracking —
// see the note at the bottom of this file).
//
// Tracks applied migrations in `commerce_schema_migrations` so re-running is
// safe (already-applied files are skipped, not re-executed) — each migration
// file runs inside its own transaction; a failure rolls back that file only
// and stops the run before touching later files.
//
// Requires GGX_COMMERCE_DATABASE_URL — the Postgres connection string for the
// dedicated GGX Corporate / Business+ Supabase project. Reads it from
// .env.local if present (this repo has no dotenv dependency and Node does
// not auto-load .env.local outside Vite).
//
// Run:
//   node scripts/apply-commerce-migrations.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const DATABASE_URL = process.env.GGX_COMMERCE_DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'GGX_COMMERCE_DATABASE_URL is not set. Add it to .env.local and re-run.',
  );
  process.exit(1);
}

// Some Supabase-issued connection strings embed a password containing
// unescaped reserved URL characters (`?`, `/`, `#`, `[`, `]`, `%` not part of
// a valid percent-encoding), which breaks strict WHATWG URL parsing —
// including the parsing `postgres(connectionString)` does internally. Parse
// the pieces manually instead of relying on `new URL()`, and pass them to
// `postgres()` as a config object so the literal password is never
// URL-decoded or otherwise mangled.
function parsePostgresConnectionString(raw) {
  const schemeMatch = raw.match(/^postgres(?:ql)?:\/\//i);
  if (!schemeMatch) throw new Error('GGX_COMMERCE_DATABASE_URL must start with postgres:// or postgresql://');
  const rest = raw.slice(schemeMatch[0].length);
  const lastAt = rest.lastIndexOf('@');
  if (lastAt === -1) throw new Error('GGX_COMMERCE_DATABASE_URL is missing the "@" host separator');
  const userinfo = rest.slice(0, lastAt);
  const hostpart = rest.slice(lastAt + 1);
  const firstColon = userinfo.indexOf(':');
  const username = firstColon === -1 ? userinfo : userinfo.slice(0, firstColon);
  const password = firstColon === -1 ? '' : userinfo.slice(firstColon + 1);
  const slashIdx = hostpart.indexOf('/');
  const hostport = slashIdx === -1 ? hostpart : hostpart.slice(0, slashIdx);
  const database = slashIdx === -1 ? 'postgres' : hostpart.slice(slashIdx + 1).split('?')[0] || 'postgres';
  const colonIdx = hostport.lastIndexOf(':');
  const host = colonIdx === -1 ? hostport : hostport.slice(0, colonIdx);
  const port = colonIdx === -1 ? 5432 : Number(hostport.slice(colonIdx + 1));
  return { host, port, database, username, password };
}

const { default: postgres } = await import('postgres');
const conn = parsePostgresConnectionString(DATABASE_URL);
const sql = postgres({ ...conn, max: 1, ssl: 'require' });

async function ensureTrackingTable() {
  await sql`
    create table if not exists commerce_schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;
}

async function appliedFilenames() {
  const rows = await sql`select filename from commerce_schema_migrations`;
  return new Set(rows.map((r) => r.filename));
}

async function main() {
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in supabase/migrations.');
    return;
  }

  await ensureTrackingTable();
  const applied = await appliedFilenames();

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const contents = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into commerce_schema_migrations (filename) values (${file})`;
    });
    ranAny = true;
  }

  console.log(ranAny ? 'Done.' : 'Nothing to apply — already up to date.');
}

try {
  await main();
} catch (err) {
  console.error('Migration run failed:', err.message ?? err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

// Note on switching to the Supabase CLI later: `supabase db push` tracks
// applied migrations in its own `supabase_migrations.schema_migrations`
// table, separate from this script's `commerce_schema_migrations`. If you
// later `supabase link` this project, run `supabase migration repair
// --status applied <version>` for each file already applied via this script
// before your first `db push`, or it will try to re-run them.

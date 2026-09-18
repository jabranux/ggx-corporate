/**
 * commerceDb — shared Postgres client for the GGX Corporate Commerce backend.
 *
 * A dedicated Supabase project, separate from QuadX Bridge/HeyQ's own
 * project — Commerce (Inventory/Storefront/Promotions) is a GGX
 * product-domain capability, not a Bridge/CS one (see
 * docs/context/commerce-workflows.md). Connects directly to Postgres
 * (never through the Data API/PostgREST) so multi-statement transactions
 * with row-level locking work — required for concurrency-safe SKU
 * allocation and promotion usage-limit enforcement, neither of which the
 * Data API can express.
 *
 * Every Commerce table has RLS enabled with no grants to `anon`/
 * `authenticated` (GGX Corporate has no Supabase Auth users of its own —
 * see the module docblock in the migrations). This connection authenticates
 * as the project's Postgres role, which bypasses RLS by design; tenant
 * (account/subaccount) isolation is enforced here, in application code,
 * the same trust boundary already used for the Support/Claims/Ops Requests
 * proxies to QuadX Bridge — every query below takes an explicit account
 * scope resolved from the verified session, never from client input.
 */
import postgres from 'postgres';

export class CommerceConfigError extends Error {}

/**
 * Some Supabase-issued connection strings embed a password containing
 * unescaped reserved URL characters (`?`, `/`, `#`, `[`, `]`, a `%` that
 * isn't a valid percent-encoding), which breaks strict WHATWG URL parsing —
 * including what `postgres(connectionString)` does internally. Parsed
 * manually instead, and passed to `postgres()` as a config object so the
 * literal password is never re-encoded/decoded or otherwise mangled. Kept
 * in sync with the identical parser in scripts/apply-commerce-migrations.mjs.
 */
function parseConnectionString(raw: string): {
  host: string; port: number; database: string; username: string; password: string;
} {
  const schemeMatch = raw.match(/^postgres(?:ql)?:\/\//i);
  if (!schemeMatch) {
    throw new CommerceConfigError('GGX_COMMERCE_DATABASE_URL must start with postgres:// or postgresql://');
  }
  const rest = raw.slice(schemeMatch[0].length);
  const lastAt = rest.lastIndexOf('@');
  if (lastAt === -1) {
    throw new CommerceConfigError('GGX_COMMERCE_DATABASE_URL is missing the "@" host separator');
  }
  const userinfo = rest.slice(0, lastAt);
  const hostpart = rest.slice(lastAt + 1);
  const firstColon = userinfo.indexOf(':');
  const username = firstColon === -1 ? userinfo : userinfo.slice(0, firstColon);
  const password = firstColon === -1 ? '' : userinfo.slice(firstColon + 1);
  const slashIdx = hostpart.indexOf('/');
  const hostport = slashIdx === -1 ? hostpart : hostpart.slice(0, slashIdx);
  const database = slashIdx === -1 ? 'postgres' : (hostpart.slice(slashIdx + 1).split('?')[0] || 'postgres');
  const colonIdx = hostport.lastIndexOf(':');
  const host = colonIdx === -1 ? hostport : hostport.slice(0, colonIdx);
  const port = colonIdx === -1 ? 5432 : Number(hostport.slice(colonIdx + 1));
  return { host, port, database, username, password };
}

type Sql = ReturnType<typeof postgres>;

// Reused across invocations of the same warm serverless instance (Fluid
// Compute) — never re-created per request, so connections stay pooled.
let client: Sql | null = null;

export function getCommerceSql(): Sql {
  if (client) return client;
  const raw = process.env.GGX_COMMERCE_DATABASE_URL?.trim();
  if (!raw) {
    throw new CommerceConfigError(
      'GGX_COMMERCE_DATABASE_URL is not set on the server. The Commerce backend ' +
      'refuses to start without it (server-side only; never a VITE_-prefixed ' +
      'variable, never committed).',
    );
  }
  const conn = parseConnectionString(raw);
  // Real deployments always require TLS to the cloud Postgres project.
  // Overridable ONLY for a local disposable test database that has no TLS
  // configured at all (see tests/api-commerce-products.test.mjs) — never set
  // this in a real environment.
  const ssl = process.env.GGX_COMMERCE_DATABASE_SSL === 'disable' ? false : 'require';
  // max: small pool per warm instance — the Transaction-mode pooler this is
  // expected to point at (see .env.example) is itself already pooled
  // upstream; this just caps how many connections one function instance can
  // hold at once.
  client = postgres({ ...conn, max: 5, idle_timeout: 20, ssl });
  return client;
}

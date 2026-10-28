// database/connection.mjs
//
// Where the database scripts get their connection string.
//
// It used to be a literal in run-migration.mjs and query.mjs, which put the
// production password in the git history of a GitHub repository — somewhere
// editing the file cannot remove it from. The string now comes from
// SUPABASE_DB_URL, which .env.local already carries and .gitignore already
// excludes.
//
// Rotating the password is still necessary. This only stops the next one
// leaking the same way.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A plain .env reader, because these scripts are run with bare `node` and have
// no bundler or dotenv behind them. Handles `KEY=value`, optional quotes, and
// `export KEY=value`; ignores blanks and comments. A value containing `=` (a
// connection string with query parameters does) keeps everything after the
// first one.
function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The pooler connection string. Prefers the real environment so CI or a shell
 * export wins; otherwise reads the repo's .env.local.
 *
 * Exits with instructions rather than throwing a stack trace, because the
 * person who sees this is running a migration, not debugging Node.
 */
export function databaseUrl() {
  const fromEnv = process.env.SUPABASE_DB_URL?.trim();
  if (fromEnv) return fromEnv;

  const fileEnv = readEnvFile(join(__dirname, '..', '.env.local'));
  const fromFile = fileEnv.SUPABASE_DB_URL?.trim();
  if (fromFile) return fromFile;

  console.error(
    'SUPABASE_DB_URL is not set.\n\n' +
      'Add it to .env.local in the project root (the file is gitignored):\n' +
      '  SUPABASE_DB_URL=postgresql://USER:PASSWORD@HOST:6543/postgres\n\n' +
      'Supabase dashboard → Project Settings → Database → Connection string → ' +
      'Session pooler. URL-encode the password if it contains @ : / or ?.',
  );
  process.exit(1);
}

/** Options shared by both scripts. */
export function clientOptions() {
  return {
    connectionString: databaseUrl(),
    // Supabase's pooler presents a certificate these one-off scripts do not
    // pin; the connection is still TLS.
    ssl: { rejectUnauthorized: false },
  };
}

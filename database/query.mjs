// Read-only production query tool.
//
//   node database/query.mjs "SELECT count(*) FROM media_library WHERE media_id IS NULL"
//
// Exists so questions about live data can be answered without handing out a shell
// that can also change it. Two things stop a write: the statement must look like a
// read, and the transaction is opened READ ONLY, which Postgres enforces itself —
// so even a statement that slips past the pattern check cannot modify anything.
//
// Takes the same connection string as run-migration.mjs, read from
// SUPABASE_DB_URL by ./connection.mjs. Both files used to hold it as a literal,
// which put it in the git history; rotating the password is still outstanding.
import pg from 'pg';
import { clientOptions } from './connection.mjs';

const sql = process.argv.slice(2).join(' ').trim();
if (!sql) {
  console.error('usage: node database/query.mjs "SELECT ..."');
  process.exit(1);
}

// A read starts with SELECT, WITH, EXPLAIN or SHOW. Semicolons are refused so a
// read cannot carry a second statement along behind it.
if (!/^(select|with|explain|show)\b/i.test(sql)) {
  console.error('Refused: only SELECT / WITH / EXPLAIN / SHOW are allowed here.');
  process.exit(1);
}
if (sql.replace(/;\s*$/, '').includes(';')) {
  console.error('Refused: one statement at a time.');
  process.exit(1);
}

const client = new pg.Client({
  ...clientOptions(),
  statement_timeout: 20_000,
});

try {
  await client.connect();
  await client.query('BEGIN TRANSACTION READ ONLY');
  const res = await client.query(sql);
  await client.query('ROLLBACK');
  if (res.rows.length === 0) {
    console.log('(no rows)');
  } else {
    console.table(res.rows.slice(0, 100));
    if (res.rows.length > 100) console.log(`… ${res.rows.length - 100} more rows not shown`);
  }
} catch (err) {
  console.error('Query failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

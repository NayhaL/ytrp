const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL && !process.env.PGHOST) {
      throw new Error(
        'Configure DATABASE_URL or PostgreSQL connection variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE)',
      );
    }

    pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL })
      : new Pool();
  }

  return pool;
}

function query(text, values) {
  return getPool().query(text, values);
}

async function ensureCompanyStatusColumn() {
  await getPool().query(
    'ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(50)',
  );
}

async function ensureCompanySyncStateTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS company_sync_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      source_version TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL,
      imported_count BIGINT NOT NULL
    )
  `);
}

async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function withCompanySyncLock(callback) {
  const client = await getPool().connect();
  let lockResult;
  try {
    lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [847201661],
    );
  } catch (error) {
    client.release();
    throw error;
  }

  if (!lockResult.rows[0].acquired) {
    client.release();
    return { skipped: true, reason: 'another-sync-is-running' };
  }

  try {
    return await callback(client);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [847201661]);
    } finally {
      client.release();
    }
  }
}

module.exports = {
  query,
  ensureCompanyStatusColumn,
  ensureCompanySyncStateTable,
  withTransaction,
  withCompanySyncLock,
};

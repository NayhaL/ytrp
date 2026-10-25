const { Readable } = require('node:stream');
const unzipper = require('unzipper');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { withCompanySyncLock } = require('../config/database');
const companyRepository = require('../repositories/companyRepository');

const BATCH_SIZE = 500;
const MAX_ARCHIVE_SIZE = 500 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const SYNC_MAPPING_VERSION = '2';
const SYNC_HOUR = 5;
const SYNC_MINUTE = 0;
let companySyncStatus = {
  status: 'starting',
  startedAt: null,
  completedAt: null,
  importedCount: null,
  error: null,
};

// Palauttaa .env-tiedostosta lähde-API:n osoitteen tai ilmoittaa, jos se puuttuu.
function getSourceUrl() {
  const sourceUrl = process.env.COMPANY_API_URL;
  if (!sourceUrl) {
    throw new Error('COMPANY_API_URL environment variable is not configured');
  }

  return sourceUrl;
}

// Laskee seuraavan serverin kellon mukaan klo 05.00 synkronointihetken.
function getNextSyncTime(now = new Date()) {
  const nextSync = new Date(now);
  nextSync.setHours(SYNC_HOUR, SYNC_MINUTE, 0, 0);

  if (nextSync <= now) {
    nextSync.setDate(nextSync.getDate() + 1);
  }

  return nextSync;
}

// Palauttaa backend-prosessin viimeisimmän synkronoinnin tilan.
function getCompanySyncStatus() {
  const { error, ...publicStatus } = companySyncStatus;
  return publicStatus;
}

// Tarkistaa arkiston otsaketiedot ja muodostaa version, jolla päivitystarve tunnistetaan.
async function getSourceMetadata(sourceUrl) {
  const response = await fetch(sourceUrl, {
    method: 'HEAD',
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'lar-company-sync/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Company archive metadata request returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/zip')) {
    throw new Error('Company data endpoint did not identify a ZIP archive');
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_SIZE) {
    throw new Error(
      `Company archive exceeds the ${MAX_ARCHIVE_SIZE} byte configured limit`,
    );
  }

  const sourceVersion =
    response.headers.get('last-modified') ??
    response.headers.get('etag') ??
    response.headers.get('content-disposition') ??
    new Date().toISOString().slice(0, 10);

  return { sourceVersion, contentLength };
}

// Luo synkronoinnin tilataulun, jos sitä ei ole vielä tietokannassa.
async function createSyncStateTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS company_sync_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      source_version TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL,
      imported_count BIGINT NOT NULL
    )
  `);
}

// Lataa ZIP-arkiston ja tuo sen JSON-yritystiedot tietokantaan pienissä erissä.
async function importZipArchive(sourceUrl, client) {
  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'lar-company-sync/1.0' },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Company archive download returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/zip')) {
    throw new Error('Company data download was not a ZIP archive');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_SIZE) {
    throw new Error(
      `Company archive exceeds the ${MAX_ARCHIVE_SIZE} byte configured limit`,
    );
  }

  const archive = Readable.fromWeb(response.body).pipe(
    unzipper.Parse({ forceStream: true }),
  );
  let importedCount = 0;
  let jsonEntryFound = false;

  for await (const entry of archive) {
    if (entry.type !== 'File' || !entry.path.toLowerCase().endsWith('.json')) {
      entry.autodrain();
      continue;
    }

    jsonEntryFound = true;
    const values = entry.pipe(parser()).pipe(streamArray());
    let batch = [];

    for await (const item of values) {
      batch.push(item.value);
      if (batch.length === BATCH_SIZE) {
        importedCount += await companyRepository.upsertCompaniesBatch(
          batch,
          client,
        );
        batch = [];
      }
    }

    if (batch.length > 0) {
      importedCount += await companyRepository.upsertCompaniesBatch(
        batch,
        client,
      );
    }
  }

  if (!jsonEntryFound || importedCount === 0) {
    throw new Error('Company ZIP contained no importable JSON company records');
  }

  return importedCount;
}

// Synkronoi uuden arkistoversion tietokantaan ja kirjaa onnistuneen tuonnin tilan.
async function syncCompaniesFromApi() {
  const sourceUrl = getSourceUrl();

  return withCompanySyncLock(async (client) => {
    await createSyncStateTable(client);
    await client.query(
      'ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(50)',
    );
    const { sourceVersion: archiveVersion } = await getSourceMetadata(sourceUrl);
    const sourceVersion = `${archiveVersion}:mapping-${SYNC_MAPPING_VERSION}`;
    const previousSync = await client.query(
      'SELECT source_version, synced_at FROM company_sync_state WHERE id = 1',
    );

    if (previousSync.rows[0]?.source_version === sourceVersion) {
      return {
        skipped: true,
        reason: 'source-is-already-synced',
        syncedAt: previousSync.rows[0].synced_at,
      };
    }

    const importedCount = await importZipArchive(sourceUrl, client);
    const completedAt = new Date();
    await client.query(
      `INSERT INTO company_sync_state (id, source_version, synced_at, imported_count)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         source_version = EXCLUDED.source_version,
         synced_at = EXCLUDED.synced_at,
         imported_count = EXCLUDED.imported_count`,
      [sourceVersion, completedAt, importedCount],
    );

    return {
      skipped: false,
      importedCount,
      syncedAt: completedAt,
      sourceVersion,
    };
  });
}

// Synkronoi käynnistyksessä ja ajastaa seuraavat ajot päivittäin estäen päällekkäisyydet.
function startCompanySyncScheduler() {
  let syncRunning = false;

  // Suorittaa yhden synkronointiyrityksen ja kirjaa onnistumisen tai virheen lokiin.
  async function runSync() {
    if (syncRunning) return;
    syncRunning = true;
    companySyncStatus = {
      ...companySyncStatus,
      status: 'syncing',
      startedAt: new Date(),
      error: null,
    };
    try {
      const result = await syncCompaniesFromApi();
      companySyncStatus = {
        status: 'completed',
        startedAt: companySyncStatus.startedAt,
        completedAt: new Date(),
        importedCount: result.importedCount ?? 0,
        error: null,
      };
      if (result.skipped) {
        console.log(`Company data sync skipped: ${result.reason}`);
      } else {
        console.log(
          `Imported ${result.importedCount} companies from the daily archive`,
        );
      }
    } catch (error) {
      companySyncStatus = {
        ...companySyncStatus,
        status: 'failed',
        completedAt: new Date(),
        error: error.message,
      };
      console.error('Daily company data sync failed:', error);
    } finally {
      syncRunning = false;
    }
  }

  // Ajastaa seuraavan synkronoinnin palvelimen paikallisen ajan mukaan.
  function scheduleNextSync() {
    const nextSync = getNextSyncTime();
    const delay = nextSync.getTime() - Date.now();
    console.log(
      `Next company data sync scheduled for ${nextSync.toLocaleString()} (server local time)`,
    );

    const timeout = setTimeout(async () => {
      await runSync();
      scheduleNextSync();
    }, delay);
    timeout.unref();
  }

  void runSync().then(scheduleNextSync);
}

module.exports = {
  syncCompaniesFromApi,
  startCompanySyncScheduler,
  getNextSyncTime,
  getCompanySyncStatus,
};

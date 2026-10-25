const { query } = require('../config/database');

// Tallentaa yhden yrityksen ja palauttaa tallennetun tietueen.
async function insertCompany(company) {
  const result = await query(
    `INSERT INTO companies
      (name, business_id, registration_date, address, postal_code, city, country, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      company.name,
      company.business_id,
      company.registration_date || null,
      company.address || null,
      company.postal_code || null,
      company.city || null,
      company.country || null,
      company.status || null,
    ],
  );

  return result.rows[0];
}

// Hakee yrityksiä Y-tunnus- ja nimihakujen perusteella.
async function findCompaniesByIdentifiers(searches) {
  const businessIds = [...new Set(searches.map((search) => search.businessId).filter(Boolean))];
  const names = [
    ...new Set(
      searches
        .map((search) => search.name?.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  ];
  const result = await query(
    `SELECT id, name, business_id, registration_date::text AS registration_date,
            address, postal_code, city, status
     FROM companies
     WHERE business_id = ANY($1::text[])
        OR lower(btrim(name)) = ANY($2::text[])`,
    [businessIds, names],
  );

  return result.rows;
}

// Palauttaa tietokannan viimeisimmän onnistuneen synkronoinnin ajankohdan.
async function getLastSyncTime() {
  const syncResult = await query(
    'SELECT synced_at FROM company_sync_state WHERE id = 1',
  );

  return syncResult.rows[0]?.synced_at ?? null;
}

// Muuntaa PRH:n yritystietueen tietokannan sarakkeita vastaavaksi olioksi.
function mapApiCompany(company) {
  const businessId = company.businessId?.value;
  const name = Array.isArray(company.names)
    ? company.names[0]?.name
    : company.names?.name;
  const address = company.addresses?.[0];
  const city = address?.postOffices?.find(
    (postOffice) => postOffice.languageCode === '1',
  )?.city ?? address?.postOffices?.[0]?.city;
  const addressParts = [
    address?.street,
    address?.buildingNumber,
    address?.postOfficeBox && `PL ${address.postOfficeBox}`,
  ].filter(Boolean);

  if (typeof businessId !== 'string' || typeof name !== 'string' || !name) {
    return null;
  }

  return {
    name,
    business_id: businessId,
    registration_date:
      company.registrationDate ?? company.businessId?.registrationDate ?? null,
    address: addressParts.join(' ') || null,
    postal_code: address?.postCode || null,
    city: city || null,
    country: null,
    status: company.status ?? null,
  };
}

// Muuntaa ja tallentaa yrityserän tietokantaan päivitellen jo olemassa olevat tietueet.
async function upsertCompaniesBatch(companies, client) {
  const mapped = companies.map(mapApiCompany).filter(Boolean);
  if (mapped.length === 0) {
    return 0;
  }

  const uniqueBatch = [
    ...new Map(mapped.map((company) => [company.business_id, company])).values(),
  ];
  const values = [];
  const placeholders = uniqueBatch.map((company, rowIndex) => {
    const firstParameter = rowIndex * 8;
    values.push(
      company.name,
      company.business_id,
      company.registration_date,
      company.address,
      company.postal_code,
      company.city,
      company.country,
      company.status,
    );

    return `($${firstParameter + 1}, $${firstParameter + 2}, $${firstParameter + 3}, $${firstParameter + 4}, $${firstParameter + 5}, $${firstParameter + 6}, $${firstParameter + 7}, $${firstParameter + 8})`;
  });

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO companies
        (name, business_id, registration_date, address, postal_code, city, country, status)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (business_id) DO UPDATE SET
         name = EXCLUDED.name,
         registration_date = EXCLUDED.registration_date,
         address = EXCLUDED.address,
         postal_code = EXCLUDED.postal_code,
         city = EXCLUDED.city,
         country = EXCLUDED.country,
         status = EXCLUDED.status`,
      values,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  return uniqueBatch.length;
}

module.exports = {
  insertCompany,
  findCompaniesByIdentifiers,
  getLastSyncTime,
  upsertCompaniesBatch,
  mapApiCompany,
};

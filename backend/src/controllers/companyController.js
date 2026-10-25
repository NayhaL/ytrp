const companyRepository = require('../repositories/companyRepository');

// Tarkistaa, että päivämäärä on olemassa kalenterissa muodossa YYYY-MM-DD.
function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Palauttaa käyttöliittymälle tietokannan viimeisimmän synkronointiajan.
async function getSyncStatus(req, res) {
  try {
    const lastSyncedAt = await companyRepository.getLastSyncTime();
    return res.json({ lastSyncedAt });
  } catch (error) {
    console.error('Failed to read company sync status:', error);
    return res.status(500).json({
      error: 'Tietokannan synkronointiajan haku epäonnistui',
    });
  }
}

// Validoi pyynnön ja tallentaa uuden yrityksen tietokantaan.
async function createCompany(req, res) {
  const {
    name,
    business_id,
    registration_date,
    address,
    postal_code,
    city,
    country,
    status,
  } = req.body ?? {};

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof business_id !== 'string' ||
    !business_id.trim() ||
    [address, postal_code, city, country, status].some(
      (value) => value != null && typeof value !== 'string',
    ) ||
    (registration_date != null &&
      (typeof registration_date !== 'string' ||
        !isValidDateOnly(registration_date)))
  ) {
    return res.status(400).json({
      error:
        'name and business_id are required; optional fields must be strings and registration_date must use YYYY-MM-DD',
    });
  }

  try {
    const company = await companyRepository.insertCompany({
      name: name.trim(),
      business_id: business_id.trim(),
      registration_date,
      address,
      postal_code,
      city,
      country,
      status,
    });
    return res.status(201).json({ company });
  } catch (error) {
    console.error('Failed to insert company:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'A company with this business_id already exists',
      });
    }

    return res.status(500).json({
      error: 'Yrityksen tallennus epäonnistui palvelimen virheen vuoksi',
    });
  }
}

// Hakee yrityksiä Y-tunnuksella ja käyttää nimeä varahakuna.
async function lookupCompanies(req, res) {
  const { searches } = req.body ?? {};

  if (
    !Array.isArray(searches) ||
    searches.length === 0 ||
    searches.length > 500 ||
    searches.some(
      (search) =>
        !search ||
        typeof search !== 'object' ||
        (search.businessId != null &&
          typeof search.businessId !== 'string') ||
        (search.name != null &&
          typeof search.name !== 'string') ||
        (!(typeof search.businessId === 'string' && search.businessId.trim()) &&
          !(typeof search.name === 'string' && search.name.trim())),
    )
  ) {
    return res.status(400).json({
      error: 'searches must contain between 1 and 500 entries with a businessId or name',
    });
  }

  try {
    const normalizedSearches = searches.map((search) => ({
      businessId: search.businessId?.trim() || null,
      name: search.name?.trim() || null,
    }));
    const companies =
      await companyRepository.findCompaniesByIdentifiers(normalizedSearches);
    const companiesByBusinessId = new Map(
      companies.map((company) => [company.business_id, company]),
    );
    const companiesByName = new Map();
    for (const company of companies) {
      const normalizedName = company.name.trim().toLowerCase();
      const nameMatches = companiesByName.get(normalizedName) ?? [];
      nameMatches.push(company);
      companiesByName.set(normalizedName, nameMatches);
    }

    const results = normalizedSearches.map((search) => {
      const idMatch = search.businessId
        ? companiesByBusinessId.get(search.businessId)
        : null;
      const matches =
        idMatch
          ? [idMatch]
          : search.name
            ? companiesByName.get(search.name.toLowerCase()) ?? []
            : [];

      return { ...search, companies: matches };
    });
    return res.json({ results });
  } catch (error) {
    console.error('Failed to look up companies:', error);
    return res.status(500).json({
      error: 'Yritystietojen haku tietokannasta epäonnistui',
    });
  }
}

module.exports = { getSyncStatus, createCompany, lookupCompanies };

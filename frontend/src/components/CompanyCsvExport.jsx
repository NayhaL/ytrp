import { useState } from 'react';
import Papa from 'papaparse';
import { mapCompanyForExport } from '../utils/companyExportMapper';

const LOOKUP_BATCH_SIZE = 500;

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: ({ data, errors, meta }) => {
        if (errors.length > 0) {
          reject(new Error(`CSV-tiedoston luku epäonnistui: ${errors[0].message}`));
          return;
        }

        if (
          !meta.fields?.some((field) =>
            ['company-id', 'yritystunnus'].includes(field),
          ) &&
          !meta.fields?.some((field) => ['name', 'nimi'].includes(field))
        ) {
          reject(
            new Error('CSV-tiedostossa täytyy olla yritystunnus- tai nimisarake.'),
          );
          return;
        }

        const rows = data.map((row) => {
          const businessId = row['company-id'] ?? row.yritystunnus;
          const name = row.name ?? row.nimi;

          return {
            businessId: businessId?.trim(),
            name: name?.trim() ?? '',
          };
        });
        const invalidRow = rows.find((row) => !row.businessId && !row.name);

        if (invalidRow) {
          reject(new Error('Jokaisella CSV-rivillä täytyy olla yritystunnus tai nimi.'));
          return;
        }

        resolve(rows);
      },
      error: (error) => reject(error),
    });
  });
}

async function fetchCompanies(rows) {
  const results = [];

  for (let offset = 0; offset < rows.length; offset += LOOKUP_BATCH_SIZE) {
    const response = await fetch('/api/companies/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searches: rows.slice(offset, offset + LOOKUP_BATCH_SIZE),
      }),
    });
    const responseText = await response.text();
    let result;

    try {
      result = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error(
        `Palvelin palautti virheellisen vastauksen (HTTP ${response.status}). Tarkista, että Express-backend on käynnissä.`,
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.error || `Tietokantahaku epäonnistui (HTTP ${response.status})`,
      );
    }

    if (!Array.isArray(result?.results)) {
      throw new Error('Palvelimen vastauksesta puuttuvat hakutulokset.');
    }

    results.push(...result.results);
  }

  return results;
}

function downloadJson(data, filename) {
  const file = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function CompanyCsvExport() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [exportData, setExportData] = useState(null);

  async function handleSearch() {
    if (!file) {
      setError('Valitse ensin CSV-tiedosto.');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('');
    setSearchResults([]);
    setExportData(null);

    try {
      const rows = await parseCsv(file);
      if (rows.length === 0) {
        throw new Error('CSV-tiedosto ei sisällä yritysrivejä.');
      }

      const lookupResults = await fetchCompanies(rows);
      const results = lookupResults.flatMap((lookup) => {
        const matchedCompanies = lookup.companies.length > 0
          ? lookup.companies
          : [null];
        return matchedCompanies.map((company) => ({
          businessId: company?.business_id ?? lookup.businessId,
          csvName: lookup.name,
          company: company ?? null,
        }));
      });
      const missingRows = lookupResults.filter(
        (lookup) => lookup.companies.length === 0,
      );

      const exportedCompanies = [
        ...new Map(
          results
            .map((result) => result.company)
            .filter(Boolean)
            .map((company) => [company.business_id, mapCompanyForExport(company)]),
        ).values(),
      ];
      setSearchResults(results);
      setExportData({
        exportedAt: new Date().toISOString(),
        count: exportedCompanies.length,
        companies: exportedCompanies,
      });
      setStatus(
        `Haku valmis: ${exportedCompanies.length} yritystä löytyi, ${missingRows.length} riviä ei löytynyt.`,
      );
    } catch (exportError) {
      console.error('CSV-yritysvienti epäonnistui:', exportError);
      setError(exportError.message || 'CSV-vienti epäonnistui.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto mt-8 w-full rounded-xl border border-slate-200 p-5 text-left">
      <h3 className="font-semibold text-slate-800">Anna CSV-tiedosto</h3>
      <p className="mt-1 text-sm text-slate-600">
        CSV-otsikot: <code>yritystunnus</code> ja <code>nimi</code>
      </p>
      <label htmlFor="company-csv" className="sr-only">
        Valitse CSV-tiedosto
      </label>
      <input
        id="company-csv"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError('');
          setStatus('');
          setSearchResults([]);
          setExportData(null);
        }}
        className="mt-4 block cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-700 file:mr-4 file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-indigo-700"
      />
      <button
        type="button"
        onClick={handleSearch}
        disabled={loading || !file}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Haetaan tietoja...' : 'Hae tiedot tietokannasta'}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {status && <p role="status" className="mt-3 text-sm text-green-700">{status}</p>}

      {searchResults.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-semibold text-slate-800">Haun tulokset</h4>
            <button
              type="button"
              onClick={() => downloadJson(exportData, 'companies.json')}
              disabled={!exportData?.count}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lataa JSON
            </button>
          </div>
          <div className="rounded-lg border border-slate-200">
            <table className="w-full table-fixed divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th scope="col" className="w-[14%] break-words px-2 py-3 font-semibold sm:px-4">Y-tunnus</th>
                  <th scope="col" className="w-[24%] break-words px-2 py-3 font-semibold sm:px-4">Yhtiön nimi</th>
                  <th scope="col" className="w-[23%] break-words px-2 py-3 font-semibold sm:px-4">Rekisteröintipäivämäärä</th>
                  <th scope="col" className="w-[25%] break-words px-2 py-3 font-semibold sm:px-4">Osoite</th>
                  <th scope="col" className="w-[14%] break-words px-2 py-3 font-semibold sm:px-4">Tulos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {searchResults.map((result, index) => (
                  <tr key={`${result.businessId}-${index}`}>
                    <td className="break-words px-2 py-3 font-medium text-slate-900 sm:px-4">
                      {result.businessId}
                    </td>
                    <td className="break-words px-2 py-3 text-slate-700 sm:px-4">
                      {result.company?.name ?? result.csvName ?? '—'}
                    </td>
                    <td className="break-words px-2 py-3 text-slate-700 sm:px-4">
                      {result.company?.registration_date ?? '—'}
                    </td>
                    <td className="break-words px-2 py-3 text-slate-700 sm:px-4">
                      {[
                        result.company?.address,
                        result.company?.postal_code,
                        result.company?.city,
                      ].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="break-words px-2 py-3 sm:px-4">
                      {result.company ? (
                        <span className="font-medium text-emerald-700">Löytyi</span>
                      ) : (
                        <span className="font-medium text-amber-700">Ei löytynyt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

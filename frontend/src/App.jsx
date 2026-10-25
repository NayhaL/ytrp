import { useEffect, useState } from 'react';
import CompanyCsvExport from './components/CompanyCsvExport';
import { fetchCompanySyncStatus } from './services/companySyncService';

function App() {
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncInfoError, setSyncInfoError] = useState('');

  useEffect(() => {
    let active = true;
    let pollTimer;

    async function updateSyncStatus() {
      try {
        const status = await fetchCompanySyncStatus();
        if (!active) return;
        setSyncStatus(status);
        setSyncInfoError('');

        if (status.status === 'starting' || status.status === 'syncing') {
          pollTimer = window.setTimeout(updateSyncStatus, 2000);
        } else {
          pollTimer = window.setTimeout(updateSyncStatus, 10000);
        }
      } catch (error) {
        if (!active) return;
        console.error('Tietokannan synkronoinnin tilan haku epäonnistui:', error);
        setSyncInfoError('Tietokannan päivityksen tilan haku epäonnistui.');
        pollTimer = window.setTimeout(updateSyncStatus, 5000);
      }
    }

    void updateSyncStatus();
    return () => {
      active = false;
      window.clearTimeout(pollTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <section className="bg-gradient-to-r from-indigo-700 to-violet-600 text-white">
        <div className="mx-auto max-w-96 px-6 py-12 sm:py-16">
          <h1 className="text-3xl font-bold sm:text-4xl">Lauri Näyhä Y-tunnus-rikastuspalvelu</h1>
        </div>
      </section>

      <main className="mx-auto max-w-[4400px] px-4 py-10 sm:px-6">
        <section className="mx-auto w-full rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h2 className="text-xl font-semibold">Hae yritystiedot</h2>
          <div className="mt-2 min-h-6 text-sm" role={syncInfoError ? 'alert' : 'status'}>
            {syncInfoError ? (
              <p className="text-red-700">{syncInfoError}</p>
            ) : syncStatus?.status === 'syncing' || syncStatus?.status === 'starting' ? (
              <p className="inline-flex items-center gap-2 text-indigo-700">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700"
                />
                Tietokantaa päivitetään…
              </p>
            ) : syncStatus?.status === 'failed' ? (
              <p className="text-red-700">
                Tietokannan päivitys epäonnistui. Yritetään uudelleen seuraavassa ajossa.
              </p>
            ) : syncStatus?.lastSyncedAt ? (
              <p className="text-emerald-700">
                Tietokanta on ajan tasalla. Päivitetty viimeksi{' '}
                {new Date(syncStatus.lastSyncedAt).toLocaleString('fi-FI')}.
              </p>
            ) : (
              <p className="text-slate-600">Tietokannan päivitys on valmis.</p>
            )}
          </div>
          <div className="mt-6">
            <CompanyCsvExport />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
import { useEffect, useState } from 'react';
import CompanyCsvExport from './components/CompanyCsvExport';
import { fetchCompanySyncStatus } from './services/companySyncService';

function App() {
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncInfoError, setSyncInfoError] = useState('');

  useEffect(() => {
    fetchCompanySyncStatus()
      .then(({ lastSyncedAt: syncedAt }) => setLastSyncedAt(syncedAt))
      .catch((error) => {
        console.error('Viimeisimmän tietokantasynkronoinnin haku epäonnistui:', error);
        setSyncInfoError('Viimeisimmän hakupäivän näyttäminen epäonnistui.');
      });
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
          <p className="mt-2 text-sm text-slate-600" role={syncInfoError ? 'alert' : undefined}>
            {syncInfoError ||
              (lastSyncedAt
                ? `Companies-tietokanta haettu viimeksi ${new Date(lastSyncedAt).toLocaleString('fi-FI')}.`
                : 'Companies-tietokannan hakuaikaa ei ole saatavilla.')}
          </p>
          <div className="mt-6">
            <CompanyCsvExport />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
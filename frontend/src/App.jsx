import { useEffect, useState } from 'react';

function App() {
  const [message, setMessage] = useState('Ladataan...');

  useEffect(() => {
    fetch('/api/message')
      .then((response) => {
        if (!response.ok) throw new Error('Palvelin palautti virheen');
        return response.json();
      })
      .then((data) => setMessage(data.message))
      .catch((error) => {
        console.error('Express-kutsu epäonnistui:', error);
        setMessage('Palvelimeen ei saatu yhteyttä');
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">


      <section className="bg-gradient-to-r from-indigo-700 to-violet-600 text-white">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <h1 className="text-3xl font-bold sm:text-4xl">Laurin autorekisteri</h1>
          <p className="mt-3 max-w-2xl text-indigo-100">
            Kaikki tärkeä yhdessä paikassa.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h2 className="text-xl font-semibold">Päivän kuulumiset</h2>
          <p className="mt-3 leading-7 text-slate-600">{message}</p>
        </section>
      </main>
    </div>
  );
}

export default App;
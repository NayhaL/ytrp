export async function fetchCompanySyncStatus() {
  const response = await fetch('/api/companies/sync-status');

  if (!response.ok) {
    throw new Error(`Synkronointiajan haku epäonnistui: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Object.hasOwn(data, 'lastSyncedAt')) {
    throw new Error('API-vastauksesta puuttuu synkronointiaika');
  }

  return data;
}

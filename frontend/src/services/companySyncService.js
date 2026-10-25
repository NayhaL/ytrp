export async function fetchCompanySyncStatus() {
  const response = await fetch('/api/companies/sync-status');

  if (!response.ok) {
    throw new Error(`Synkronointiajan haku epäonnistui: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (
    !Object.hasOwn(data, 'lastSyncedAt') ||
    !['starting', 'syncing', 'completed', 'failed'].includes(data.status)
  ) {
    throw new Error('API-vastauksesta puuttuu synkronoinnin tila');
  }

  return data;
}

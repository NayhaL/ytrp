# Yritystietojen rikastuspalvelu

Sovellus koostuu React/Vite-käyttöliittymästä, Express-backendistä ja PostgreSQL-tietokannasta. Backend synkronoi PRH:n ZIP-arkiston yritystiedot päivittäin palvelimen paikallisen ajan mukaan klo 05.00.

## Vaatimukset

- Docker ja Docker Compose (suositeltu tapa ajaa koko sovellus)
- Node.js ja npm (vain paikalliseen kehitykseen)
- PRH:n yritysarkiston URL

## Aja koko sovellus Dockerilla

1. Sovellus toimii paikallisessa kehityksessä ilman `.env`-tiedostoa. Compose käyttää oletuksena paikallista kehityssalasanaa `lar-local-dev-only` sekä PRH:n yritysarkiston osoitetta. Voit halutessasi asettaa projektin juuren `.env`-tiedostossa omat arvot:

   ```env
   POSTGRES_PASSWORD=oma_vahva_salasana
   COMPANY_API_URL=https://avoindata.prh.fi/opendata-ytj-api/v3/all_companies
   ```

   Kehityssalasana on julkinen eikä sovellu tuotantoon. Älä tallenna oikeita tunnuksia Git-versionhallintaan. Valinnaiset asetukset:

   ```env
   POSTGRES_DB=lar-db
   POSTGRES_USER=lar
   DB_PORT=5432
   FRONTEND_PORT=6969
   ```

2. Rakenna kuvat ja käynnistä palvelut projektin juuresta:

   ```bash
   docker compose up --build -d
   ```

3. Avaa käyttöliittymä: <http://localhost:6969>

Compose käynnistää PostgreSQL:n, Express-backendin ja Nginxillä tarjoillun frontendin. Frontendin `/api`-pyynnöt välittyvät backendille Docker-verkon sisällä. Tietokannan alustusskripti suoritetaan vain uuden tietokantavolyymin ensimmäisellä käynnistyskerralla. Tietokannan tiedot säilyvät konttien sammutuksen jälkeen nimetyssä Docker-volyymissa.

Backend ajastaa arkiston synkronoinnin seuraavaan palvelimen paikalliseen klo 05.00 ajoon; se ei lataa arkistoa heti käynnistyessään. Ensimmäisellä käyttökerralla tietokanta voi siksi olla tyhjä seuraavaan ajoon asti.

Hyödyllisiä komentoja:

```bash
docker compose logs -f                 # seuraa kaikkien palveluiden lokeja
docker compose logs -f backend         # seuraa backendin lokeja
docker compose stop                    # pysäytä palvelut säilyttäen tiedot
docker compose down                    # poista kontit ja verkko, säilytä tietokantavolyymi
```

`docker compose down -v` poistaa myös PostgreSQL-datavolyymin ja kaikki siihen tallennetut yritystiedot. Käytä sitä vain, jos haluat nollata tietokannan.

## Paikallinen kehitys ilman Dockeria

Paikallisessa ajossa PostgreSQL:n pitää olla käynnissä erikseen. Luo `backend/.env` ja määritä tietokantayhteys sekä PRH-arkiston URL:

```env
DATABASE_URL=postgresql://lar:salasana@localhost:5432/lar-db
COMPANY_API_URL=https://avoindata.prh.fi/opendata-ytj-api/v3/all_companies
PORT=8080
```

Varmista, että `lar-db`-tietokanta on luotu ja alustettu yritystauluilla. Jos skeemaa ei ole vielä luotu, aja projektin juuresta:

```bash
psql -h localhost -U lar -d lar-db -f backend/sql/init.sql
```

Anna pyydettäessä tietokannan salasana. Jos käytät eri käyttäjää, tietokantaa tai porttia, muuta komennon asetukset vastaamaan omaa PostgreSQL-asennustasi.

Käynnistä backend omassa terminaalissa:

```bash
cd backend
npm ci
npm run dev
```

Käynnistä frontend toisessa terminaalissa:

```bash
cd frontend
npm ci
npm run dev
```

Kehityskäyttöliittymä avautuu osoitteeseen <http://localhost:6969>. Viten kehityspalvelin välittää `/api`-pyynnöt backendille osoitteeseen `http://localhost:8080`.

## Tuotantobuildit erikseen

Docker-käynnistys rakentaa frontendin automaattisesti ja käynnistää backendin tuotantotilassa. Yksittäiset build-komennot ovat:

```bash
cd frontend
npm ci
npm run lint
npm run build
```

Frontendin tuotantotiedostot syntyvät `frontend/dist`-kansioon. Backendillä ei ole erillistä build-vaihetta; tuotanto käynnistetään komennolla `npm start` backend-kansiosta.

## Yrityshaku CSV-tiedostosta

CSV:n otsakkeina voi käyttää `yritystunnus` ja `nimi` tai vaihtoehtoisesti `company-id` ja `name`. Vähintään toisen tunnisteen pitää olla jokaisella haettavalla rivillä täytetty. Y-tunnuksella haetaan ensin; nimen perusteella etsitään, jos tunnusta ei ole tai sillä ei löydy tulosta.
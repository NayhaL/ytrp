# Yritystietojen rikastuspalvelu
Ratkaisu ajetaan gitin kloonamisen jälkeen ajamalla docker-compose up --build -d
käyttöliittymä löytyy http://localhost:6969

Tutkin YTJ-rajapintaa ja huomasin, että annettu rajapinta-osoite ei ole kovin sovelias hyvään ratkaisuun.
https://avoindata.prh.fi/fi/ytj/swagger-ui rajapinta-dokumentaatiota lukiessa käy selväksi, ettei rajapinnalle voi antaa
listaa vaadituista y-tunnuksista, joiden avulla rajataan hakua. For-loopattua hakua yritys kerrallaan hakeminen on huono ratkaisu ja se tuottaa vaikeasti kehitettävää ja ylläpidettävää koodia. Sekä tuottaa liikaa rajapinta-kutsuja, joka saattaa aiheutta ongelmia.

YTJ-api antaa myös endpointin http://avoindata.prh.fi/opendata-ytj-api/v3/all_companies jolla voi ladata koko tietokannan
zippinä. Dokumentaatiossa mainitaan, että tietokanta päivitetään vain kerran päivässä.

Tästä syystä päätin tehdä ratkaisun, että lisään applikaatiooni psql-tietokannan, johon ohjelma lataa tietokannan käynnistyessä. Ohjelma myös lataa uuden tietokannan joka aamu kello 05:00.
Tällä vältytään useilta api-kutsuilta, vältetään down-timea jos YTJ-rajapinta on suljettuna.
Tämä myös antaa paremmat mahdollisuudet monimutkaisimmille tietokantahauille jatkokehitykseen.

Ohjelman käynnistyessä kestää noin pari minuuttia että rajapinnan-data päivitetään paikalliseen tietokantaan.

Käytin AI-työkaluja boilerplate-koodin tuottamiseen, virheen hallinnan käsittelyyn sekä nopeaan react-käyttöliitymän luontiin.


Sovellus koostuu React/Vite-käyttöliittymästä, Express-backendistä ja PostgreSQL-tietokannasta. Backend synkronoi PRH:n ZIP-arkiston yritystiedot päivittäin palvelimen paikallisen ajan mukaan klo 05.00.

Terveisin, Lauri Näyhä

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
docker compose down -v                 # poistaa tietokantavolyymit
```

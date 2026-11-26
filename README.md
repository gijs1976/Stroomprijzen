# Stroomprijzen

Dagoverzicht van dynamische stroomprijzen (Nederland) via de publieke
[EnergyZero API](https://api.energyzero.nl), met het goedkoopste aaneengesloten
4-uurs blok van de dag.

## Functies

- Uurprijzen voor **vandaag** en **morgen** (tabbladen), all-in inclusief btw.
- Staafdiagram van alle uren met **y-as schaal** (rasterlijnen in €/kWh) en een
  kleurschaal van groen (goedkoop) naar rood (duur).
- Actuele uur gemarkeerd met **nu**.
- **Slider (2–8 uur)** waarmee de duur van het te zoeken blok ingesteld wordt.
- Samenvattingskaarten: gemiddelde, laagste uur, hoogste uur en het
  **goedkoopste blok** (start, eind en gemiddelde prijs) — handig om
  bijv. de wasmachine, vaatwasser of laadpaal in te plannen.
- Duidelijke melding als de prijzen van morgen nog niet gepubliceerd zijn.

## Live

De app staat online via GitHub Pages:
<https://gijs1976.github.io/Stroomprijzen/>.

## Gebruik

De app is een statische pagina zonder dependencies en build-stap. Omdat de
JavaScript als ES-module geladen wordt, moet hij via een webserver geopend
worden (niet via `file://`):

```bash
python3 -m http.server 8000
```

Daarna openen: <http://localhost:8000>.

De pagina kan ook direct gehost worden, bijvoorbeeld via GitHub Pages.

## Hoe het werkt

- Eén request naar `https://api.energyzero.nl/v1/energyprices` met
  `interval=4` (uurprijzen), `usageType=1` (elektriciteit) en `inclBtw=true`.
- De tijdzone `Europe/Amsterdam` wordt in de browser berekend, inclusief
  zomer- en wintertijd; het API-venster loopt van lokale middernacht vandaag
  tot lokale middernacht overmorgen.
- De prijzen worden per lokale dag gegroepeerd; het goedkoopste blok is een
  schuivend venster van aaneengesloten uren (stelbaar via de slider) met het
  laagste gemiddelde.

## Ontwikkelen

De rekenlogica staat in `js/prices.js` en wordt getest met de ingebouwde
Node-testrunner:

```bash
node --test
```

## Bron

Prijzen komen van de EnergyZero API en zijn de all-in uurprijzen inclusief btw,
zoals ook op <https://www.energyzero.nl/energieprijzen> worden getoond.

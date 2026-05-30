# 🔭 Stjernekikkert

Planlegg stjernekikking med en 8″ Sky-Watcher Dobson fra Norge. Viser Månen, planeter og dypromobjekter med opp/ned-tider, høydekurve, finnekart med stjernebilder, mørke-tidslinje, okular-anbefalinger og observasjonslogg. Alt regnes ut på enheten — appen fungerer offline når den først er lastet.

## Filer

Alle åtte filene må ligge i **samme mappe** (de lenker hverandre):

| Fil | Hva |
|-----|-----|
| `index.html` | Himmelen i dag (Måne, planeter, dyprom, tidslinje, finnekart) |
| `objekter.html` | Katalog (59 objekter) med merker og logg |
| `setup.html` | Oppsett: kikkert, okularer, posisjon, eksport/import |
| `kollimering.html` | Guide for å justere speilene (kollimering) |
| `shared.js` | Motoren — astronomi, katalog, finnekart |
| `shared.css` | Felles stil |
| `manifest.json` | Gjør appen installerbar (PWA) |
| `sw.js` | Service worker — offline-støtte |
| `icon.svg` | App-ikon |

## Legg appen på nett (GitHub Pages)

Appen trenger en **https-adresse** for at GPS, installasjon og offline skal virke. Den kan ikke kjøres skikkelig fra SD-kort eller som lokal fil (`file://`) — da slås disse funksjonene av.

1. **Lag konto** på [github.com](https://github.com) (gratis).
2. **Nytt repo:** trykk «New repository», kall det f.eks. `stjernekikkert`, sett det til **Public**, opprett.
3. **Last opp filene:** på repo-siden, klikk «uploading an existing file». Dra inn alle åtte filene (selve filene, ikke mappa rundt — de skal ligge i roten). Trykk «Commit changes».
4. **Skru på Pages:** **Settings → Pages**, velg branch `main` og mappe `/ (root)`, trykk Save.
5. Etter ~1 minutt vises adressen øverst på samme side:
   ```
   https://<brukernavn>.github.io/stjernekikkert/
   ```

## Installer på telefonen

Åpne adressen i nettleseren på telefonen (med nett første gang):

- **iPhone (Safari):** Del-knappen ⬆️ → «Legg til på Hjem-skjerm».
- **Android (Chrome):** meny ⋮ → «Installer app» / «Legg til på startskjerm». (Appen viser også en grønn **⬇ Installer**-knapp i menylinja når nettleseren tillater det.)

Da får du eget ikon, fullskjerm, og **offline-bruk** etterpå — perfekt for et mørkt observasjonssted uten dekning.

## Kom i gang

1. Gå til **Oppsett** → «Hent min posisjon» (krever https) eller skriv inn koordinater. Lagre gjerne som hjemsted.
2. Huk av okularene du eier, så får hvert objekt en personlig anbefaling.
3. Skru på **nattmodus** (🔴-knappen oppe til høyre) når du er ute — rødt lys bevarer mørketilpasningen.
4. Trykk «Sett det» på objekter du har observert — det fyller loggen og låser opp merker.

## Tips

- **Sikkerhetskopi:** Oppsett → «Eksporter» lagrer oppsett + logg som en fil. Bruk «Importer» på ny telefon.
- **Finnekart:** trykk «▸ vis kart» under et objekt for å se hvilket stjernebilde du skal hoppe fra.
- **Høydekurve:** trykk på «Maks …°»-tiden for å se objektets høyde gjennom natten; dra fingeren over kurven for avlesning.

## Oppdatere appen senere

1. Last opp de endrede filene på nytt i repoet (GitHub spør om å erstatte), commit.
2. **Viktig:** bump cache-versjonen i `sw.js` — endre `stjernekikkert-v1` til `-v2` (øverst, to steder). Ellers henger telefonen igjen på gammel versjon.
3. Lukk og åpne appen et par ganger så den friskes opp.

## Personvern

Alt lagres lokalt i nettleseren på enheten din. Ingen data sendes noe sted. Den eneste nett-bruken er å laste appen første gang (og Google Fonts, som faller tilbake til systemfont offline).

---

*Astronomiske beregninger er forenklede (egnet for å finne objekter, ikke for presisjonsmåling). Koordinater J2000. God stjernekikking! ✦*

# Paul Fellows channel sync — 2026-09-22

Discovery used Paul Fellows' [channel videos](https://www.youtube.com/channel/UCXxPOVkemZxa9BKkfSgJKDg/videos)
(channel ID `UCXxPOVkemZxa9BKkfSgJKDg`, handle `@paulfellows5411`).
The channel identity was checked against the previously cataloged
[Ida and Dactyl video](https://www.youtube.com/watch?v=MbsgoDxBrIs).
The old `@oncearound` channel links returned 404.

The channel listed **363 videos**, including members-only entries, compared
with the prior 348-record inventory. All 15 missing IDs were added to both
source catalogs and the placement ledger without changing existing records.
The curated catalog now has 191 records; 10 additions raise the app's placed
records from 126 to **136** (135 unique video IDs). The review CSV has 190 rows.
The curated catalog already contained two Lambda Orionis records with ID
`QkNMwpANg-4` and different fallback RA decimals, generating identical app rows
because both use the placement ledger's coordinates. That inherited duplicate
is preserved in this incremental sync; every newly added ID occurs once.

## New entries

Dates below are YouTube `upload_date` values, not inferred from listing order.
Titles and IDs are preserved exactly as supplied by the channel.

| Video | Upload date | Placement decision |
|---|---|---|
| [The Cigar Galaxy](https://www.youtube.com/watch?v=IO-bQQQjHGI) | 2026-09-19 | M82 / NGC 3034 |
| [Bodes Galaxy](https://www.youtube.com/watch?v=B-xcjNL9MCw) | 2026-09-18 | M81 / NGC 3031 |
| [The Two Hemispheres of Mars](https://www.youtube.com/watch?v=pk95qpndSVM) | 2026-09-11 | Tracks Mars |
| [The Great Red Spot](https://www.youtube.com/watch?v=yyeWHCWMjwM) | 2026-09-04 | Tracks Jupiter |
| [The Fifth Giant](https://www.youtube.com/watch?v=EJXMsq00xaw) | 2026-08-28 | Unplaced: hypothetical ejected planet |
| [Phoebe](https://www.youtube.com/watch?v=u91Em5m8u6U) | 2026-08-21 | Tracks Saturn as a parent-planet approximation |
| [Tatooine Planets](https://www.youtube.com/watch?v=5vmqb8ZZWzg) | 2026-08-14 | Unplaced: circumbinary planets as a class |
| [Olympus Mons](https://www.youtube.com/watch?v=Uypw6qHt_JA) | 2026-08-07 | Tracks Mars |
| [The Crab Nebula Mystery](https://www.youtube.com/watch?v=TMmDSJTkt3o) | 2026-08-01 | M1; same coordinates as existing Crab video |
| [Mamajeks Object](https://www.youtube.com/watch?v=rj-09uh12ao) | 2026-07-31 | V1400 Cen / J1407 star, not an assumed companion orbit |
| [Sedna](https://www.youtube.com/watch?v=pkykYCDRdKk) | 2026-07-24 | Tracks modeled body 90377 Sedna |
| [Iron Planets](https://www.youtube.com/watch?v=1ASr5_Ls4jI) | 2026-07-17 | Unplaced: iron-rich exoplanets as a class |
| [Earth Trojans](https://www.youtube.com/watch?v=k-tLBBxx4Zs) | unavailable | Unplaced: class, members-only; full metadata/captions inaccessible |
| [L98 59](https://www.youtube.com/watch?v=wGQgd-TfBe4) | 2026-07-10 | L 98-59 star/system |
| [Kamo'oalewa](https://www.youtube.com/watch?v=Y3xnBHMMkI8) | 2026-07-07 | Unplaced: 469219 / 2016 HO3 has no runtime orbit model |

The two ambiguous stellar identities were checked using the videos' English
auto-captions: Mamajek's Object identifies V1400 Centauri/J1407 near the start;
L98 59 identifies the red dwarf and its planets. Captions were inspected in
temporary files, not added to the tracked subtitle archive, so `hasTranscript`
remains false for new records. YouTube descriptions confirm the parent bodies
for the Mars, Jupiter, and Phoebe videos.

## Coordinate provenance

Fixed positions use **ICRS, epoch/equinox J2000** from SIMBAD, queried on
2026-09-22. Decimal degrees in the placement ledger are converted from the
following sexagesimal values; catalog display decimals are rounded to six places.

| SIMBAD identifier / query | RA | Dec |
|---|---|---|
| [M 82](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M+82&output.format=ASCII) | 09 55 52.430 | +69 40 46.93 |
| [M 81](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M+81&output.format=ASCII) | 09 55 33.1726556496 | +69 03 55.062505368 |
| [M 1](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M+1&output.format=ASCII) | 05 34 31.8 | +22 01 03 |
| [V1400 Cen](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=V1400+Cen&output.format=ASCII) | 14 07 47.9297625720 | -39 45 42.767059968 |
| [L 98-59](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=L+98-59&output.format=ASCII) | 08 18 07.6214406393 | -68 18 46.805365587 |

Moving-body fallback coordinates come from the [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html):
observer ephemerides, Earth center `500@399`, quantity `1` (astrometric RA/Dec),
ICRF, degrees, **2026-09-22 00:00 UTC**. Runtime markers for modeled bodies use
engine positions as the simulation time changes; Phoebe is deliberately placed
at Saturn rather than modeled as an individual moon.

| Horizons command | Body | RA (degrees) | Dec (degrees) |
|---|---|---|---|
| `499` | Mars | 118.16024 | 21.79531 |
| `599` | Jupiter | 140.18137 | 16.11753 |
| `699` | Saturn | 11.99063 | 2.21190 |
| `90377;` | Sedna | 62.38208 | 8.89876 |
| `469219;` | Kamoʻoalewa — provenance only | 190.19638 | -49.42987 |

Kamoʻoalewa's verified snapshot is retained in `final_placements.json` with
`placeable: false`. Its app-catalog fallback coordinates are null, so the
near-Earth asteroid is omitted from `videos.json` until it has a runtime model.
A frozen snapshot would show the wrong position when the simulation time changes.

To reproduce a Horizons query (change `COMMAND` for the other rows):

```sh
curl -G 'https://ssd.jpl.nasa.gov/api/horizons.api' \
  --data-urlencode 'format=json' \
  --data-urlencode "COMMAND='499'" \
  --data-urlencode "EPHEM_TYPE='OBSERVER'" \
  --data-urlencode "CENTER='500@399'" \
  --data-urlencode "START_TIME='2026-09-22'" \
  --data-urlencode "STOP_TIME='2026-09-23'" \
  --data-urlencode "STEP_SIZE='1 d'" \
  --data-urlencode "QUANTITIES='1'" \
  --data-urlencode "CSV_FORMAT='YES'" \
  --data-urlencode "ANG_FORMAT='DEG'" \
  --data-urlencode "REF_SYSTEM='ICRF'"
```

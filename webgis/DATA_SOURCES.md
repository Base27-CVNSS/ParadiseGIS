# Sources and provenance

Checked: 2026-10-10.

| Source | Use | Terms / record |
| --- | --- | --- |
| https://offshoreleaks.icij.org/pages/database | Primary official dataset and download | International Consortium of Investigative Journalists (ICIJ); ODbL database, CC-BY-SA contents. See linked license text on source page. |
| https://offshoreleaks-data.icij.org/offshoreleaks/csv/full-oldb.LATEST.zip | Raw CSV archive | Generated 2026-09-09, SHA256 `9e5faeed998b5715157bbdb2a600681d1b5bda259ba004c998b3b2836d3c49aa`. Retrieved 2026-10-10. |
| https://offshoreleaks.icij.org/schema/oldb | Data semantics and REST API availability | Models of entities, officers, intermediaries and addresses. REST endpoints marked private/beta; no public API assumed. |
| https://www.openstreetmap.org/copyright | Basemap attribution | © OpenStreetMap contributors, ODbL. |
| https://operations.osmfoundation.org/policies/tiles/ | Tile-use policy | Visible attribution, direct browser referrer, no bulk download/prefetch. Standard OSM tiles are online and offer no guaranteed service. |
| https://leafletjs.com/reference-1.9.4.html | Versioned map API | Leaflet 1.9.4, BSD-2-Clause. Locally vendored JS/CSS, no runtime CDN dependency. |
| https://github.com/blocksecteam/metasleuth_resources | Interaction inspiration | Repository of investigation reports and tips, not an open implementation of MetaSleuth. No source copied. |
| scripts/prepare_icij.py `PLACES` | Representative capital reference points | Explicit approximate capital positions, not a geocoder. Used only to symbolize country/jurisdiction. Ambiguous/unknown values remain unlocated. |

One-hop selection includes all nodes coded VNM and all edges touching those seeds. Retain sourceID, relation type, dates, valid_until, jurisdiction/country labels and canonical node URL. Names alone do not establish identity; inclusion in ICIJ does not establish wrongdoing.

Map relations express graph connections, not money movement, amounts, a bank account or physical itinerary. User-imported transactions require their own provenance; this tool cannot authenticate uploaded evidence. Keep original records and independently verify matching identities before drawing conclusions.

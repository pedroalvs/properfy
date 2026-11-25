# Bateria adversarial — limiar de relevância do geocoding (rule A)

Measurement / QA harness for the proposed change to **rule A** of the property
geocoding classifier: lowering `MIN_ADDRESS_GEOCODING_RELEVANCE` from **0.8 → 0.7**.

- **Rule A** (`apps/backend/src/modules/property/domain/geocoding.service.ts`,
  `classifyGeocodingResult`): a geocode is **accepted only when**
  `place_type === 'address'` **AND** `relevance >= MIN_ADDRESS_GEOCODING_RELEVANCE`.
  Any other `place_type` → `COARSE_RESULT`; an `address` below the threshold →
  `LOW_RELEVANCE`. This battery does **not** change product code.
- **`expected`** below is **ground truth about the address itself** — whether it
  is a genuinely good, locatable *exact* address (`ACCEPT`) or genuinely
  bad/ambiguous/coarse (`REJECT`). It is **independent of any threshold**. The
  probe (`probe.cjs`) prints the real Mapbox `place_type`/`relevance` and whether
  each row passes at 0.8 vs 0.7, so we can count **false accepts** (expected
  `REJECT` but passes@0.7 — the key risk of lowering the bar) and **false
  rejects** (expected `ACCEPT` but fails@0.7).
- The probe reproduces the **production query** exactly: it formats each row the
  way a Properfy **property** is formatted — the full street line (number
  embedded, Australian order) in the single `street` field, with `number` null
  (properties have no separate number — see the `GeocodableAddress` contract in
  `apps/backend/src/shared/domain/geocoding-address.ts`) — then runs it through
  the exact `formatGeocodingQuery` field order (`geocoding-address.ts:35`), and
  calls Mapbox with the exact adapter params (`limit=1`, `permanent=true`, token;
  no `types`/`country`/`autocomplete` param — see
  `apps/backend/src/modules/property/infrastructure/mapbox-geocoding.service.ts`).

## Path C — manual QA

A human QA tester can type each row into the property form (one street line, then
suburb / state / postcode), submit, and record: did the save **accept** or
**reject** the geocode, and **where did the pin land**? Compare against
`Expected`. The `Street` column already shows the full line as it should be typed
(number + unit are folded into `Street` for typing; the separate `No.` /
`Unit/Line 2` columns are the structured breakdown the JSON block carries).

### The real discriminator: returned suburb == informed suburb

A live run showed that **confidence alone does not separate good from bad
addresses**. Two measured examples:

- `14 Miller St, Chatswood 2067` scored **0.7817** but Mapbox returned
  **North Sydney 2060** — the *wrong* suburb. Lowering the bar to 0.7 would store
  a pin in the wrong place.
- `33 Arcadia St, Penshurst 2034` scored **0.825** and returned **Coogee 2034** —
  the wrong suburb, and it *passes even at 0.8*.

So the first decisive signal is whether the **returned** suburb/locality matches
the **informed** (input) suburb. The probe reads the returned feature's suburb
from the Mapbox `context` array (`locality`, then `place`) — the fragile
`place_name` free-text fallback was **removed**: when there is no `context`
locality/place, the suburb is `null` and the row is rejected.

### The second signal: the result must have a HOUSE NUMBER

A live run showed a second failure mode that confidence does not catch: a query
that matches only the **street** (a bad house number, a suburb-only / no-number /
building-name / PO-Box query) still comes back as `place_type: 'address'` with a
*high* relevance, yet Mapbox returns **no house number**. Measured examples (all
`expected: REJECT`, all pass at 0.8 on confidence alone):

- `99999 Victoria Avenue, Chatswood` (SPS-A07) → `Victoria Avenue, Chatswood` (no number)
- `Victoria Avenue, Chatswood` (SPS-A11) → `Victoria Avenue, Chatswood` @0.907 (no number)
- `Westfield Chatswood` (SPS-A12) / `PO Box 1234, Chatswood` (SPS-A13) → `Chatswood Avenue, Chatswood` (no number)

The signal is the Mapbox v5 feature-level **`address`** field: it carries the civic
house-number string on an exact `place_type='address'` match and is **absent on a
street-only match**. The good controls return it; these street-only rows do not.
The probe captures `feature.address` and adds Rule 4.

### The four candidate rules

- **Rule 1** — `place_type == 'address' && relevance >= 0.8` (today)
- **Rule 2** — `place_type == 'address' && relevance >= 0.7` (proposed)
- **Rule 3** — `place_type == 'address' && relevance >= 0.7 && returned-suburb == input-suburb` (proposed+)
- **Rule 4** — Rule 3 **&& result has a house number** (`feature.address` present/non-empty) (proposed++)

The probe scores all four side by side against this battery's `expected` ground
truth, counting false-accepts (expected REJECT but the rule accepts — a
wrong/coarse pin stored) and false-rejects (expected ACCEPT but the rule blocks a
good address).

**Record sheet (fill during the live/manual run):** for each row, record the
returned suburb, whether it matches the informed suburb, and whether the pin has a
house number. The probe fills this automatically; a path-C tester fills it by eye.

| ID | Informed suburb | Returned suburb (record) | Suburb match? (record) | House no.? (record) |
|----|-----------------|--------------------------|------------------------|---------------------|
| SPS-C01 | Sydney | | | |
| SPS-C02 | Sydney | | | |
| SPS-C03 | North Sydney | | | |
| SPS-C04 | Bondi Beach | | | |
| SPS-C05 | Mosman | | | |
| SPS-C06 | Chatswood | | | |
| SPS-C07 | Brighton-le-Sands | | | |
| SPS-C08 | Newtown | | | |
| SPS-C09 | Woolloomooloo | | | |
| SPS-C10 | Manly | | | |
| SPS-A01 | Chatswood | | | |
| SPS-A02 | Parramatta | | | |
| SPS-A03 | Newtown | | | |
| SPS-A04 | Parramatta | | | |
| SPS-A05 | Sydney | | | |
| SPS-A06 | North Sydney | | | |
| SPS-A07 | Chatswood | | | |
| SPS-A08 | Newtown | | | |
| SPS-A09 | Newtowm | | | |
| SPS-A10 | Chatswood | | | |
| SPS-A11 | Chatswood | | | |
| SPS-A12 | Chatswood | | | |
| SPS-A13 | Chatswood | | | |
| SPS-A14 | Colo | | | |
| SPS-A15 | Cronulla | | | |
| SPS-A16 | Mosman | | | |
| SPS-A17 | Faketown | | | |
| SPS-A18 | Chatswood | | | |
| SPS-A19 | Chatswood | | | |
| SPS-A20 | Norh Sydney | | | |

> Note on ground truth vs. Rule 3/4: the suburb-typo probe **SPS-A20** is
> `expected: ACCEPT` (the user meant North Sydney, and the pin should land there),
> but its informed suburb is the typo `Norh Sydney`, so a strict string compare
> makes Rule 3/4 **reject** it. That is a legitimate false-reject the summary will
> surface — a signal that the suburb comparison would need typo tolerance, or that
> typos are acceptable to reject.

## Battery (30 addresses)

| ID | Street (type as one line) | No. | Unit/Line 2 | Suburb | State | Postcode | Expected | Why |
|----|---------------------------|-----|-------------|--------|-------|----------|----------|-----|
| SPS-C01 | 200 George Street | 200 | — | Sydney | NSW | 2000 | ACCEPT | Complete CBD tower address; exact and unambiguous |
| SPS-C02 | 60 Margaret Street | 60 | — | Sydney | NSW | 2000 | ACCEPT | Complete CBD office address on a real street |
| SPS-C03 | 100 Miller Street | 100 | — | North Sydney | NSW | 2060 | ACCEPT | Plausible number on a major North Sydney road |
| SPS-C04 | 1 Campbell Parade | 1 | — | Bondi Beach | NSW | 2026 | ACCEPT | Iconic beachfront street; exact |
| SPS-C05 | 345 Military Road | 345 | — | Mosman | NSW | 2088 | ACCEPT | Main Mosman road; exact address |
| SPS-C06 | 14 Victoria Avenue, Unit 5 | 14 | Unit 5 | Chatswood | NSW | 2067 | ACCEPT | Unit on the main Chatswood street (explicit Line 2) |
| SPS-C07 | 2/7-11 Queens Road | 2/7-11 | — | Brighton-le-Sands | NSW | 2216 | ACCEPT | Composite unit/number `2/7-11` on a verified real multi-unit address (corrects the invalid "7-11 Regent St, Redfern") |
| SPS-C08 | 32 King Street | 32 | — | Newtown | NSW | 2042 | ACCEPT | Main Newtown street; exact |
| SPS-C09 | 90 Crown Street | 90 | — | Woolloomooloo | NSW | 2011 | ACCEPT | Complete address; civic #90 Crown St is in Woolloomooloo 2011, not Surry Hills (corrected) |
| SPS-C10 | 16 The Corso | 16 | — | Manly | NSW | 2095 | ACCEPT | Well-known Manly street; exact |
| SPS-A01 | 47 Wobblegong Street | 47 | — | Chatswood | NSW | 2067 | REJECT | Nonexistent street in a real suburb → coarse fallback |
| SPS-A02 | 12 Zyxwerp Lane | 12 | — | Parramatta | NSW | 2150 | REJECT | Nonexistent street in a real suburb (second case) |
| SPS-A03 | 345 Military Road | 345 | — | Newtown | NSW | 2042 | REJECT | Real street (Mosman's) placed in the WRONG suburb |
| SPS-A04 | 1 Campbell Parade | 1 | — | Parramatta | NSW | 2150 | REJECT | Campbell Parade only exists at Bondi Beach; wrong suburb |
| SPS-A05 | 200 George Street | 200 | — | Sydney | NSW | 3000 | ACCEPT | Correct address, wrong (Melbourne 3000) postcode; Mapbox ignores it and returns the correct Sydney point — acceptable, correct pin |
| SPS-A06 | 100 Miller Street | 100 | — | North Sydney | NSW | 4000 | ACCEPT | Correct address, wrong (Brisbane 4000) postcode; Mapbox ignores it and returns the correct North Sydney point — acceptable, correct pin |
| SPS-A07 | 99999 Victoria Avenue | 99999 | — | Chatswood | NSW | 2067 | REJECT | Street number does not exist → street-level fallback |
| SPS-A08 | 32 Kng Street | 32 | — | Newtown | NSW | 2042 | ACCEPT | Light (1-char) typo of "King"; the intended address is real and should still resolve |
| SPS-A09 | 32 Knig Streeet | 32 | — | Newtowm | NSW | 2042 | REJECT | Heavy typo across street AND suburb; too garbled to resolve confidently |
| SPS-A10 | *(none)* | — | — | Chatswood | NSW | 2067 | REJECT | Suburb + postcode only, no street → locality-level, not an address |
| SPS-A11 | Victoria Avenue | — | — | Chatswood | NSW | 2067 | REJECT | Street without a number → street-level, not an exact point |
| SPS-A12 | Westfield Chatswood | — | — | Chatswood | NSW | 2067 | REJECT | Building name, no street → POI, not an address |
| SPS-A13 | PO Box 1234 | — | — | Chatswood | NSW | 2067 | REJECT | PO Box is not a physical, inspectable address |
| SPS-A14 | Putty Road | — | — | Colo | NSW | 2756 | REJECT | Long rural road with no number → coarse, requires a manual pin |
| SPS-A15 | 150 George Street | 150 | — | Cronulla | NSW | 2230 | REJECT | "George Street" homonym in a suburb where it mismatches/ambiguates |
| SPS-A16 | 345 Military Road | 345 | — | Mosman | NSW | 2060 | ACCEPT | Right street/suburb, wrong (local) postcode 2060; the point exists and should resolve |
| SPS-A17 | 10 Main Street | 10 | — | Faketown | NSW | 2999 | REJECT | Nonexistent suburb; cannot resolve to a real place |
| SPS-A18 | Pacific Highway | — | — | Chatswood | NSW | 2067 | REJECT | Long highway with no number → road-level, coarse |
| SPS-A19 | *(none)* | — | Unit 3 | Chatswood | NSW | 2067 | REJECT | Unit with no street → incomplete, not locatable |
| SPS-A20 | 100 Miller Street | 100 | — | Norh Sydney | NSW | 2060 | ACCEPT | Light typo of the suburb ("Norh" for North); street + postcode correct, should resolve |

### Case coverage

- **Nonexistent street in a real suburb:** SPS-A01, SPS-A02
- **Real street in the WRONG suburb:** SPS-A03, SPS-A04
- **Real street with another city's postcode:** SPS-A05, SPS-A06 — *reclassified
  to ACCEPT after the live run: Mapbox ignores the bad postcode and returns the
  correct point, so the pin is right (same behaviour as the 7 real imports)*
- **Street number that doesn't exist:** SPS-A07 — *a key "street-only, no house
  number" case R4 targets*
- **Light typo:** SPS-A08 (street), SPS-A20 (suburb)
- **Heavy typo:** SPS-A09
- **Suburb + postcode only (no street):** SPS-A10
- **Street without a number:** SPS-A11
- **Building name with no street:** SPS-A12
- **PO Box:** SPS-A13
- **Rural road without a number:** SPS-A14
- **Homonym street in the wrong suburb:** SPS-A15
- **Extra edge cases:** wrong local postcode (SPS-A16), nonexistent suburb
  (SPS-A17), coarse highway (SPS-A18), unit-with-no-street (SPS-A19)
- **Street-only / no-house-number cases (R4 target):** SPS-A07, SPS-A10, SPS-A11,
  SPS-A12, SPS-A13 — each returns `place_type: address` at high relevance but with
  no `feature.address`
- **Good controls (ACCEPT):** SPS-C01…SPS-C10, including a unit with an explicit
  Line 2 (SPS-C06) and a composite number `2/7-11` (SPS-C07, verified real
  2/7-11 Queens Road, Brighton-le-Sands)

Expected totals (after the live-run corrections): **15 ACCEPT** (10 controls +
SPS-A05, SPS-A06 reclassified + SPS-A08, SPS-A16, SPS-A20) and **15 REJECT**.
SPS-A08/A16/A20 remain deliberate **false-reject probes**.

## Machine-readable battery

The probe parses the first ` ```json ` block below. `street` is the street name,
`number` the (possibly composite) street number, `unit` the Line 2 — the probe
composes the production `street` field as `"{number} {street}"` (Australian
order) and runs the exact `formatGeocodingQuery` order. Keep this block in sync
with the table above.

```json
[
  { "id": "SPS-C01", "street": "George Street",    "number": "200",    "unit": null,     "suburb": "Sydney",        "state": "NSW", "postcode": "2000", "country": "AU", "expected": "ACCEPT", "why": "Complete CBD tower address; exact and unambiguous" },
  { "id": "SPS-C02", "street": "Margaret Street",  "number": "60",     "unit": null,     "suburb": "Sydney",        "state": "NSW", "postcode": "2000", "country": "AU", "expected": "ACCEPT", "why": "Complete CBD office address on a real street" },
  { "id": "SPS-C03", "street": "Miller Street",    "number": "100",    "unit": null,     "suburb": "North Sydney",  "state": "NSW", "postcode": "2060", "country": "AU", "expected": "ACCEPT", "why": "Plausible number on a major North Sydney road" },
  { "id": "SPS-C04", "street": "Campbell Parade",  "number": "1",      "unit": null,     "suburb": "Bondi Beach",   "state": "NSW", "postcode": "2026", "country": "AU", "expected": "ACCEPT", "why": "Iconic beachfront street; exact" },
  { "id": "SPS-C05", "street": "Military Road",    "number": "345",    "unit": null,     "suburb": "Mosman",        "state": "NSW", "postcode": "2088", "country": "AU", "expected": "ACCEPT", "why": "Main Mosman road; exact address" },
  { "id": "SPS-C06", "street": "Victoria Avenue",  "number": "14",     "unit": "Unit 5", "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "ACCEPT", "why": "Unit on the main Chatswood street (explicit Line 2)" },
  { "id": "SPS-C07", "street": "Queens Road",     "number": "2/7-11", "unit": null,     "suburb": "Brighton-le-Sands", "state": "NSW", "postcode": "2216", "country": "AU", "expected": "ACCEPT", "why": "Composite unit/number 2/7-11 on a verified real multi-unit address (corrects the invalid 7-11 Regent St Redfern)" },
  { "id": "SPS-C08", "street": "King Street",      "number": "32",     "unit": null,     "suburb": "Newtown",       "state": "NSW", "postcode": "2042", "country": "AU", "expected": "ACCEPT", "why": "Main Newtown street; exact" },
  { "id": "SPS-C09", "street": "Crown Street",     "number": "90",     "unit": null,     "suburb": "Woolloomooloo",  "state": "NSW", "postcode": "2011", "country": "AU", "expected": "ACCEPT", "why": "Complete address; civic #90 Crown St is in Woolloomooloo 2011, not Surry Hills (corrected)" },
  { "id": "SPS-C10", "street": "The Corso",        "number": "16",     "unit": null,     "suburb": "Manly",         "state": "NSW", "postcode": "2095", "country": "AU", "expected": "ACCEPT", "why": "Well-known Manly street; exact" },
  { "id": "SPS-A01", "street": "Wobblegong Street","number": "47",     "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Nonexistent street in a real suburb -> coarse fallback" },
  { "id": "SPS-A02", "street": "Zyxwerp Lane",     "number": "12",     "unit": null,     "suburb": "Parramatta",    "state": "NSW", "postcode": "2150", "country": "AU", "expected": "REJECT", "why": "Nonexistent street in a real suburb (second case)" },
  { "id": "SPS-A03", "street": "Military Road",    "number": "345",    "unit": null,     "suburb": "Newtown",       "state": "NSW", "postcode": "2042", "country": "AU", "expected": "REJECT", "why": "Real street (Mosman's) placed in the WRONG suburb" },
  { "id": "SPS-A04", "street": "Campbell Parade",  "number": "1",      "unit": null,     "suburb": "Parramatta",    "state": "NSW", "postcode": "2150", "country": "AU", "expected": "REJECT", "why": "Campbell Parade only exists at Bondi Beach; wrong suburb" },
  { "id": "SPS-A05", "street": "George Street",    "number": "200",    "unit": null,     "suburb": "Sydney",        "state": "NSW", "postcode": "3000", "country": "AU", "expected": "ACCEPT", "why": "Correct address, wrong (Melbourne 3000) postcode; Mapbox ignores it and returns the correct Sydney point -- acceptable, correct pin" },
  { "id": "SPS-A06", "street": "Miller Street",    "number": "100",    "unit": null,     "suburb": "North Sydney",  "state": "NSW", "postcode": "4000", "country": "AU", "expected": "ACCEPT", "why": "Correct address, wrong (Brisbane 4000) postcode; Mapbox ignores it and returns the correct North Sydney point -- acceptable, correct pin" },
  { "id": "SPS-A07", "street": "Victoria Avenue",  "number": "99999",  "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Street number does not exist -> street-level fallback" },
  { "id": "SPS-A08", "street": "Kng Street",       "number": "32",     "unit": null,     "suburb": "Newtown",       "state": "NSW", "postcode": "2042", "country": "AU", "expected": "ACCEPT", "why": "Light 1-char typo of King; intended address is real and should still resolve" },
  { "id": "SPS-A09", "street": "Knig Streeet",     "number": "32",     "unit": null,     "suburb": "Newtowm",       "state": "NSW", "postcode": "2042", "country": "AU", "expected": "REJECT", "why": "Heavy typo across street AND suburb; too garbled to resolve confidently" },
  { "id": "SPS-A10", "street": null,              "number": null,     "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Suburb + postcode only, no street -> locality-level, not an address" },
  { "id": "SPS-A11", "street": "Victoria Avenue",  "number": null,     "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Street without a number -> street-level, not an exact point" },
  { "id": "SPS-A12", "street": "Westfield Chatswood", "number": null,  "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Building name, no street -> POI, not an address" },
  { "id": "SPS-A13", "street": "PO Box 1234",      "number": null,     "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "PO Box is not a physical, inspectable address" },
  { "id": "SPS-A14", "street": "Putty Road",       "number": null,     "unit": null,     "suburb": "Colo",          "state": "NSW", "postcode": "2756", "country": "AU", "expected": "REJECT", "why": "Long rural road with no number -> coarse, requires a manual pin" },
  { "id": "SPS-A15", "street": "George Street",    "number": "150",    "unit": null,     "suburb": "Cronulla",      "state": "NSW", "postcode": "2230", "country": "AU", "expected": "REJECT", "why": "George Street homonym in a suburb where it mismatches/ambiguates" },
  { "id": "SPS-A16", "street": "Military Road",    "number": "345",    "unit": null,     "suburb": "Mosman",        "state": "NSW", "postcode": "2060", "country": "AU", "expected": "ACCEPT", "why": "Right street/suburb, wrong local postcode 2060; the point exists and should resolve" },
  { "id": "SPS-A17", "street": "Main Street",      "number": "10",     "unit": null,     "suburb": "Faketown",      "state": "NSW", "postcode": "2999", "country": "AU", "expected": "REJECT", "why": "Nonexistent suburb; cannot resolve to a real place" },
  { "id": "SPS-A18", "street": "Pacific Highway",  "number": null,     "unit": null,     "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Long highway with no number -> road-level, coarse" },
  { "id": "SPS-A19", "street": null,              "number": null,     "unit": "Unit 3", "suburb": "Chatswood",     "state": "NSW", "postcode": "2067", "country": "AU", "expected": "REJECT", "why": "Unit with no street -> incomplete, not locatable" },
  { "id": "SPS-A20", "street": "Miller Street",    "number": "100",    "unit": null,     "suburb": "Norh Sydney",   "state": "NSW", "postcode": "2060", "country": "AU", "expected": "ACCEPT", "why": "Light typo of the suburb (Norh for North); street + postcode correct, should resolve" }
]
```

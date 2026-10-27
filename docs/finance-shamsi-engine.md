# Task 0.1 — Shamsi calendar engine

Implemented and verified on 2026-09-26. User acceptance is pending.

## Scope and behavior

The shared package wraps the pinned `jalaali-js` **2.0.1** dependency. Both the
API's CommonJS build and the web app's ESM build use the same wrapper. A test
prevents application source from importing the dependency outside that wrapper.

Supported Shamsi years are **1350–1499**, inclusive: Gregorian 1971-03-21 through
2121-03-20. Dates outside that interval are rejected. Extending the interval
requires extending verification first. The upstream algorithm documents a
future divergence from Intl; the supported interval is inside their agreement.

- Calendar dates use strict `YYYY-MM-DD` strings with Latin digits.
- Invalid dates are rejected, including 30 Hoot in a common year and 31 Mizan.
- `Date` values represent absolute instants; conversions use Kabul civil time.
- Kabul uses UTC+04:30 throughout this supported interval. Any future timezone
  rule change must be reflected in the wrapper and its independent tests.
- A day includes its start and excludes the next day's start: `[start, end)`.
- Afghan month names are available in English, Dari and Pashto.

**Acceptance example:** 1404-01-01 = 2025-03-21. Its start at midnight in Kabul is
`2025-03-20T19:30:00.000Z`. One millisecond earlier belongs to 1403-12-30.

No fiscal tables, posting-date migration or journal behavior changed. Those
belong to subsequent roadmap tasks.

## Public wrapper

Import from `@redmars/shared`; implementation is in `packages/shared/src/shamsi.ts`.

| Function | Result |
|---|---|
| `parseShamsiDate(value)` | Validated numeric year/month/day |
| `shamsiToGregorian(value)` | Gregorian civil date string |
| `gregorianToShamsi(value)` | Shamsi civil date string |
| `shamsiToUtc(value)` | Kabul start of day as a Date instant |
| `utcToShamsi(instant)` | Shamsi date in Kabul for a Date instant |
| `shamsiDayBounds(value)` | Start and exclusive next-day start as Date instants |
| `isShamsiLeapYear(year)` | Leap-year boolean within the supported interval |
| `shamsiMonthLength(year, month)` | Number of days in the month |
| `formatShamsiDate(value, language)` | Afghan month name; language is en, prs or ps |

`utcToShamsi` projects an instant to a civil date, discarding its time of day.
Converting that date back to UTC returns the start of its day.

## Verification

Run `pnpm --filter @redmars/shared test`. CI runs this command too.

The 13 tests verify both module builds, fixed conversion pairs, known leap years,
month lengths, invalid dates, range boundaries, Afghan labels and dependency
isolation. They compare **every one of the 54,787 supported days** against the
independent ICU Persian calendar exposed by `Intl.DateTimeFormat`, including
the Kabul midnight instant and round trips. Separate processes exercise UTC,
Asia/Kabul and America/New_York as host timezones.

The shared, API and web production builds pass. The web build retains its existing
large-bundle warning. Browser checks in the running Finance screen verified the
1404-01-01 conversion in both directions, accepted 1403-12-30, rejected 1404-12-30,
and confirmed the displayed UTC boundaries. API health reports the database up.

### Fixed date fixtures

| Shamsi | Gregorian |
|---|---|
| 1391-01-01 | 2012-03-20 |
| 1394-12-29 | 2016-03-19 |
| 1395-01-01 | 2016-03-20 |
| 1395-01-23 | 2016-04-11 |
| 1395-12-30 | 2017-03-20 |
| 1396-01-01 | 2017-03-21 |
| 1399-01-01 | 2020-03-20 |
| 1399-12-30 | 2021-03-20 |
| 1400-01-01 | 2021-03-21 |
| 1403-01-01 | 2024-03-20 |
| 1403-12-30 | 2025-03-20 |
| 1404-01-01 | 2025-03-21 |
| 1404-06-31 | 2025-09-22 |
| 1404-07-01 | 2025-09-23 |
| 1404-07-05 | 2025-09-27 |
| 1404-12-29 | 2026-03-20 |
| 1405-01-01 | 2026-03-21 |

Leap fixtures: 1391, 1395, 1399, 1403 and 1408. Common-year fixtures: 1394, 1396,
1400, 1404 and 1407. The fixed fixtures are regression expectations; the full
independent ICU comparison validates their calendar context as well.

### Sources

- [jalaali-js upstream documentation](https://github.com/jalaali/jalaali-js):
  conversion/validation API, Borkowski algorithm, 1391/1395 leap examples and
  1395-01-23 conversion example; algorithm agreement with Intl through 2256.
- [Afghan Embassy Nowruz 1404 notice](https://www.afghanembassy.ca/news/1404.html):
  independent Afghan reference for New Year 1404 on March 21, 2025.
- [IANA timezone data, Asia/Kabul](https://github.com/eggert/tz/blob/main/asia):
  UTC+04:30 since 1945, with no DST rule.

## Manual acceptance in the app

Open Finance and expand **Shamsi calendar** at the top. The converter is available
before finance initialization and does not save anything to the books.

1. Enter `1404-01-01`: expect Gregorian `2025-03-21`, UTC start
   `2025-03-20T19:30:00.000Z`, and a common year.
2. Select **Gregorian to Shamsi** and enter `2025-03-21`: expect `1404-01-01`.
3. Select **Shamsi to Gregorian**, then enter `1403-12-30`: expect
   `2025-03-20` and a leap year with 30 days in Hoot.
4. Enter `1404-12-30`: expect an invalid-date message and no conversion result.
5. Enter `1404-07-05`: expect `2025-09-27` and the label **5 Mizan 1404**.
6. Use **Today in Kabul** or the example buttons; optionally switch the app
   language to review the Dari and Pashto labels.

Remaining roadmap work begins at **0.2**, after the user's review of 0.1.

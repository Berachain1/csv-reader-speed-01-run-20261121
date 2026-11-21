[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Berachain1/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Berachain1/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast csv-reader drop-in

Entry for the make.fun bounty
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
a faster drop-in for make.fun's own csv-reader 1.0.0 that answers exactly
as it does on every case, including every broken row.

`solve.js` (Node 22, dependency-free, no network) exports `run(input)`,
which reads `{text, header}` once, left to right, and returns
`{columns, rows, errors}` exactly as csv-reader 1.0.0 does. `main.ts`
reads every case from `/input/cases.json`, answers each with `run`, and
writes `/output/answers.json`.

How it is fast: the reference walks the text one character at a time,
growing each field with `value += c`. This version jumps instead — an
unquoted field is found with `indexOf` over the next comma, line feed
and carriage return and taken with one slice; a quoted field is found
with `indexOf` over the next quote and taken with one slice per quoted
run; and a whole record that sits on one line with no quote and no stray
CR is split on commas alone. Only the rare broken bits (a stray CR, a
doubled quote, a line break inside quotes) are handled character by
character, and only inside the short stretch that holds them.

Verified locally: 14,000 random broken-CSV fuzz cases, 72 edge cases and
80 long texts of 2,000 records each — 0 mismatches against csv-reader
1.0.0 — and the kit's practice set 6/6. On the practice set (~10.2 MB)
it runs in ~195 ms median against the baseline's ~536 ms (2.75x faster).

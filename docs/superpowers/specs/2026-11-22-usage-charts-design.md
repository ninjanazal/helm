# Deck USAGE: lighter, with braille charts

**Intent.** The ◷ USAGE section is too dense and text-heavy. Show the trend instead of piles of figures.

**Goals.** Context: one-line meter + short 1-row braille trail of recent turns (mock-up option 9). 5h limit: header
(`5h 61%  ↻1h 12m`) + 3-row braille line over time (option 1; 2 rows and no ↻ under 40 cols). Week stays a meter.
Tokens + cost fold into one dim line `$1.23 · 412k tok`.

**Non-goals.** Other deck sections; frame animation (nothing moves unless a turn runs); new dependencies.

**Anti-goals.** Invented data: series come only from `deckMeasure` (5h) and turn end (context).

**Removed.** Category legend + stacked parts, cache %, ↑/↓ token split.

**Approaches.** Ten styles were mocked live in `docs/usage-chart-options.html` (braille line/area, box-drawing with
axis, block sparkline, ⅛ column bars, quadrant blocks, overlaid series, heat strip, meter + trail, line + forecast).
The person picked 9 for context (keeps the familiar meter, adds trend cheaply in one line) and 1 for 5h (most detail
per row for the series that matters over time).

**Decided.** Pure `brailleLine(values, w, h, max=100)` in deck-core (newest at right, consecutive points joined).
Series capped at 120; `fiveSeries` resets when the 5h `resetsAt` changes. Fallback to plain meters below 2 samples.
Fixed 0–100% y range.

**Left to the builder.** Exact trail/meter width split (~30/70), state field placement, test fixtures.

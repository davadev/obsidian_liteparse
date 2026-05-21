# Templates

Parsing templates let you include or exclude rectangular regions of a PDF page before output is assembled.

Use cases:

- remove repeating headers/footers/page numbers
- read multi-column pages in a defined order
- segment one page into named sections

## Matching behavior

- Each template has a `match` regex tested against the PDF vault-relative path.
- First matching template wins.
- Optional `pages` restricts a template to specific pages (for example `1-5,10`).

## Coordinate system

- `x`, `y`, `w`, `h` are percentages in range `0..100`.
- Origin is top-left.
- `x=0, y=0` is top-left of page; `x=100, y=100` is bottom-right.

## Region roles

- `exclude`: drop text items whose center is inside that rectangle.
- `include`: collect text from that rectangle as one output section.

When include regions exist, output follows include-region order. Excludes are applied before include filtering.

## Editing templates

In settings, you can:

- manage template cards (name, regex, page range)
- manage region rows (`name`, `role`, `x`, `y`, `w`, `h`, optional `headingLevel`)
- launch **Edit visually...** to draw regions on a rendered PDF page
- open **Advanced JSON editor...** for direct JSON editing

## Example: remove banner/footer, keep body

```json
[
  {
    "name": "lecture-slides",
    "match": "_resources/.*\\.pdf",
    "pages": "",
    "regions": [
      { "name": "banner",  "role": "exclude", "x": 0, "y": 0,  "w": 100, "h": 8 },
      { "name": "pagenum", "role": "exclude", "x": 0, "y": 95, "w": 100, "h": 5 },
      { "name": "body",    "role": "include", "x": 0, "y": 8,  "w": 100, "h": 87 }
    ]
  }
]
```

## Example: two-column order

```json
[
  {
    "name": "two-column",
    "match": ".*two-col.*\\.pdf",
    "regions": [
      { "name": "left",  "role": "include", "x": 0,  "y": 8, "w": 50, "h": 87 },
      { "name": "right", "role": "include", "x": 50, "y": 8, "w": 50, "h": 87 }
    ]
  }
]
```

## Two-column auto-detect

If a page (or a single body include region) contains two text columns separated by a clear vertical gutter, the parser emits them in reading order — full-width lines first (e.g. titles), then the left column in full, then the right column in full. Single-column pages and pages where the parser isn't confident fall back to the normal reflow.

This runs only when the **Auto-detect two-column layouts** setting is on (default) and the template does not already define two or more include regions. Defining two include regions side-by-side (like the example above) is the manual override — it always wins.

## Probes (pre-classification)

Probes detect what kind of page you're on before the include/exclude regions run. Each probe defines:

- a rectangular area on the page (percent, top-left origin — same as regions),
- a regex tested against the text inside that area,
- an action to take when the regex matches.

Actions:

| Action | Effect |
|--------|--------|
| `use-current` | Continue with the current template's regions. Default; same as no probe match. |
| `skip` | Drop the entire page from output — no `### Page N`, no body, no divider. |
| `switch` | Dispatch the page to a different template (referenced by name). The target template can have its own probes; switch chains are cycle-guarded. |

Probes are evaluated in order; the first match wins. Order matters — use the ↑ / ↓ buttons in the settings card to reorder.

Use cases:

- skip "Exercise" or "Übung" slides from a lecture deck,
- detect a different layout signature (e.g. a course-logo footer) and dispatch to a layout-specific template,
- mark known title slides for special handling.

### Example: skip exercise slides

```json
[
  {
    "name": "AI-1 Slides",
    "match": "AI-1.*\\.pdf$",
    "probes": [
      {
        "name": "exercise-footer",
        "x": 0, "y": 93, "w": 100, "h": 7,
        "pattern": "Exercise|Übung",
        "flags": "i",
        "onMatch": { "kind": "skip" }
      }
    ],
    "regions": [
      { "name": "banner",  "role": "exclude", "x": 0, "y": 0,  "w": 100, "h": 8 },
      { "name": "pagenum", "role": "exclude", "x": 0, "y": 0,  "w": 8,   "h": 8 },
      { "name": "body",    "role": "include", "x": 0, "y": 8,  "w": 100, "h": 85 }
    ]
  }
]
```

### Example: dispatch to a different layout

```json
[
  {
    "name": "AI-1 Slides",
    "match": "AI-1.*\\.pdf$",
    "probes": [
      {
        "name": "exercise-title",
        "x": 0, "y": 8, "w": 100, "h": 8,
        "pattern": "^\\s*Exercise\\b",
        "onMatch": { "kind": "switch", "templateName": "AI-1 Exercise Layout" }
      }
    ],
    "regions": [ /* normal-slide regions */ ]
  },
  {
    "name": "AI-1 Exercise Layout",
    "match": "",
    "regions": [ /* exercise-slide regions */ ]
  }
]
```

The `AI-1 Exercise Layout` template has an empty `match` so it never wins by path — it's only ever reached via the `switch` action.

### Editing probes

Each template card in the settings tab has a **Probes (optional pre-classification)** subsection with the same column structure used in the JSON above. The visual editor has a **Draw: Regions / Probes** toggle — switch to Probes, drag a small rectangle on the page (rendered dotted-magenta), then set the regex and action in the probes table below the canvas.

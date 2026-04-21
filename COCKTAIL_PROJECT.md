# Cocktail Library — Project Spec & Handoff

## Context
Migrating a personal Highball app library (Studio Neat, iOS, abandoned ~2019) to a self-hosted PWA. All recipe data extracted via PDF screenshot batches → Claude OCR → structured JSON seed file.

## Repository
`trillnjoy/Claude_Artifacts` — GitHub Pages at `trillnjoy.github.io/Claude_Artifacts/`

---

## Extraction Status

| Batch | File | Recipes | Inventory Categories |
|-------|------|---------|----------------------|
| 1 | Cocktails_1.pdf | 28 | 4 (Bourbon & Rye, Irish Whiskey, Scotch, Gin) |
| 2 | Cocktails_2.pdf | 28 | 3 (Vodka, Rum, Cognac & Brandy) |
| 3 | Cocktails_3.pdf | 39 (after dedup) | 6 (Champagne, Tequila & Mezcal, Aperol & Campari, Tropical Drinks, Fruit Liqueurs, Nut/Herbal Liqueurs) |
| **Total** | | **95 unique** | **13 categories** |

One short of the 96 stated in original spec — Cran-Rosemary Sparkler appeared twice in Batch 3 (duplicate card). Verify count against app.

### Extraction Flags (verify against app)
- **Val's Porch Cocktail**: OCR breaks corrected — verify method
- **Hot Toddy**: method says "Stir bourbon" but spirit is Rye — transcribed as written
- **The Sherpa**: Allspice Dram quantity has null unit — check original
- **Rum inventory**: bottle sizes rendered as oz amounts — stored as-is
- **Old Fashioned Death Star**: method truncated at "dented and circumferen..." — get full text from app
- **Tatooine Sunrise**: grenadine mentioned in method but not in ingredients — check original

---

## JSON Seed Schema

### Recipe record
```json
{
  "name": "Cocktail Name",
  "credit": "Troy McGuire | Studio Neat | null",
  "ingredients": [
    {"amount": "2", "unit": "oz", "item": "Bourbon"},
    {"amount": "1", "unit": "dash", "item": "Angostura Bitters"},
    {"amount": null, "unit": null, "item": "Egg White"}
  ],
  "method": "Full method text as written on card.",
  "glass": "rocks | martini | coupe | highball | collins | mule mug | mug | flute | wine | snifter",
  "presentation": {
    "vessel": "rocks",
    "color": "#8B3A2A",
    "float": "wine | rum | null",
    "ice": "huge | cubes | crushed | null",
    "citrus": "lemon-twist | lemon-wedge | lemon-peel | lime-twist | lime-wedge | lime-peel | orange-twist | orange-wedge | orange-peel | null",
    "garnish": ["cherry", "strawberry", "olive", "celery", "pineapple-wedge", "cucumber-slice"],
    "extras": ["umbrella", "salted-rim", "tajin-rim", "straw", "whipped-cream", "mint-sprig"]
  }
}
```

### Bar inventory record
```json
{
  "category": "Bourbon & Rye",
  "bottles": ["Larceny", "Willett Pot Still"]
}
```

### Units in use
`oz, dash, tsp, tbsp, pinch, drop, null`

### Glass types in use
`rocks, martini, coupe, highball, collins, mule mug, mug, flute, wine, snifter`

---

## PWA Files

### cocktail.html (main PWA)
- Dark parchment/ink/terracotta/amber theme (Proof in Practice branding)
- Playfair Display headers, Lora body
- Fetches `cocktails_seed.json` from same directory
- Falls back to 2-recipe inline seed if JSON unavailable
- Views: Recipe list (single-column rows), Recipe detail, Top Shelf (bar inventory)
- Header nav: Recipes / Top Shelf tabs (dark→parchment inversion)
- Filter tabs: spirit-derived from seed data, scrollable, ink background
- Footer: recipe count only
- SW: network-first on seed JSON, cache-first on shell

### compositor.html (drink visual composer — standalone tool)
Standalone SVG drink compositor for assigning visual presentation metadata to each recipe. Output is the `presentation` JSON object to embed in the seed.

#### Vessel support (12 vessels)
`rocks, collins, highball, coupe, cocktail, nick-nora, flute, snifter, irish, tropical, julep, mule`

#### Visual layers (render order)
1. `vessel-layer` — glass SVG with gradient fills
2. `liquid-layer` — drink color fill clipped to inner vessel diameter
3. `float-layer` — thin dark layer at meniscus (wine or rum float)
4. `ice-layer` — huge cube / cubes / crushed shards filling to meniscus
5. `vessel-mask-layer` — **opaque redraw for non-glass vessels** (mule copper body redrawn over liquid/ice)
6. `garnish-layer` — garnishes + citrus
7. `extras-layer` — umbrella, rim treatments, straw, whipped cream, mint

#### Physics rules encoded
- **Cherry (Luxardo)**: sinks to bottom of vessel, stem rises up
- **Strawberry**: cross-section slice perched at rim
- **Olive**: 3-olive skewer — flat across rim on wide vessels, angled insert on tall vessels
- **Celery**: stalk base rests on vessel bottom, leaves extend above rim
- **Cucumber**: dense — sinks to vessel bottom, slightly submerged opacity
- **Pineapple wedge**: apex DOWN, base at rim, slit grips rim
- **Citrus wedges**: apex DOWN, base at rim; slit runs from apex UP through rind+pith only (stops at pith/pulp boundary); rotated to conform to vessel wall angle per lookup table
- **Citrus twists**: S-curve Bézier ribbon above rim
- **Citrus peels**: broad curved quadrangle
- **Umbrella**: canopy upright and vertical; wooden stick at angle into drink
- **Straw**: green (green) or steel grey (mule); reaches from near vessel bottom to above rim
- **Whipped cream**: scalloped mounds rising above meniscus; floats above any float layer
- **Mint sprig**: individual serrated leaves, not a mushroom arch
- **Salted rim / Tajin rim**: irregular crystal/granule rects adhered to rim edge

#### Vessel wall angle lookup (for citrus wedge tilt)
```js
rocks:0, coupe:0, cocktail:0, snifter:0,
'nick-nora':35, port:35,
collins:78, highball:75, irish:75, flute:72, julep:70,
tropical:40, mule:20
```

#### iOS/host override hardening
- `<meta name="color-scheme" content="dark">`
- All colors explicit with `!important`
- Body has inline style + JS imperative override
- SVG icons use explicit hex `#c8a870` (not `currentColor`)
- `#preview-wrap` has explicit dark background
- Opaque vessel: `OPAQUE_VESSELS = Set(['mule'])` — mask layer redraws full copper body

---

## Known Issues / Next Steps

### Compositor
- **PNG vs SVG decision**: Strong case for switching garnish/vessel assets to pre-composited PNGs layered on canvas. SVG coordinate geometry for organic shapes (citrus, celery leaves, olive skewer) is extremely labor-intensive and error-prone. Photoshop-composited PNGs would yield better results faster. Scaling advantage of SVG is minimal at 180×230px display size.
- **Citrus wedge positioning**: Wall-angle lookup table approach is correct architecturally; may need fine-tuning per vessel as more combinations are tested
- **Mule**: Opaque mask layer implemented; steel straw auto-applied
- **Coupe vs Nick & Nora**: Coupe is now properly wider/flatter; N&N is a deeper globe shape

### PWA (cocktail.html)
- Icons needed: `cocktail-icon-192.png` and `cocktail-icon-512.png` for PWA manifest
- All 95 recipes need `presentation` objects populated (use compositor to generate)
- Future: filter by spirits on hand (bar_inventory cross-reference)
- Future: QR-based sharing pointing to hosted recipe JSON
- Future: Instagram-optimized card image export

### Seed
- `cocktails_seed_partial.json` has batches 1+2 (56 recipes)
- Batch 3 extracted as JSON in conversation — needs to be merged into master seed
- Master seed file should be committed as `cocktails_seed.json` in repo root alongside `cocktail.html`

---

## Infrastructure Constraints
- No third-party tokenized dependencies
- No freemium/tiered services
- No serverless workers
- GitHub Pages only (trillnjoy.github.io)
- Shared with wife across multiple iOS devices (cookbook PWA pattern)

---

## Lessons Learned — Session Notes

### On SVG vs PNG (expanded)
The compositor session confirmed the PNG recommendation emphatically. The core problem: SVG requires encoding real-world shapes as geometric primitives, which demands accurate mental models of those shapes *before* writing coordinates. When the mental model is wrong (citrus wedge as triangle rather than half-disc; pith curving toward center rather than away), every iteration compounds the error. A Photoshop asset requires one correct observation; an SVG requires correct observation *plus* correct geometric translation *plus* correct coordinate arithmetic. Three independent failure modes instead of one.

The PNG approach: draw once in Photoshop at ~90×90px with transparent background, commit to `/assets/garnishes/` and `/assets/vessels/` in the repo, composite dynamically on a `<canvas>` element using `drawImage()` with x/y/rotation parameters driven by the same GEO lookup table. All the placement physics logic is retained; only the asset rendering changes. This is architecturally cleaner and visually far superior.

### On real-world physics as prerequisite
Several garnish rendering errors stemmed from incorrect physical assumptions that should have been checked against reference images first:
- **Citrus wedge shape**: half-disc (D-shape), NOT a triangle. Flat face = cut surface. Arc = rind.
- **Rind/pith orientation**: both curve AWAY from the fruit centre (convex outward). They are concentric arcs on the outside of the fruit, not inside.
- **Slit placement**: from the centre of the flat cut face INWARD through rind+pith only (~30% of radius). NOT from apex upward. The slit is what allows the wedge to straddle the rim; the intact rind arc below the slit prevents it from falling through.
- **Wedge on rim**: flat face is perpendicular to vessel wall. Rind arc hangs on the outside of the glass. Half the wedge is inside, half outside.
- **Pineapple vs lemon relative size**: a pineapple wedge cut from a pineapple is substantially larger (roughly 2-3x the radius) than a lemon wedge. Real-world size hierarchy matters.
- **Cucumber**: dense, sinks. Do not float at meniscus.
- **Celery**: stalk base rests on vessel bottom. Leaves extend above rim. Each leaf is a separate Bézier path, not a single arch (which produces a mushroom-cap artefact).
- **Whipped cream**: mounds *above* the meniscus, does not sit flush with it. Floats above any float layer.
- **Cherry (Luxardo)**: single dark cherry, sinks toward bottom. Not paired Bings on rim.

### On session burn rate
This session had an unusually high token burn rate due to:
1. Rapid SVG iteration cycles — each requiring full file read + write (~950 lines)
2. Repeated geometry corrections from incorrect initial physical models
3. Extended diagnostic discussion when iOS rendering environment overrode CSS

Future sessions: establish physical reference images *before* writing SVG coordinates. One correct observation beats ten corrective iterations.

### On iOS Claude app artifact rendering
The Claude iOS app applies a light-mode CSS override to artifact webviews. Mitigations applied:
- `<meta name="color-scheme" content="dark">`
- `!important` on all color, background, and border declarations
- Inline `style` on `<body>` + JS imperative override at runtime
- Wrapper div with explicit dark background
- All SVG icon colors changed from `currentColor` to explicit hex `#c8a870`


---

## Session 2 Lessons Learned — Compositor Physics & Geometry

### Citrus wedge — the long road to correct geometry

The citrus wedge consumed more iteration than any other element. Root cause: reasoning from abstract geometry rather than reference images.

**Correct wedge anatomy** (from reference images, established late):
- Shape is a **half-disc (D-shape)**, NOT a triangle
- Flat edge = the cut face (segments visible here)
- Curved arc = the rind, curving **away** from fruit center (convex outward)
- Pith = white arc concentric with rind, also convex outward
- Segments radiate as spokes from center of flat face toward rind
- Center division = white/light gap, not a dark line
- Slit = cut from center of flat face INTO the fruit through rind+pith only (~30% of radius)

**Correct placement physics**:
- Slit straddles the rim. The pith/pulp boundary (end of slit) is the contact point with the rim.
- Rind arc hangs outside and below the glass
- Upper pulp half sits inside the glass
- Wedge tilts to match vessel wall angle

**Correct SVG canonical construction**:
- Draw at origin: flat face horizontal at y=0, arc sweeps DOWNWARD using `sweep=0`
  - `M(-r),0 A r,r 0 0,0 r,0 Z` — sweep=0 goes through positive y (downward)
  - sweep=1 goes UPWARD — this was wrong for many iterations
- Spokes: from (0,0) using `x = innerR*sin(a), y = innerR*cos(a)` — fans downward
- Slit: from (0,0) to (0, +slitD) — downward into disc
- Rind band: outer arc sweep=0, inner closing arc sweep=1
- Transform: `translate(ax, ay) rotate(180)` — 180° flips the disc so arc points down in world space
- Anchor: `ax = 90 + g.ohw + narrowOffset`, `ay = visualRimTop + slitD`
  - slitD offset ensures pith/pulp boundary (not flat face center) lands on rim
  - narrowOffset pushes anchor outward for narrow vessels (ohw < 30) to prevent collision
  - rimTopOverrides{} for vessels where visual rim differs from g.top (e.g. mule curled rim)

**Pineapple wedge**: identical physics, r ≈ 2× citrus (pineapple >> lemon in real life). Concentric arc striations instead of radial spokes better represent pineapple flesh anatomy. Slit through rind only (shallower than citrus).

### Opaque vessel architecture

Render layer order:
1. `vessel-layer` — glass/copper body
2. `liquid-layer` — drink fill
3. `float-layer` — dark rum / wine float (16px thick, above meniscus)
4. `ice-layer` — ice fills from meniscus down
5. `vessel-mask-layer` — full opaque body redraw (mule: entire copper body redrawn solid)
6. `garnish-layer` — garnishes + citrus wedges
7. `extras-layer` — umbrella, rim, straw, whipped cream, mint
8. `vessel-rim-cover-layer` — narrow rim band redrawn after garnish (hides wedge interior for opaque vessels without clipping the exterior)

The rim cover layer (8) was necessary because the garnish layer (6) renders after the mask (5), so the mask alone cannot hide garnish interiors. A post-garnish narrow strip covers only the rim band, leaving exterior garnish visible.

### Float and whipped cream layering

- Float sits at meniscus, 16px thick, `rgba(60,15,0,0.85)` for dark rum
- Whipped cream base anchors to `fillY - floatH` when float is active — sits on top of float, not at drink surface
- Without float, cream sits at `fillY` as normal

### iOS host override hardening

The Claude iOS artifact viewer applies light-mode CSS overrides. Full mitigation list:
- `<meta name="color-scheme" content="dark">`
- `!important` on all color/background/border declarations
- Inline style on `<body>` + JS imperative `setProperty` at runtime
- App-shell wrapper div with explicit dark background
- All SVG icon `currentColor` replaced with explicit hex `#c8a870`
- `#preview-wrap` explicit dark background

### On iteration cost

Each fix cycle = full 950-line file read + write + present. ~40 cycles this session.
Mitigation for next session: establish physical reference images BEFORE writing SVG coordinates.
Geometry errors caught late are 10× more expensive than geometry errors caught before first render.

### PNG recommendation (unchanged)

SVG garnish assets remain the highest-friction element of this project. Photoshop PNGs at 90×90px transparent would have resolved all garnish issues in one afternoon. The placement physics (GEO table, wallAngles, anchor math) are worth keeping — apply them to canvas `drawImage()` calls with pre-made PNG assets. The geometry is finally correct; the rendering medium is still wrong for organic shapes.


# Proof In Practice — Project Handoff

## Overview
A personal cocktail recipe PWA migrated from the abandoned Highball/Studio Neat iOS app. Self-hosted on GitHub Pages. Shared with a small group of friends. Troy is the curator — he controls the canonical seed. Friends get a read-only-ish experience with local hide preferences.

## Repository
- **Repo:** `github.com/trillnjoy/Proof_In_Practice`
- **Pages URL:** `https://trillnjoy.github.io/Proof_In_Practice/`
- **Main file:** `cocktail.html`
- **Seed file:** `cocktails_seed.json`
- **Bottle images:** `/Images/` subfolder, named `BottleName_216.png`, 216px tall transparent PNGs

## Current Build
- **Timestamp:** `2026-04-25 20:11 UTC` (visible in footer — always update on each build)
- **Recipes:** 97 (as of handoff)
- **Inventory:** 81 bottles across 12 spirit categories
- **File size:** ~153KB

---

## Architecture

### Storage: IndexedDB-first
- **Database:** `PiP_Cellar`, version 2
- **Stores:** `recipes` (keyPath: `name`), `bar_inventory` (keyPath: `category`), `hidden_bottles` (keyPath: `key`)
- **Load sequence:** IDB populated → load from IDB. IDB empty → fetch `cocktails_seed.json` from GitHub Pages → seed IDB. Fetch fails → use inline fallback seed → seed IDB if available
- **All edits** (recipe save, ingredient save, method save, bottle add/edit/delete) write to IDB instantly — no network required
- **GitHub is backup/sync only** — Export and Import in settings

### GitHub Sync (Settings Drawer ⚙)
- PAT with `repo` scope stored in `localStorage` under key `cellar_gh_settings`
- **Export to GitHub:** Reads full IDB, serializes to seed schema JSON, GET+PUT to GitHub Contents API. One SHA fetch, one PUT, no conflicts
- **Import from GitHub:** Fetches from public GitHub Pages URL (no PAT required) — available to all users including friends. Clears and reseeds IDB
- **Export button dithered** (35% opacity, disabled) when no PAT configured
- Settings auto-close after successful export/import

### Owner vs Friend Detection
- `isOwner()` returns true if PAT is configured in localStorage
- **Owner (you):** × button on bottles does true delete from IDB
- **Non-owner (friends):** × button hides the bottle locally in `hidden_bottles` store with confirm dialog. Never touches the canonical seed
- Friends can Import to refresh from your latest export. They cannot Export

### Encoding (GitHub Contents API)
- **Decode:** `decodeURIComponent(escape(atob(content.replace(/\n/g,''))))`
- **Encode:** `btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))))`
- Both are required for correct UTF-8 handling of accented characters

---

## Seed Schema

### Recipe record
```json
{
  "name": "Cocktail Name",
  "credit": "Troy McGuire | null",
  "ingredients": [
    {"amount": "2", "unit": "oz", "item": "Bourbon"},
    {"amount": "1", "unit": "dash", "item": "Angostura Bitters"}
  ],
  "method": "Full method text.",
  "glass": "rocks",
  "frozen": false,
  "presentation": {
    "vessel": "rocks",
    "color": "#8B3A2A",
    "float": null,
    "ice": "huge | cubes | crushed | null",
    "citrus": "lemon-twist | lemon-wedge | lime-wedge | orange-wedge | etc | null",
    "garnish": ["cherry", "strawberry", "olive", "celery", "pineapple-wedge", "cucumber-slice"],
    "extras": ["umbrella", "salted-rim", "tajin-rim", "straw", "whipped-cream", "mint-sprig"]
  }
}
```

**Important:** `glass` uses seed canonical values (`martini`, `mule mug`). The DR engine normalizes internally. Do not change seed values to DR internal names (`cocktail`, `mule`).

**Units in use:** `oz, dash, tsp, tbsp, pinch, drop, null`

**Glass types:** `rocks, martini, coupe, highball, collins, mule mug, mug, flute, wine, snifter, tropical, nick-nora`

### Bar inventory record
```json
{
  "category": "Bourbon & Rye",
  "bottles": [
    {
      "name": "Larceny",
      "notes": null,
      "rating": 2,
      "imageUrl": "https://trillnjoy.github.io/Proof_In_Practice/Images/Larceny_216.png",
      "abv": 46
    }
  ]
}
```

**ABV** stored as a number (e.g. `46` not `0.46`). The calculation engine divides by 100 internally.

---

## Key Functions Reference

### IDB Helpers
```js
idbOpen()              // Opens/creates PiP_Cellar DB
idbGetAll(store)       // Returns all records from a store
idbPut(store, record)  // Upsert a record
idbDelete(store, key)  // Delete by key
idbClear(store)        // Clear entire store
idbCount(store)        // Count records
idbSeedFromJSON(data)  // Clear both main stores and reseed from JSON
idbHideBottle(cat, name)   // Add to hidden_bottles
idbUnhideBottle(cat, name) // Remove from hidden_bottles
idbGetHidden()         // Returns Set of hidden keys ("Cat::Name")
```

### ABV Calculation Engine
```js
calculateRecipeABV(recipe)
// Returns { abv: float, usedDefault: bool } or null
// ~ prefix: dilution estimated from method, all ABVs from inventory
// ≈ prefix: one or more ingredients used category default ABV

calcNinjaWater(recipe, targetPct)
// Returns { nonAlcVol, currentABV, totalVol, targetVol } or null
// nonAlcVol: oz of non-alcoholic liquid to add to hit targetPct
```

### Unit → oz conversion (UNIT_TO_OZ)
```js
oz: 1, tbsp: 0.5, tsp: 0.1667, dash: 0.021, drop: 0.0017, pinch: 0, null: 0
```

### Spirit category fallback ABVs (SPIRIT_DEFAULTS)
Used when ingredient name doesn't match a known bottle:
- bourbon/rye/whiskey → 45%
- scotch/irish/vodka/rum/tequila/mezcal/cognac/brandy → 40%
- gin → 42%
- liqueur/vermouth/amaro/aperol/campari etc → 20%
- champagne/wine/beer → 12%
- syrup/juice/water/bitters/grenadine etc → 0%

### Dilution Factors (getDilutionFactor)
Applied to calculate post-dilution ABV for the detail header pill:
- `frozen: true` → 0% (Ninja mode — water is explicit)
- `crushed` ice → 15%
- `cubes` ice + shaken → 40%
- `cubes` ice → 10%
- `huge` ice → 5%
- Shaken (no ice in glass) → 30%
- Stirred (no ice in glass) → 20%
- Default → 0%

### DR Render Engine
Embedded IIFE — `DR.thumb(presentation)` 54×72px, `DR.hero(presentation)` 160×205px, `DR.render(presentation, w, h)` arbitrary.

Vessel normalization (seed → DR internal):
- `martini → cocktail`, `mule mug → mule`, `mug → irish`, `wine → snifter`

---

## UI Features

### Recipe List
- Single-column rows with DR thumbnail (dark cell background), name, glass type
- Spirit filter tabs derived from ingredient scanning (word-boundary match)
- Search: substring for 3+ chars, word-start for <3 chars
- "+ New Recipe" button (hidden on detail/inventory views)

### Recipe Detail
- DR hero visualization, Edit Visual button (upper left), ABV pill (upper right)
- `~X.X% ABV` = dilution estimated, inventory-matched. `≈X.X% ABV` = category default used
- Edit buttons inline next to Ingredients and Method section headers
- Glass/serve tag with complete vessel map
- Ninja Slushie panel (always visible, off by default) — toggle + slider (6/8/10/12/14%) + real-time water calculation

### Ingredient Editor (bottom sheet)
- Amount field + unit dropdown (oz/tsp/tbsp/dash/drop/pinch/—) + item text field
- Predictive autocomplete: builds lexicon from bar_inventory names + all recipe ingredient items. Word-start match for <3 chars, substring for ≥3 chars. Up to 8 suggestions above keyboard
- Free text always allowed — lexicon is non-blocking
- Done saves to IDB and re-renders detail

### Method Editor (bottom sheet)
- Simple textarea, pre-filled with current method
- Done saves to IDB and re-renders detail

### Top Shelf (Bar Inventory)
- Shelf aesthetic: white surface, walnut shelf edge, name below shelf
- Columns: 4 (portrait phone) / 6 (600px+) / 8 (900px+)
- Bottle image cells with ABV % (upper left) and Cost $–$$$$ (upper right)
- Tap image → bottle modal (tasting notes, ABV, cost, image URL)
- × / 👁 button on name cell — × deletes (owner only), 👁 hides locally (non-owner)
- + cell at end of each category group

### Settings Drawer (⚙ — always visible in header nav)
- PAT, owner, repo, seed path, branch
- Export to GitHub (dithered without PAT)
- Import from GitHub (public URL — no PAT needed, available to all)

---

## Deployment & Caching

### Cache Busting
Add any query string to force fresh load: `cocktail.html?r=2`
- GitHub Pages CDN can take 10–30+ minutes to propagate after commit
- The build timestamp in the footer is the definitive version indicator
- `no-cache` meta tags are currently in the HTML for debug — **remove before sharing with friends**

### No-Cache Meta Tags (REMOVE FOR PRODUCTION)
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

### PWA
- Manifest: `cocktail_manifest.json` — name "Proof In Practice: A Cocktail Compendium"
- Icons: `PiP_192.png` and `PiP_512.png` in repo root
- Apple meta tags in `<head>` for iOS home screen install
- Service worker: `cocktail_sw.js` — basic shell, not actively developed
- `user-scalable=no` in viewport meta prevents pinch-to-zoom

---

## Known Issues / Next Session

### High Priority
1. **Ingredient editor — no credit/glass field editing** — new recipes created via "+ New Recipe" default to rocks glass and null credit. No in-app path to change glass type outside the Edit Visual panel. Needs either adding glass selector to the visual editor's title row, or a dedicated recipe metadata editor.
2. **Encoding guard** — future seed edits via GitHub web UI or other tools risk re-introducing UTF-8 corruption (Crème → CrÃ¨me pattern). The import path decodes correctly but if someone edits the JSON directly, accented chars can corrupt on re-encode.

### Medium Priority
3. **Recipe sharing via URL fragment** — encode a single recipe into a URL, recipient taps it, app offers "Add to my collection." Not built. Deferred from early roadmap.
4. **Apple Shortcut → clipboard import** — recipe entry from external sources (News app recipe cards, etc.). Designed but not built. Prompt for Shortcut: photograph recipe, remove background, send to Claude Vision API with schema, copy JSON to clipboard. In-app: "Import from Clipboard" button parses and pre-fills new recipe.
5. **Manage Hidden view** — friends who hide bottles have no way to unhide. Only recovery is Import from GitHub (restores everything). A "Show Hidden" toggle or management view would help.
6. **No-cache headers** — remove before sharing with friends (see above).

### Low Priority
7. **Service worker** — current SW is a skeleton. Worth revisiting for offline reliability once app is stable.
8. **Bottle image floating** — resolved (was PNG padding artifact). If it recurs, check bottom padding in source images before crops.
9. **Build timestamp** — must be manually updated on each build session. Should be automated.

---

## Workflow Notes

### Adding Bottle Images
1. Photograph bottle, remove background in Photos/Photoshop, export as transparent PNG at 216px height
2. Name: `BottleName_216.png` (no spaces)
3. Upload to `/Images/` folder in repo
4. Update `cocktails_seed.json` imageUrl: `https://trillnjoy.github.io/Proof_In_Practice/Images/BottleName_216.png`
5. Commit seed. Import from GitHub in app to pull changes.

### Adding Recipes in Bulk
Upload current `cocktails_seed.json` to Claude, describe new recipes, Claude patches the JSON and returns updated file. Commit. Import from GitHub in app.

### Fixing Text Corruption
Pattern: `CrÃ¨me` instead of `Crème`. Cause: UTF-8 bytes interpreted as Latin-1 in a prior encode/decode cycle. Fix: regex replacement targeting the corruption pattern, then re-encode correctly. The current import path (`decodeURIComponent(escape(atob(...)))`) handles UTF-8 correctly going forward.

### Session Starting Prompt
```
Continuing development of Proof In Practice — a personal cocktail PWA.
Repository: github.com/trillnjoy/Proof_In_Practice
Pages URL: https://trillnjoy.github.io/Proof_In_Practice/
Read PROOF_IN_PRACTICE.md first — full spec, architecture, and session history.
Then read the attached cocktail.html.
[Attach current cocktail.html and PROOF_IN_PRACTICE.md]
```

---

## Lessons Learned

### On GitHub Contents API
Works well for single deliberate writes (Export). Fails reliably for rapid sequential writes due to SHA conflicts (409). Do not use for per-edit write-back. IndexedDB-first with explicit Export is the correct architecture for a PWA with no backend.

### On GitHub Pages CDN
Propagation after commit: 10–30+ minutes, not seconds. The green Actions circle only means GitHub processed the commit — CDN propagation is a separate step with no indicator. Use query string cache busts during development. Build timestamp in footer is the only reliable version indicator.

### On SVG Bottle Rendering (DR Engine)
The DR engine renders cocktail visualizations as inline SVG. Key architecture notes:
- Vessel normalization: seed canonical names → DR internal GEO keys
- Martini liquid path must be a clean triangle (left→right→apex→close). Self-intersecting paths render as zero fill area
- Highlight layer must render above liquid layer or it gets buried
- `overflow:visible` on SVG can cause z-index issues with absolutely-positioned buttons

### On iOS Safari Caching
Hard reload insufficient for GitHub Pages CDN cache. Query string cache bust is reliable. `no-cache` meta tags are ignored by GitHub's CDN layer. PWA install caches aggressively — always test in Safari browser before installing as PWA.

### On Encoding
Always use the symmetric pair:
- Decode: `decodeURIComponent(escape(atob(str.replace(/\n/g,''))))`  
- Encode: `btoa(unescape(encodeURIComponent(JSON.stringify(data))))`
Bare `atob()` treats output as Latin-1 and corrupts accented characters.

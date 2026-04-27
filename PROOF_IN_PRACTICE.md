# Proof In Practice — Project Handoff

## Overview
A personal cocktail recipe PWA migrated from the abandoned Highball/Studio Neat iOS app. Self-hosted on GitHub Pages. Shared with a small group of friends. Troy is the curator — he controls the canonical seed. Friends get a read-only-ish experience with local hide preferences.

## Repository
- **Repo:** `github.com/trillnjoy/Proof_In_Practice`
- **Pages URL:** `https://trillnjoy.github.io/Proof_In_Practice/`
- **Main file:** `cocktail.html`
- **Seed file:** `cocktails_seed.json`
- **Service worker:** `cocktail_sw.js`
- **Bottle images:** `/Images/` subfolder, named `BottleName_216.png`, 216px tall transparent PNGs

## Current Build
- **Timestamp:** `2026-04-27 09:00 UTC` (visible in footer — always update on each build)
- **Recipes:** 106 (as of handoff)
- **Inventory:** 81 bottles across 12 spirit categories
- **File size:** ~175KB

---

## Architecture

### Storage: IndexedDB-first
- **Database:** `PiP_Cellar`, version 2
- **Stores:** `recipes` (keyPath: `name`), `bar_inventory` (keyPath: `category`), `hidden_bottles` (keyPath: `key`)
- **Load sequence:** IDB populated → load from IDB. IDB empty → fetch `cocktails_seed.json` from GitHub Pages → seed IDB. Fetch fails → use inline fallback seed → seed IDB if available
- **All edits** (recipe save, ingredient save, method save, bottle add/edit/delete) write to IDB instantly — no network required
- **GitHub is backup/sync only** — Export and Import in settings

### GitHub Sync (Settings Drawer ⚙)
- PAT with `repo` scope stored in `localStorage` under key `cellar_gh_settings` (same object as Anthropic key)
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
  "credit": "Troy | null",
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

**Credit convention:** House recipes use `"Troy"` (first name only) — this is what the My Recipes filter and the ✦ House recipe display both key off of.

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

### Ninja Machine Specs (NINJA_MACHINES)
```js
{ id: 'slushi',    label: 'Slushi',    ozMin: 16, ozMax: 64,  abvCeil: 16 }
{ id: 'slushixl',  label: 'SlushiXL',  ozMin: 24, ozMax: 96,  abvCeil: 20 }
{ id: 'slushimax', label: 'SlushiMax', ozMin: 24, ozMax: 112, abvCeil: 20 }
```
- ABV slider runs 6–ceiling in step=2 (even integers), **default 12%**. Slider max updates live when machine changes.
- Scale section scales to `ozMax` (full machine fill).
- Share card always uses 12% ABV target (standardized) scaled to `ozMax` of selected machine.
- Selected machine stored in `ninjaSelectedMachine` (module-level state, resets to Slushi on app load).
- `calcNinjaMachine(recipe, machine, targetPct)` — returns scaled ingredients + water for `machine.ozMax` capacity.
- `scaleIngredients(ingredients, multiplier)` — scales amounts (handles fractions like `1/3`).

### Seed schema — `presentation.slushie`
`presentation.slushie = false` hides the Ninja panel on the detail view for that recipe.
Set via the "Hide Ninja panel for this recipe" checkbox in Visual Editor.
Omit the key (or set to any truthy value) to show the panel normally.

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
- `+ New Recipe` and `⊕ Import` buttons (hidden on detail/inventory views)

### Recipe Detail
- DR hero visualization
- Button row (top left): **Edit Visual** | **⬆︎ Share** — in document flow, no overlay issues
- ABV pill top right: `~X.X% ABV` = inventory-matched with estimated dilution. `≈X.X% ABV` = category default used
- Edit buttons inline next to Ingredients and Method section headers
- Glass/serve tag with complete vessel map
- Ninja Slushie panel (always visible, off by default) — toggle + slider (6/8/10/12/14%) + real-time water calculation

### Visual Editor
- Opens as full overlay on Edit Visual tap
- **Glass selector** — vessel buttons correctly initialized from seed canonical glass names via `glassToVessel` map (`mule mug→mule`, `mug→irish`, `wine→snifter`). Saves back to `recipe.glass` via `vesselToGlass` reverse map
- **Title and Credit fields** side by side — both save to IDB and the seed on Export
- Color picker, ice, citrus, garnish, extras all persist correctly

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
- **Show Hidden toggle** (non-owner only) — appears in inventory header. Reveals hidden bottles at 32% opacity + grayscale with individual `show` unhide button. Toggling off hides them again; unhiding a bottle makes it permanently visible
- + cell at end of each category group

### Settings Drawer (⚙ — always visible in header nav)
- **Claude AI section** (top): Anthropic API key — stored in `localStorage` under `cellar_gh_settings.anthropicKey`. Required for Import recipe extraction. Password field, browser-only storage.
- **GitHub Sync section**: PAT, owner, repo, seed path, branch
- Export to GitHub (dithered without PAT)
- Import from GitHub (public URL — no PAT needed, available to all)

### Share Recipe
- **⬆︎ Share button** on every recipe detail view
- Generates a 720px retina-quality PNG card: DR glass visual, PiP wordmark, ABV pill, QR code, ingredient list, method, Ninja Slushie guidance at 12% ABV target
- Calls `navigator.share()` with both the PNG file and the deep link URL as text
- iOS Messages receives: image attachment + tappable deep link URL in the same bubble
- QR in the image encodes the deep link — useful for print/non-iMessage contexts
- Deep link format: `cocktail.html#Recipe+Name` — app detects fragment on load and routes directly to that recipe's detail view

### Import Recipe Sheet
- **⊕ Import button** in recipe list header
- Bottom sheet with three input tabs:
  - **Text / Paste** — paste recipe text, typed riff, or copied content from behind a paywall
  - **URL** — fetches page text client-side; fails gracefully on paywalled URLs with nudge to paste instead
  - **Photo / File** — camera, Photos library, or file picker; sends image to Claude Vision as base64
- **Riff Notes field** — freeform editorial instructions applied on top of source material (substitute X for Y, rename, credit override etc). Claude sees source + notes simultaneously
- Calls Claude API (`claude-sonnet-4-20250514`) with structured schema prompt
- Output pre-fills the Visual Editor for review before IDB write — never writes directly without user confirmation
- Requires Anthropic API key in Settings

#### Import extraction prompt rules (important for quality)
- **Amounts:** Preserve exact fractions — 1/3 stays 1/3, never rounded
- **Credit:** Inferred from watermarks, site names, bylines, URLs
- **Ingredient names:** Title Case throughout
- **Garnish:** Scanned from both ingredient list and method text
- JSON extraction uses regex `/{[\s\S]*}/` to find JSON even if model adds preamble

---

## Service Worker (`cocktail_sw.js`)

### Strategy
- **Shell** (`cocktail.html`, manifest): network-first with cache fallback
- **Seed JSON:** network-first (so imports always reflect latest export)
- **Google Fonts:** cache-first (stable, content-hashed by Google)
- **Bottle images** (`/Images/`): cache-first (stable PNGs)
- **GitHub API calls:** always pass-through, never cached

### Cache versioning
`CACHE_VERSION` constant at top of `cocktail_sw.js` — **bump to match footer timestamp on every build.** On activate, all `pip-*` caches from prior versions are deleted automatically.

### Update cycle
Page registers SW on load. When a new SW installs, page sends `SKIP_WAITING` message → SW calls `skipWaiting()` → `controllerchange` fires → page reloads once automatically. Users get updates on next visit with no manual action.

### Registration
`navigator.serviceWorker.register('./cocktail_sw.js')` is called after `loadData()` / `init()` in the HTML. The `window.addEventListener('load', ...)` wrapper defers registration until load.

### iOS note
SW registration fails when opening the file locally (`Job rejected for non app-bound domain`). This is expected and harmless — registers correctly once deployed to GitHub Pages HTTPS.

---

## Deployment & Caching

### Build workflow
1. Make changes to `cocktail.html`
2. Bump footer timestamp (search `UTC` in file)
3. Bump `CACHE_VERSION` in `cocktail_sw.js` to match timestamp
4. Commit both files
5. Wait for GitHub Actions green
6. Open `cocktail.html?r=N` in Safari to validate footer timestamp
7. Export from app to push any pending IDB edits to GitHub seed

### GitHub Pages CDN propagation
Real-world propagation after commit can be **significantly longer than 30 minutes** — hours in some cases. The green Actions checkmark only confirms the commit processed; CDN edge propagation has no indicator. The `?r=` query string cache busts the browser cache but cannot force CDN refresh. Plan accordingly: treat Export as a save operation and do not Import on the same device immediately after.

### Critical workflow rule
**Never Import on a device whose IDB is the canonical master.** Import overwrites IDB from the seed. If you've made in-app edits (credit changes, new recipes via editor) and haven't Exported, Import will destroy those edits. Always Export first, wait for CDN propagation, then Import on other devices.

### PWA
- Manifest: `cocktail_manifest.json` — name "Proof In Practice: A Cocktail Compendium"
- Icons: `PiP_192.png` and `PiP_512.png` in repo root
- Apple meta tags in `<head>` for iOS home screen install
- `user-scalable=no` in viewport meta prevents pinch-to-zoom
- Always validate in Safari browser before installing as PWA — PWA shell caches aggressively

---

## Known Issues / Next Session

### Resolved this session
- ✅ Glass selector in Visual Editor (vessel normalization on open)
- ✅ Credit field in Visual Editor
- ✅ Show Hidden / Unhide for non-owner inventory
- ✅ Service worker — network-first shell, version-keyed cache invalidation, registered
- ✅ No-cache meta tags removed
- ✅ Share recipe — PNG card + deep link via native share sheet
- ✅ Deep link routing via URL fragment
- ✅ Import Recipe sheet — text/URL/image tabs, Claude extraction, pre-fill editor
- ✅ Delete Recipe — owner-only Delete button in Visual Editor with confirm dialog; IDB delete + allRecipes splice + nav back to list
- ✅ Ninja machine selector — Slushi / SlushiXL / SlushiMax buttons (16/24/24 oz min, 64/96/112 oz max, 16%/20%/20% ABV ceiling) in Ninja panel; slider 6–ceiling step 2 default 12%; Scale for Slushie expand section with scaled ingredient amounts to ozMax
- ✅ Ninja slushie opt-out — `presentation.slushie = false` flag set in Visual Editor; hides Ninja panel on detail view
- ✅ Share card Ninja section — now uses selected machine (label + ozMax), scaled ingredient amounts, standardized 12% ABV target
- ✅ Import photo reset bug — `closeImportSheet()` now always resets Extract button text/disabled state; file input value cleared after FileReader load so same photo can be re-selected on iOS

### Pending

**Medium Priority**
1. **"Save to my collection" for shared recipes** — when a friend taps a deep link and lands on a recipe detail, a one-tap `idbPut` button to save it locally without going through Import. Simple follow-on to the share/deep link work.
2. **Manage Hidden improvements** — the Show Hidden toggle is now built. A future enhancement: count of hidden bottles shown somewhere, or a dedicated management view.
3. **Recipe sharing — URL fragment only path** — deep link is wired but the "Add to my collection" experience for recipients is still just Import. The one-tap save path above completes this loop.

**Low Priority**
4. **Build timestamp automation** — manual bump is fine for solo curator workflow.
5. **Bottle image floating** — resolved. If recurs, check PNG bottom padding.
6. **Encoding guard** — future seed edits via GitHub web UI risk UTF-8 corruption (`Crème → CrÃ¨me`). Import path decodes correctly going forward.

---

## Workflow Notes

### Adding Bottle Images
1. Photograph bottle, remove background in Photos/Photoshop, export as transparent PNG at 216px height
2. Name: `BottleName_216.png` (no spaces)
3. Upload to `/Images/` folder in repo
4. Update `cocktails_seed.json` imageUrl: `https://trillnjoy.github.io/Proof_In_Practice/Images/BottleName_216.png`
5. Commit seed. Import from GitHub in app to pull changes.

### Adding Recipes in Bulk (via Claude session)
Upload current `cocktails_seed.json` (downloads as `.txt` from GitHub — rename or upload as-is, Claude reads both). Describe new recipes or upload source images. Claude patches the JSON and returns updated file. Commit. Wait for CDN. Import from GitHub in app.

### Adding Recipes via In-App Import
Open app → ⊕ Import → choose tab (Text/URL/Photo) → add Riff Notes if needed → Extract Recipe → review pre-filled Visual Editor → save. Then Export to push to GitHub seed.

### Fixing Text Corruption
Pattern: `CrÃ¨me` instead of `Crème`. Cause: UTF-8 bytes interpreted as Latin-1 in a prior encode/decode cycle. Fix: regex replacement targeting the corruption pattern, then re-encode correctly. The current import path (`decodeURIComponent(escape(atob(...)))`) handles UTF-8 correctly going forward.

### Session Starting Prompt
```
Continuing development of Proof In Practice — a personal cocktail PWA.
Repository: github.com/trillnjoy/Proof_In_Practice
Pages URL: https://trillnjoy.github.io/Proof_In_Practice/
Read PROOF_IN_PRACTICE.md first — full spec, architecture, and session history.
Then read the attached cocktail.html and cocktail_sw.js.
[Attach current cocktail.html, cocktail_sw.js, and PROOF_IN_PRACTICE.md]
```

---

## Lessons Learned

### On GitHub Contents API
Works well for single deliberate writes (Export). Fails reliably for rapid sequential writes due to SHA conflicts (409). Do not use for per-edit write-back. IndexedDB-first with explicit Export is the correct architecture for a PWA with no backend.

### On GitHub Pages CDN
Propagation after commit is unpredictable — observed up to several hours, not just 10–30 minutes. The green Actions circle only means GitHub processed the commit. Use `?r=N` cache busts during development. Build timestamp in footer is the only reliable version indicator.

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

### On DOM-Ready Event Wiring
All `addEventListener` calls that target HTML elements defined after the `<script>` block must be inside functions called after `init()` — not at the top level of the script. Top-level `$()` calls on elements that don't yet exist in the DOM throw null reference errors silently on iOS Safari (reported as generic "Script error" with no line number). Use Chrome DevTools for debugging — it reports actual line numbers. Pattern: wrap in `initXxx()` function, call after `init()` in both `loadData()` paths.

### On Direct Anthropic API Calls from Browser
Requires three headers beyond `Content-Type`:
```
'x-api-key': anthropicKey,
'anthropic-version': '2023-06-01',
'anthropic-dangerous-direct-browser-access': 'true'
```
The third header is mandatory — without it the request is rejected regardless of key validity. Key is stored in `localStorage` under `cellar_gh_settings.anthropicKey`, retrieved via `ghSettings().anthropicKey`.

### On Claude JSON Extraction Prompts
- Open with: "Start your response with { and end with }" — prevents preamble
- Use regex `/{[\s\S]*}/` to extract JSON from response as a defensive fallback
- Be explicit about fractions — Claude will round 1/3 oz to 1 oz without instruction
- Credit inference requires explicit instruction to infer from watermarks, site names, URLs
- Garnish requires explicit instruction to scan method text, not just ingredient list

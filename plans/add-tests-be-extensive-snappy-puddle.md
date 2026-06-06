# Plan: Add Extensive Unit Tests

## Context

The photos package ships with only a two-case manifest smoke test. The vitest + playwright infrastructure is already wired up (configs inherit from app, stubs are registered, `tinycld-pkg test` works). This plan adds a thorough unit-test layer targeting every pure function and store in the package — following the exact patterns the `drive` package established (factory helpers, `describe`/`it`, no React hook mounting, no PocketBase mocking).

---

## Scope

**Test files to create** (all under `tests/`):

| File | Covers |
|---|---|
| `tests/manifest.test.ts` | Expand existing: routes, migrations, collections, nav, server |
| `tests/photo-to-view.test.ts` | `photoToView`, `toPhotoViews` |
| `tests/group-by-day.test.ts` | `groupByDay`, `formatDateLabel` |
| `tests/upload-store.test.ts` | All upload-store exports |
| `tests/photos-ui-store.test.ts` | All UI-store exports |
| `tests/file-url.test.ts` | `photoToSource` |
| `tests/search-filter.test.ts` | Extracted FTS filter logic |

**Source edits required** (minimal):

| File | Change |
|---|---|
| `tinycld/photos/hooks/usePhotos.ts` | Export `groupByDay` and `formatDateLabel` (currently private) |
| `tinycld/photos/hooks/useSearch.ts` | Extract and export `filterPhotosByText(photos, query)` pure fn |

---

## Test Case Detail

### `tests/manifest.test.ts` (expand existing)
- `manifest.name === 'Photos'`, `slug === 'photos'`, valid semver version, non-empty description
- `routesDir === 'screens'`, `publicRoutesDir === 'public-screens'`
- `migrationsDir === 'pb-migrations'`
- `collections` array is non-empty and includes `'photos_items'`
- `nav` entry exists with a label and icon
- `serverDir` defined and non-empty

### `tests/photo-to-view.test.ts`

**`photoToView`**
- Maps every snake_case field to camelCase counterpart
- Preserves `null` for `latitude`/`longitude`

**`toPhotoViews`**
- Returns `[]` for `null`, `undefined`, empty array
- Skips `null`/`undefined` elements inside the array
- Skips items where `trashed_at` is set (non-empty string)
- Deduplicates by `id` (second occurrence dropped)
- Does not mutate the input array
- Returns non-trashed items in input order

### `tests/group-by-day.test.ts`

**`formatDateLabel`**
- Returns `'Today'` for today's ISO date string
- Returns `'Yesterday'` for yesterday's date
- Returns a formatted long date (e.g. `'January 1, 2024'`) for older dates
- Handles `'unknown'` key gracefully (no crash)

**`groupByDay`**
- Photos with the same date land in the same segment
- Photos with different dates produce separate segments
- Segments are sorted newest-date-first (descending `localeCompare`)
- Photos without a `takenAt` value are grouped under key `'unknown'`
- Returns `[]` for empty input

### `tests/upload-store.test.ts`

State is module-level — reset with `clearAll()` in `beforeEach`.

**`enqueue`**
- Creates one entry per file with status `'pending'`
- Returns the assigned ID for each file
- IDs are unique across multiple `enqueue` calls
- Does not mutate the `files` array

**`updateStatus`**
- Changes status of the targeted entry only
- Sets optional `error` field
- Non-targeted entries are unchanged

**`removeEntry`**
- Removes the entry by ID, leaves others intact

**`clearDone`**
- Removes only entries with `status === 'done'`
- Leaves `pending`, `uploading`, `failed` entries intact

**`clearAll`**
- Leaves `entries` empty

**`subscribeToUploads`**
- Listener is called on `enqueue`
- Listener is called on `updateStatus`
- Returned unsubscribe function stops future notifications

**`getUploadState`**
- Returns current state object (not a copy — same reference between calls when unchanged)

### `tests/photos-ui-store.test.ts`

Reset all fields to defaults in `beforeEach` by calling the existing action functions (e.g. `clearSelection()`, `closePreview()`, `setActiveSection('timeline')`, etc.).

**`selectPhoto`** — sets `selectedPhotoId`; passing `null` clears it  
**`clearSelection`** — nulls `selectedPhotoId` and empties `selectedIds`  
**`openPreview` / `closePreview`** — sets/nulls `previewPhotoId`  
**`openDetailPanel` / `closeDetailPanel`** — toggles `detailPanelOpen`  
**`setActiveSection`** — updates `activeSection` (spot-check `'favorites'`, `'trash'`, `'albums'`)  
**`setAlbumDetailTarget`** — sets/nulls `albumDetailTarget`  
**`subscribeToPhotosUI`** — listener fires on any state change; unsubscribe stops it  

### `tests/file-url.test.ts`

**`photoToSource`**
- `collectionId === 'photos_items'`
- `recordId === photo.id`
- `fileName === photo.file`
- `displayName === photo.name`
- `mimeType === photo.mimeType`
- `size === photo.size`
- `thumbnailFileName === photo.thumbnail` when thumbnail is a non-empty string
- `thumbnailFileName === undefined` when `photo.thumbnail` is `''` (falsy)

### `tests/search-filter.test.ts`

After extracting `filterPhotosByText(photos: PhotoView[], query: string): PhotoView[]`:

- Matches on `name` field (case-insensitive)
- Matches on `description` field
- Matches on `location` field
- Returns `[]` for empty query string
- Returns `[]` when no photos match
- Does not mutate input array

---

## Factory Helpers

Both `photo-to-view.test.ts` and `group-by-day.test.ts` share a `photoItem()` / `photoView()` factory. Define once in `tests/helpers.ts`:

```ts
export function photoItem(id: string, overrides: Partial<PhotoItem> = {}): PhotoItem
export function photoView(id: string, overrides: Partial<PhotoView> = {}): PhotoView
```

---

## Verification

```bash
# Run all photos unit tests
pnpm --filter @tinycld/photos test

# Typecheck (catches export additions)
pnpm --filter @tinycld/photos typecheck
```

All tests should pass with no type errors. No E2E tests are in scope here.

# Photos — Multi-version Plan

## v1 — Core Photo Experience (MVP) ✅

Working photo gallery: view, upload, organize, favorite.

### Data Model (3 collections) ✅

**photos_items** — individual photos
| Field | Type | Notes |
|---|---|---|
| `name` | text | original filename |
| `file` | file | the actual image (PB file field) |
| `thumbnail` | file | server-generated thumbnail (~400px) |
| `taken_at` | date | EXIF date or upload time — timeline grouping key |
| `width` | number | image pixel width |
| `height` | number | image pixel height |
| `size` | number | file size in bytes |
| `mime_type` | text | image/jpeg, image/heic, image/png, image/webp |
| `description` | text | user-editable caption |
| `is_favorite` | bool | starred photos |
| `trashed_at` | date | soft delete (null = active) |
| `org` | relation → orgs | scoping |
| `owner` | relation → user_org | creator |

**photos_albums** — album groupings
| Field | Type |
|---|---|
| `name` | text |
| `description` | text |
| `cover_photo` | relation → photos_items (nullable) |
| `org` | relation → orgs |
| `owner` | relation → user_org |

**photos_album_items** — M:N join
| Field | Type |
|---|---|
| `album` | relation → photos_albums (cascade) |
| `photo` | relation → photos_items (cascade) |
| `sort_order` | number |

### Go Server ✅

- `OnRecordCreate("photos_items")` — extract EXIF (dimensions, date taken), generate thumbnail (Go `image` stdlib + `golang.org/x/image/draw` resize to 400px longest edge)
- `OnRecordAfterUpdate("photos_items")` — regenerate thumbnail if file changed
- `OnRecordAfterDelete("photos_items")` — cascade cleanup (delete file + thumbnail from storage)
- Register all collections with core's audit hooks

### Screens ✅

1. **`_layout.tsx`** — `FrozenSlideStack` wrapper, mounts album sub-routes
2. **`index.tsx`** — Timeline: virtualized `FlashList` grid with date-section headers (Today, Yesterday, ...). Tap to open viewer. Pull-to-refresh. FAB for upload.
3. **`[id].tsx`** — Photo viewer: full-screen pager (swipe prev/next), pinch-to-zoom (1x–5x), swipe-down dismiss, info overlay (date, dimensions, description), action bar (favorite toggle, trash)
4. **`albums/index.tsx`** — Album list: grid of album cards (cover thumbnail, name, photo count)
5. **`albums/[id].tsx`** — Album detail: same grid as timeline, scoped to album photos. Header with back button.

### Hooks ✅

- **usePhotos** — `useOrgLiveQuery` for photos_items, groups by day via `groupByDay()`, filters for favorites/trash/all, exposes timeline segments
- **usePhotoMutations** — upload (file picker → PB create), delete, trash, restore, toggle favorite, update description
- **useAlbums** — album queries + album_items join + photos query for cover photo resolution, derives cover photo + photo count
- **useAlbumMutations** — create/edit/delete album, add/remove photos, reorder

### Components ✅

- **PhotoCard** — grid cell: thumbnail image, favorite indicator, aspect-ratio-aware sizing from width/height
- **PhotoViewer** — full-screen pager with swipe gestures, pinch-to-zoom, dismiss on swipe-down (embedded in `[id].tsx`)
- **PhotoInfoSheet** — bottom sheet: date, dimensions, description (editable), actions (inline in `[id].tsx`)
- **AlbumCard** — album cover tile with photo count badge, resolved cover photo thumbnail
- **UploadButton** — FAB: triggers native file picker, shows upload progress
- **DateSectionHeader** — sticky date label in timeline

### Sidebar ✅

Sections: Timeline (home), Albums, Favorites, Trash. Selection highlights the active section.

---

## v2 — Rich Media & Organization ✅

Add video, live photos, deeper organization.

### Data Model

- New fields on `photos_items`:
  - `type`: `image | video | live_photo` ✅
  - `duration` — video length in ms ✅
  - `live_photo_pair_id` — FK to paired still/video (Apple Live Photos) ✅

- New collection `photos_tags` — hierarchical tags ✅
  - `id`, `name`, `color`, `parent_id` (self-ref), `org`, `owner`

- New collection `photos_item_tags` — M:N join ✅
  - `item`, `tag`

### Go Server

- Video thumbnail generation (ffmpeg-go first-frame extraction) ✅
- Video metadata extraction (duration, codec, resolution via ffprobe) ✅
- Live Photo pairing: detect HEIC + MOV with matching filename stem ✅

### Screens

- **Video player** — inline playback in viewer (opens in system player via Linking) ✅
- **Tag management** — create/edit/delete tags, assign colors ✅
- **Tag filter sidebar** — Tags nav item in sidebar + inline filter bar above timeline grid ✅

### Components

- **VideoThumbnail** — thumbnail with play overlay + duration badge ✅
- **TagChip** — colored pill with remove option ✅
- **TagPicker** — search + select/create tags ✅

### Hooks

- **useVideoPlayer** — playback state (play/pause/seek/mute) ✅
- **useTags** — tag CRUD queries + usePhotoTags for per-photo assignment ✅
- **useTagFilter** — active tag set with toggle/clear ✅

---

## v3 — Intelligence & Discovery ✅

Add search, AI features, discovery surfaces.

### ML Architecture

ML inference in Python/FastAPI sidecar. Go server calls via HTTP. Models auto-download from HuggingFace Hub, cached to disk with TTL eviction.

#### Deployment Model

ML server as **optional sidecar** in same `docker-compose.yml`:

```yaml
services:
  tinycld:
    image: ghcr.io/tinycld/app:latest

  tinycld-ml:
    image: ghcr.io/tinycld/ml:latest  # Python/FastAPI + ONNX Runtime
    environment:
      MACHINE_LEARNING_CACHE_FOLDER: /tmp/ml_models
      MACHINE_LEARNING_MODEL_TTL: 300
    volumes:
      - ml-cache:/tmp/ml_models
    # Optional GPU passthrough:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           capabilities: [gpu]
```

- ML server **optional** — photos package works without it (no faces, no smart search, no OCR)
- Go server detects ML availability via health check ping
- All ML features degrade when ML server absent

#### ML Server (Python microservice)

- **FastAPI** app with `/predict` endpoint accepting multipart form data (image + pipeline spec)
- **ONNX Runtime** inference engine — supports CPU, CUDA, ROCm, OpenVINO, CoreML, ARMNN, RKNN
- **Model cache**: in-memory LRU with TTL eviction (default 300s). Unload after inactivity, auto-reload on next request
- **Thread pool**: configurable worker threads (default = CPU count)
- **Batch axis injection**: adds batch dimension to ONNX models for batched inference
- **Model formats**: ONNX (universal), ARMNN (Raspberry Pi), RKNN (Rockchip NPU), OpenVINO (Intel)
- **Model downloads**: HuggingFace Hub snapshots, stored under `cache_folder/<task>/<model_name>/`

#### Pipeline Architecture

Inference request specifies **pipeline** — model tasks in dependency order:

```json
{
  "facial-recognition": {
    "detection": { "modelName": "buffalo_l", "options": { "minScore": 0.7 } },
    "recognition": { "modelName": "buffalo_l" }
  }
}
```

- **Without-deps tasks** run in parallel (face detection, CLIP visual encoding, OCR detection)
- **With-deps tasks** run after (face recognition needs detection output, OCR recognition needs detection output)
- Pipeline resolves dependency graph, runs independent tasks concurrently via `asyncio.gather`

#### Model Zoo

| Task | Model | Provider | Embedding Dim | Notes |
|---|---|---|---|---|
| Face Detection | RetinaFace (buffalo_s/m/l, antelopev2) | InsightFace | — | 640×640 input, returns boxes + landmarks + scores |
| Face Recognition | ArcFace (buffalo_s/m/l, antelopev2) | InsightFace | 512 | 112×112 cropped faces, cosine similarity |
| CLIP Visual | ViT-B-32, ViT-B-16, ViT-L-14, RN50, SigLIP variants | OpenCLIP | 512–1024 | Multiple model sizes, SigLIP2 best quality |
| CLIP Textual | Same as visual (paired model) | OpenCLIP/MCLIP | 512–1024 | Multilingual via MCLIP (XLM-Roberta backbone) |
| OCR Detection | DBNet (PP-OCRv5 mobile/server) | PaddleOCR | — | Max 736px resize, returns polygon boxes |
| OCR Recognition | SVTR (PP-OCRv5 mobile/server) | PaddleOCR | — | 20+ languages, returns text + confidence scores |

> **⚠️ Licensing notice**: InsightFace's code is MIT-licensed, but the pre-trained models (buffalo_l, antelopev2, etc.) are for **non-commercial research only**. For personal self-hosted use this is fine. If TinyCld becomes a commercial product, you need separate model licensing from InsightFace. The CLIP and OCR models (OpenCLIP, PaddleOCR) do not have this restriction.

**Model selection**:
- **Default**: `buffalo_l` (w600k_r50 backbone) — best accuracy/speed tradeoff for server-side recognition. ~450 FPS on RTX-3090.
- **Low-power fallback**: `buffalo_s` for CPU-only hardware (N100, Raspberry Pi) — ~1400 FPS on RTX-3090, significant speed-up on CPU with acceptable accuracy loss.
- **antelopev2**: marginally better accuracy but slower (~350 FPS). Not worth it for photo library use.
- **Future detection optimization**: SCRFD is faster than RetinaFace at equivalent accuracy on CPU. buffalo_l bundles RetinaFace, so swapping requires manual model surgery. Consider for v3.x if CPU performance becomes a bottleneck.

**Recognition loss landscape**:

| Loss | Model | Key property |
|---|---|---|
| ArcFace | buffalo_l (InsightFace) | Additive angular margin. Current standard. |
| AdaFace | AdaFace (CVPR 2022) | Quality-adaptive margin — adjusts penalty based on image quality |
| ElasticFace | ElasticFace | Random margin sampling — more flexible class separation |
| Triplet loss | FaceNet (Google, 2015) | Older, 128-dim embedding, superseded by ArcFace |

AdaFace maintains best average accuracy across corruption levels, stronger on low-quality/blurry images. No production ONNX weights — export from PyTorch yourself. Most ArcFace/AdaFace checkpoints from 2021+ trained on Glint360K (research license).

**Alternative stacks**:

| Option | Accuracy | ONNX ready | License (models) | Complexity |
|---|---|---|---|---|
| InsightFace buffalo_l (ArcFace) | Best of open models | Yes, bundled | Non-commercial without license | Low |
| AdaFace | Better on low-quality images | Manual export from PyTorch | Research license on weights | Medium |
| FaceNet | Good, not state of art | Community ONNX exports exist | MIT | Low |
| CompreFace | Same as InsightFace underneath | N/A (REST) | Apache 2.0 (wrapper) | High (Java + PostgreSQL + 4 containers) |
| face_recognition/dlib | Lowest of serious options | No | MIT | Low |

**Recommendation**: stick with InsightFace buffalo_l for v3. Consider exporting AdaFace weights for v4 — quality-adaptive margin helps with old, blurry, poorly lit photos.

#### VLM Caption Generation (v3.1 — deferred)

CLIP → semantic search embeddings only. VLM → natural language captions stored as text, indexed via FTS.

**Pipeline**: photo uploaded → VLM (Qwen 2.5VL, Gemma 3, or Mistral Small via Ollama) generates caption → caption stored in `photos_items.description` → FTS index updated → searchable via keyword match.

ML server acts as proxy: receives image → forwards to Ollama → returns caption. VLMs are large (7B+ params), run externally via Ollama, not in ML sidecar.

**Deferral**: VLM inference on CPU is slow (~30s per image on N100). GPU required for reasonable throughput. Defer to v3.1 after core ML pipeline is stable.

#### Data Model (PocketBase Collections)

- New fields on `photos_items`:
  - `search_text` — concatenated OCR + description for FTS (populated by OCR pipeline)
  - `location` — geocoded place name (city, state, country)
  - `latitude` — number, GPS latitude from EXIF
  - `longitude` — number, GPS longitude from EXIF
  - `smart_search_vector` — blob, CLIP embedding stored as raw binary float32 array (512–1024 × 4 bytes)
  - `qdrant_point_id` — text, UUID of the Qdrant point if using Tier 2 Qdrant sidecar (null for brute-force mode)
  - `perceptual_hash` — text, pHash hex string for duplicate detection
  - `ml_status` — select: `pending` | `processing` | `done` | `failed` — tracks ML pipeline state per photo

- New collection `photos_people` — recognized individuals
  - `name` (text), `thumbnail_face` (relation → photos_faces, nullable), `is_hidden` (bool), `birth_date` (date, nullable), `color` (text, nullable), `org` (relation → orgs), `owner` (relation → user_org)

- New collection `photos_faces` — detected face regions
  - `photo` (relation → photos_items, cascade), `person` (relation → photos_people, nullable, set null on delete), `bounding_box` (json: `{x1, y1, x2, y2}`), `embedding` (blob, 512-dim binary float32 array = 2048 bytes), `image_width` (number), `image_height` (number), `source_type` (select: `ml` | `manual`), `is_visible` (bool, default true)

- New collection `photos_memories` — auto-generated highlights
  - `type` (select: `on_this_day`, `best_of_month`, `trip`, ...), `title` (text), `data` (json), `owner` (relation → user_org)

- New collection `photos_memory_items` — M:N join
  - `memory` (relation → photos_memories, cascade), `photo` (relation → photos_items, cascade)

#### Vector Search Strategy

PocketBase uses SQLite, not PostgreSQL. No native vector index. Three tiers, chosen at deploy time:

**Tier 1: Brute-force in Go (v3 default)**

Store embeddings as raw `BLOB` (binary float32 array) in SQLite. On query: load all embeddings for the org, compute cosine similarity in Go with `gonum` or manual SIMD.

| Scale | RAM | Query latency | Notes |
|---|---|---|---|
| 10K photos | <20MB | <10ms | Personal use, instant |
| 100K photos | ~200MB | 100–500ms | Small org, sub-second on decent CPU |
| 500K+ photos | ~1GB | 1–3s | Degrades, time for Tier 2 |

- Zero additional infrastructure, no CGO, no sidecar
- **Do this for v3.**

**Tier 2: Qdrant sidecar (optional, >100K photos)**

```yaml
services:
  tinycld-qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant-storage:/qdrant/storage
    ports:
      - "6333:6333"
```

Qdrant is ~256MB RAM idle, clean REST API, HNSW index, quantization support. Go server calls Qdrant instead of in-process cosine similarity. Store `qdrant_point_id` on `photos_items`, query Qdrant at search time.

- **Do this if multi-tenant or >100K photos per org**

**Tier 3: sqlite-vec (future, watch only)**

Embedded SQLite extension — no external service. Requires CGO and custom PocketBase build. Still alpha (v0.1.7.alpha as of early 2025).

**Graceful degradation**: if `QDRANT_URL` is configured, use Qdrant; otherwise fall back to in-process brute-force. Same code path, different backend.

#### Job Persistence Layer

In-memory channel queue loses work on restart. `photos_job_queue` table provides durability:

**Collection `photos_job_queue`**:
| Field | Type | Notes |
|---|---|---|
| `photo` | relation → photos_items | target photo |
| `job_type` | select: `detect_faces` \| `encode_clip` \| `run_ocr` \| `compute_phash` \| `reverse_geocode` \| `recognize_faces` |
| `status` | select: `pending` \| `processing` \| `done` \| `failed` |
| `attempts` | number | retry count (max 3) |
| `last_error` | text | error message from last failed attempt |
| `scheduled_at` | date | don't process before this time (for backoff/retry) |
| `created_at` | date | when job was enqueued |

**Enqueue**: insert row into `photos_job_queue` instead of in-memory channel.

**Worker loop**: goroutine polls `WHERE status = 'pending' AND scheduled_at <= NOW() ORDER BY created_at LIMIT 100`, feeds jobs to `BatchCollector`.

**Batching**: ONNX Runtime gives 3.2× speed-up at batch=8 vs batch=1 on CPU. `BatchCollector` collects pending jobs, flushes when batch is full (default 8) or timer expires (2s). Flush sends all photos in one multipart request to ML sidecar, receives N results, updates each job individually.

**Batch size tuning**:
- GPU: batch=16–32
- CPU: batch=4–8
- Low-power (N100): batch=4

**Startup reconciliation**: on boot, reset `status = 'processing'` to `pending` (in-flight when process died). Re-queue `status = 'failed'` with `attempts < 3`.

**Retry backoff**: on failure, increment `attempts`, set `scheduled_at = NOW() + (2^attempts * 30s)` for exponential backoff (30s, 60s, 120s). After 3 attempts, mark `failed` permanently.

**Cleanup**: nightly job deletes rows with `status = 'done'` older than 7 days.

#### Face Clustering Algorithm

Greedy nearest-neighbor with configurable thresholds:

1. **Detection**: RetinaFace finds faces, ArcFace generates 512-dim embeddings
2. **Storage**: embeddings stored as binary BLOB in `photos_faces.embedding` (2048 bytes). If Qdrant enabled, also maintain separate `photos_faces` Qdrant collection
3. **Recognition**: for each unassigned face:
   - Load all face embeddings for the org, compute cosine distances in Go (or query Qdrant if configured)
   - Find faces within `maxDistance` (cosine distance, default ~0.5)
   - Require `minFaces` (default 3) matches to consider "core" person
   - If matches include existing person → assign to that person
   - If no person found but core → create new person
   - If not core → defer for later processing
4. **Merge**: users can manually merge people — reassigns all faces, deletes duplicate person
5. **Feature photo**: each person has `thumbnail_face` relation pointing to best representative face

**Configurable params**:
- `minScore`: face detection confidence threshold (default 0.7)
- `maxDistance`: max cosine distance for face matching (default 0.5)
- `minFaces`: minimum faces to form "core" person (default 3)

**Performance**: brute-force cosine similarity is O(n²) for n faces. For 10K faces, ~100M distance computations — manageable in Go with SIMD (~100ms). For 100K+ faces, use Qdrant.

**Known limitation — transitive chaining**: greedy nearest-neighbor can chain incorrectly (A matches B, B matches C, but A and C aren't same person). Mitigations:
- Keep `maxDistance` conservative (0.4–0.5)
- Require `minFaces ≥ 3` before creating new person
- Provide "split person" UI action

Future improvement (v3.x): replace with HDBSCAN or graph-based clustering (connected components with stricter edge thresholds).

#### Smart Search (CLIP Embeddings)

1. **Encoding**: CLIP model encodes image → 512-dim vector (default ViT-B-32)
2. **Storage**: vectors stored as binary BLOB in `photos_items.smart_search_vector`. If Qdrant enabled, also store point UUID in `qdrant_point_id` and push vector to Qdrant collection
3. **Query**: user types text → Go server encodes text with CLIP textual model → gets text embedding → searches:
   - **Brute-force mode** (default): load all org embeddings from SQLite, compute cosine similarity in Go, return top results
   - **Qdrant mode** (if `QDRANT_URL` configured): send text embedding to Qdrant KNN API, return top results
4. **Multilingual**: MCLIP models support 100+ languages via XLM-Roberta backbone
5. **Image-to-image**: search by photo → use existing asset's embedding as query vector
6. **Caching**: in-memory LRU cache (100 entries) for text embeddings in Go server
7. **Model switching**: changing CLIP model invalidates all embeddings (set to null + `ml_status` to `pending`), requires re-index. If Qdrant, also recreate collection with new dimension size.

**Configurable params**:
- `modelName`: CLIP model name (default ViT-B-32)
- `enabled`: toggle smart search on/off

#### OCR Pipeline

1. **Detection**: DBNet finds text regions → returns polygon bounding boxes
2. **Recognition**: SVTR reads each region → returns text + confidence scores
3. **Filtering**: drop results below `minRecognitionScore` (default 0.9)
4. **Storage**: concatenate all text into `search_text` field on photos_items
5. **Multilingual**: PP-OCRv5 supports 20+ languages
6. **Resolution**: max 736px for detection (configurable), auto-resize maintaining aspect ratio

**Configurable params**:
- `minDetectionScore`: text detection confidence (default 0.5)
- `minRecognitionScore`: text recognition confidence (default 0.9)
- `maxResolution`: max detection resolution (default 736)

#### Reverse Geocoding

- **Offline**: embed geonames DB as SQLite file shipped with Go server binary
- **Input**: lat/lon from EXIF GPS data
- **Output**: city, state, country strings stored on photos_items
- **Index**: in-memory KD-tree at startup — load geonames CSV, build KD-tree, discard after build. O(log n) nearest-neighbor lookup, ~50ms startup load for 12M geonames rows. No CGO needed.
- **Data source**: GeoNames `allCountries.txt` (~12M entries, ~300MB CSV). Ship as compressed file in Go binary, decompress at startup.

#### Perceptual Hashing (Duplicate Detection)

- **Algorithm**: pHash (perceptual hash) — 64-bit hash based on DCT of image
- **Storage**: `perceptual_hash` column on photos_items (hex string)
- **Computation**: pure Go, no ML server needed — use `github.com/corona10/goimagehash`
- **Incremental comparison**: on each photo upload, compare new hash against all existing hashes (O(n) per upload). 64-bit XOR + popcount is ~1ns per pair. 100K existing photos = ~0.1ms.
- **Batch comparison**: run all-pairs O(n²) only on explicit "find duplicates" request. 100K photos = 10B comparisons = ~10 seconds in Go — acceptable as one-time batch operation.
- **Grouping**: photos with near-identical pHash (Hamming distance ≤ threshold, default 5) grouped as duplicates
- **UI**: show duplicate groups, let user keep best, delete rest

#### ML Server Health Monitoring

- **Availability checks**: ping ML server URL at configurable interval (default 30s)
- **Healthy-first routing**: try healthy servers first, fall back to unhealthy
- **Auto-recovery**: server marked unhealthy, retried on next interval, auto-recovers
- **Multi-server**: support multiple ML server URLs for load balancing / HA
- **Graceful degradation**: all ML features silently disabled when no healthy server

#### Go Server ML Client

```go
type MLClient struct {
    urls    []string
    healthy map[string]bool
    mu      sync.RWMutex
    client  *http.Client
}

func (c *MLClient) Predict(ctx context.Context, image io.Reader, pipeline PipelineSpec) (Response, error)
func (c *MLClient) Ping() bool
```

Builds multipart form: "entries" = JSON pipeline, "image" = file bytes. Tries healthy URLs first, falls back to unhealthy.

#### Vector Search Client

```go
type VectorSearcher interface {
    Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error)
    Upsert(ctx context.Context, photoID string, embedding []float32) error
    Delete(ctx context.Context, photoID string) error
}

// Factory: if QDRANT_URL env var is set, return QdrantSearcher; else BruteForceSearcher
func NewVectorSearcher(app *pocketbase.PocketBase) VectorSearcher
```

#### ML Settings (TinyCld Settings Panel)

```ts
settings: [
    {
        slug: 'photos-ml',
        component: 'settings/ml',
        label: 'Photos ML',
    },
],
```

Settings panel controls:
- ML server URLs (array of strings)
- Face detection model + min score
- Face recognition max distance + min faces
- CLIP model name
- OCR enabled + model + min scores
- Vector search mode: brute-force (default) or Qdrant (if URL configured)
- Run initial processing (button to queue all existing photos)
- Retry failed items (button to re-queue photos with `ml_status = 'failed'`)
- Processing status (pending / processing / done / failed counts, current job)

#### ML State Collection

Single-record collection `photos_ml_state`:

| Field | Type | Notes |
|---|---|---|
| `clip_model_name` | text | current CLIP model, changes trigger re-index |
| `face_model_name` | text | current face recognition model |
| `last_face_detection` | date | timestamp of last face detection run |
| `last_face_recognition` | date | timestamp of last face recognition run |
| `last_clip_encode` | date | timestamp of last CLIP encoding run |
| `last_ocr_run` | date | timestamp of last OCR run |

Per-photo status: tracked via `photos_items.ml_status` (`pending` | `processing` | `done` | `failed`). Job-level status: tracked via `photos_job_queue` table — query `SELECT status, COUNT(*) FROM photos_job_queue GROUP BY status`.

#### Screens

- **Search** — full-text search across OCR text, descriptions, filenames, dates, locations + semantic search via CLIP
- **People grid** — browse by person, tap to see all photos of that person
- **Map view** — map with photo clusters (MapLibre or Leaflet)
- **Memories** — "On this day", "Best of last month", curated highlights feed
- **Duplicate manager** — browse duplicate groups, select keepers, bulk delete

#### Hooks & Stores

- **useSearch** — debounced FTS query + semantic search, facet counts (people, locations, dates)
- **usePeople** — person list, person photos query
- **useMemories** — memory feed queries
- **photos-ui-store** — zustand store for selection state, active filters, viewer state

#### Hardware Requirements

| Tier | RAM | CPU | GPU | Indexing speed | Use case |
|---|---|---|---|---|---|
| Minimum | 4 GB | 2-core x86 | — | ~50 photos/hour | Small library (<5K photos), patient |
| Recommended | 8 GB | 4-core x86 | — | ~200 photos/hour | Medium library (10–50K), overnight indexing |
| GPU-accelerated | 8 GB+ | 2-core + NVIDIA | CUDA | ~2000 photos/hour | Large library (50K+), responsive |

**Storage overhead**: budget 30–50% above raw library size for thumbnails, embeddings, ML artifacts:
- Thumbnails: ~50KB each (400px longest edge)
- CLIP embeddings: 2KB each (512 × float32)
- Face embeddings: 2KB each per detected face (~2–5 faces/photo average)
- ML model cache: 1–4 GB on disk (depends on models enabled)
- Example: 500 GB raw library → 650–750 GB total with ML enabled

**Low-power hardware (N100, Raspberry Pi, etc.)**: ML processing on CPU-only is slow. Initial library indexing of 10K+ photos takes hours to days. Recommend:
- Enable ML, run indexing overnight or during off-hours
- Use `buffalo_s` instead of `buffalo_l` for face detection
- Use `ViT-B-32` for CLIP
- Skip OCR if not needed (PP-OCRv5 is slowest pipeline component on CPU)

**GPU passthrough**: Docker supports NVIDIA GPU via `--gpus` flag. ML sidecar accepts `MACHINE_LEARNING_DEVICE_ID=0` to use CUDA.

```
MACHINE_LEARNING_ENABLED=true
MACHINE_LEARNING_URLS=http://tinycld-ml:3003
MACHINE_LEARNING_FACIAL_RECOGNITION_MODEL=buffalo_l
MACHINE_LEARNING_FACIAL_RECOGNITION_MIN_SCORE=0.7
MACHINE_LEARNING_FACIAL_RECOGNITION_MAX_DISTANCE=0.5
MACHINE_LEARNING_FACIAL_RECOGNITION_MIN_FACES=3
MACHINE_LEARNING_CLIP_MODEL_NAME=ViT-B-32__openai
MACHINE_LEARNING_OCR_ENABLED=true
MACHINE_LEARNING_OCR_MODEL_NAME=PP-OCRv5_mobile
MACHINE_LEARNING_OCR_MIN_DETECTION_SCORE=0.5
MACHINE_LEARNING_OCR_MIN_RECOGNITION_SCORE=0.9
MACHINE_LEARNING_CACHE_FOLDER=/tmp/ml_models
MACHINE_LEARNING_MODEL_TTL=300
MACHINE_LEARNING_WORKERS=1
MACHINE_LEARNING_DEVICE_ID=0  # GPU device

# Vector search (optional — if set, use Qdrant; otherwise brute-force in Go)
QDRANT_URL=http://tinycld-qdrant:6333
QDRANT_COLLECTION=photos_clip
QDRANT_API_KEY=  # optional
```

#### Migrations (pb-migrations)

```
pb-migrations/
  1717000001_create_photos_people.js
  1717000002_create_photos_faces.js
  1717000003_create_photos_memories.js
  1717000004_create_photos_memory_items.js
  1717000005_create_photos_ml_state.js
  1717000006_create_photos_job_queue.js
  1717000007_add_fields_photos_items_v3.js  # search_text, location, lat/lon, smart_search_vector, qdrant_point_id, perceptual_hash, ml_status
```

Each migration follows PocketBase JS migration format with `migrate((app) => { ... })` and rollback.

#### pbtsdb Types

```ts
export type PhotosPerson = {
  id: string
  name: string
  thumbnail_face: string | null
  is_hidden: boolean
  birth_date: string | null
  color: string | null
  org: string
  owner: string
}

export type PhotosFace = {
  id: string
  photo: string
  person: string | null
  bounding_box: { x1: number; y1: number; x2: number; y2: number }
  embedding: ArrayBuffer  // 512 × float32 = 2048 bytes
  image_width: number
  image_height: number
  source_type: 'ml' | 'manual'
  is_visible: boolean
}
```

Register in `tinycld/photos/collections.ts` via `defineCollections`.

---

## v4 — Sharing & Collaboration

Org members collaborate on albums, share externally.

### Routes

- **`public-screens/share/[token].tsx`** — public share link view (no auth required), rendered under `app/app/p/photos/share/[token].tsx` via `publicRoutes` in manifest
- **`public-screens/share/_layout.tsx`** — bare layout wrapper for public routes (no auth gate)

### Data Model

- New collection `photos_album_shares` — invite org members
  - `album`, `user_org`, `role` (editor | viewer), `invited_by`

- New collection `photos_share_links` — public share links
  - `album`, `token` (64-char hex), `role`, `expires_at`, `password_hash` (nullable), `download_count`, `last_accessed_at`

### Go Server

- Share link endpoints: create, verify, list, revoke
- Password-protected links with rate-limited access
- Token-based download endpoint for single photos / zip albums
- Email notifications: "X shared an album with you"
- Public share link handler: verify token, check expiry, serve album view without auth

### Screens

- Share dialog — invite org members by name/email, set role, manage existing collaborators
- Public link dialog — create link, copy URL, set password, set expiry, view download stats
- Shared-with-me section in sidebar
- Public album view — shared link renders album without auth, optional password gate

---

## v5 — Platform Maturity

Polish, sync, offline, ecosystem integration.

### Features

- **Offline support** — cache recent thumbnails, mark albums for offline, background sync queue
- **Ecosystem integration** — "Save to Photos" action from Drive (share code via `save-to-photos` lib like drive's `save-to-drive`), import from Mail attachments
- **Bulk operations** — multi-select → add to album, tag, trash, download zip
- **Editing** — rotate, crop (basic), reorder album items via drag-and-drop
- **EXIF editing** — edit date taken, location, description
- **Storage quotas** — per-user photo storage limits (reuse drive's quota pattern)
- **Notifications** — "X added you to album", "New memory available"
- **Audit logging** — all mutations logged via core audit hooks
- **WebDAV export** — mount photos timeline as read-only folder: `YYYY/MM/DD/IMG_1234.jpg`
- **Takeout import** — `@tinycld/google-takeout-import` integration: import Google Photos takeout
- **Background upload** — mobile background upload service for camera roll sync (v5.1)
- **RAW support** — server-side RAW → JPEG conversion for preview (v5.2, depends on libraw/dcraw availability)

### Technical

- **Perf** — thumbnail prefetching on scroll direction prediction, intersection-observer-based lazy loading
- **Accessibility** — full keyboard nav, screen reader labels, focus management in viewer
- **Testing** — e2e test suite (upload flow, album creation, viewer navigation, search)
- **CI** — GitHub Actions for typecheck, unit tests, e2e (Playwright), Go tests

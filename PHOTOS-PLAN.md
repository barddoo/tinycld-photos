# Photos — Multi-version Plan

## v1 — Core Photo Experience (MVP)

Ship a working photo gallery: view, upload, organize, favorite.

### Data Model (3 collections)

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
| `order` | number |

### Go Server

- `OnRecordCreate("photos_items")` — extract EXIF (dimensions, date taken), generate thumbnail (Go `image` stdlib resize to 400px longest edge)
- `OnRecordAfterUpdate("photos_items")` — regenerate thumbnail if file changed
- `OnRecordAfterDelete("photos_items")` — cascade cleanup (delete file + thumbnail from storage)
- Register all collections with core's audit hooks

### Screens

1. **`_layout.tsx`** — `FrozenSlideStack` wrapper + `PhotosProvider` context, mounts `PhotoViewer` modal layer
2. **`index.tsx`** — Timeline: virtualized `FlashList` grid with date-section headers (Today, Yesterday, Jun 3, ...). Tap to open viewer. Pull-to-refresh. FAB for upload.
3. **`[id].tsx`** — Photo viewer: full-screen image, swipe prev/next (horizontal pager), info overlay (date, dimensions, description), action bar (favorite toggle, add to album, trash, download)
4. **`albums/index.tsx`** — Album list: grid of album cards (cover thumbnail, name, photo count)
5. **`albums/[id].tsx`** — Album detail: same grid as timeline, scoped to album photos. Header with album name + edit/delete actions.

### Hooks

- **usePhotos** — `useOrgLiveQuery` for photos_items, groups by day, filters for favorites/trash/all, exposes timeline segments
- **usePhotoMutations** — upload (file picker → PB create), delete, trash, restore, toggle favorite, update description
- **useAlbums** — album queries + album_items join, derives cover photo + photo count
- **useAlbumMutations** — create/edit/delete album, add/remove photos, reorder

### Components

- **PhotoCard** — grid cell: thumbnail image, favorite indicator, aspect-ratio-aware sizing from width/height
- **PhotoViewer** — full-screen pager with swipe gestures, pinch-to-zoom, dismiss on swipe-down
- **PhotoInfoSheet** — bottom sheet: date, dimensions, description (editable), actions
- **AlbumCard** — album cover tile with photo count badge
- **UploadButton** — FAB: triggers native file picker, shows upload progress
- **DateSectionHeader** — sticky date label in timeline

### Sidebar

Sections: Timeline (home), Albums, Favorites, Trash. Selection highlights the active section.

---

## v2 — Rich Media & Organization

Move beyond static images into video, live photos, and deeper organization.

### Data Model

- New fields on `photos_items`:
  - `type`: `image | video | live_photo` (expand beyond image-only)
  - `duration` — video length in ms
  - `live_photo_pair_id` — FK to paired still/video (for Apple Live Photos)

- New collection `photos_tags` — hierarchical tags
  - `id`, `name`, `color`, `parent_id` (self-ref), `org`, `owner`

- New collection `photos_item_tags` — M:N join
  - `item`, `tag`

### Go Server

- Video thumbnail generation (ffmpeg first-frame extraction)
- Video metadata extraction (duration, codec, resolution)
- Live Photo pairing: detect HEIC + MOV with matching filename stem

### Screens

- **Video player** — inline playback in viewer, scrub bar, mute toggle
- **Tag management** — create/edit/delete tags, assign colors
- **Tag filter sidebar** — filter timeline by tag

### Components

- **VideoThumbnail** — thumbnail with duration badge + play overlay
- **TagChip** — small colored pill for filter bar
- **TagPicker** — search + select tags for a photo

### Hooks

- **useVideoPlayer** — playback state, preload adjacent videos
- **useTags** — tag CRUD queries
- **useTagFilter** — active tag set, intersection logic

---

## v3 — Intelligence & Discovery

Add search, AI-powered features, and discovery surfaces.

### ML Architecture (Inspired by Immich, Adapted for TinyCld)

**Design principle**: ML inference runs in a separate Python/FastAPI microservice (sidecar container). Go server in `server/` package calls it via HTTP. Models auto-download from HuggingFace Hub, cached to disk with TTL eviction.

#### Deployment Model

TinyCld runs as a single Docker container. ML server deploys as an **optional sidecar** — same `docker-compose.yml`, separate service:

```yaml
services:
  tinycld:
    image: ghcr.io/tinycld/app:latest
    # ... existing config

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

- ML server is **optional** — photos package works without it (no faces, no smart search, no OCR)
- Go server detects ML availability via health check ping
- All ML features gracefully degrade when ML server is absent
- Same model cache volume persists across restarts

#### ML Server (Python microservice — based on Immich's `machine-learning/`)

- **FastAPI** app with single `/predict` endpoint accepting multipart form data (image or text + pipeline spec)
- **ONNX Runtime** as inference engine — supports CPU, CUDA, ROCm, OpenVINO, CoreML, ARMNN, RKNN
- **Model cache**: in-memory LRU with TTL eviction (configurable, default 300s). Models unload after inactivity, auto-reload on next request
- **Thread pool**: configurable worker threads for blocking inference calls (default = CPU count)
- **Auto-shutdown**: polls active request count, shuts down process after idle timeout (saves resources)
- **Preload config**: optionally preload specific models at startup via env var
- **Batch axis injection**: dynamically adds batch dimension to ONNX models for batched inference
- **Model formats**: ONNX (universal), ARMNN (Raspberry Pi), RKNN (Rockchip NPU), OpenVINO (Intel)
- **Model downloads**: HuggingFace Hub snapshots, stored under `cache_folder/<task>/<model_name>/`
- **Cache clearing**: safe `rmtree` on corrupted model cache, auto-re-download on next request

#### Pipeline Architecture

Each inference request specifies a **pipeline** — a set of model tasks to run in dependency order:

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
- Each model declares its dependencies via `depends: ClassVar[list[ModelIdentity]]`
- Pipeline resolves dependency graph, runs independent tasks concurrently via `asyncio.gather`

#### Model Zoo (from Immich)

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

#### VLM Caption Generation (v3.1 — deferred but planned)

CLIP embeddings excel at semantic similarity but don't capture fine-grained descriptions. The current community standard (Immich, PhotoPrism, Stash) separates these tasks:

- **CLIP** → semantic search embeddings only (image-to-text similarity)
- **VLM** → natural language captions stored as text, indexed via FTS

**Pipeline**: photo uploaded → VLM (Qwen 2.5VL, Gemma 3, or Mistral Small via Ollama) generates caption → caption stored in `photos_items.description` → FTS index updated → searchable via keyword match.

**Why this matters**: CLIP can find "a dog on a beach" from a text query, but a VLM caption like "golden retriever running on Malibu beach at sunset, waves breaking in background" is both human-readable and FTS-searchable for specific terms ("golden retriever", "Malibu", "sunset"). The two approaches complement each other.

**ML server extension**: add a `caption` task to the `/predict` pipeline that calls a VLM endpoint. Since VLMs are large (7B+ params), they run externally via Ollama, not in the ML sidecar. The ML server acts as a proxy: receives image → forwards to Ollama → returns caption.

```json
{
  "caption": {
    "generate": { "modelName": "qwen2.5-vl:7b", "options": { "prompt": "Describe this image in detail." } }
  }
}
```

**Deferral rationale**: VLM inference on CPU is slow (~30s per image on N100). GPU required for reasonable throughput. Defer to v3.1 after core ML pipeline (faces, CLIP, OCR) is stable.

#### Data Model (PocketBase Collections)

- New fields on `photos_items`:
  - `search_text` — concatenated OCR + description for FTS (populated by OCR pipeline)
  - `location` — geocoded place name (city, state, country)
  - `latitude` — number, GPS latitude from EXIF
  - `longitude` — number, GPS longitude from EXIF
  - `smart_search_vector` — blob, CLIP embedding stored as raw binary float32 array (512–1024 × 4 bytes). See [Vector Search Strategy](#vector-search-strategy) for storage/search approach.
  - `qdrant_point_id` — text, UUID of the Qdrant point if using Tier 2 Qdrant sidecar (null for brute-force mode)
  - `perceptual_hash` — text, pHash hex string for duplicate detection
  - `ml_status` — select: `pending` | `processing` | `done` | `failed` — tracks ML pipeline state per photo, enables retry of failed items

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

- Zero additional infrastructure
- Works today, no CGO, no sidecar
- **Do this for v3.**

**Tier 2: Qdrant sidecar (optional, >100K photos)**

```yaml
services:
  tinycld:
    ...
  tinycld-ml:
    ...
  tinycld-qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant-storage:/qdrant/storage
    ports:
      - "6333:6333"  # REST API
```

Qdrant is ~256MB RAM idle, clean REST API, HNSW index, quantization support, production-grade. Go server calls Qdrant instead of in-process cosine similarity. Store `qdrant_point_id` on `photos_items`, query Qdrant at search time.

- **Do this if multi-tenant or >100K photos per org**
- Downsides: another container, data lives outside SQLite (backup complexity), overkill below 100K

**Tier 3: sqlite-vec (future, watch only)**

Embedded SQLite extension — no external service, keeps everything inside PocketBase's SQLite file. Pure C, MIT/Apache licensed.

The catch: PocketBase compiles Go with SQLite bundled. To load a SQLite extension you need CGO enabled and to link against the extension at build time — custom PocketBase build via `replace` directive or forking `cmd/` entrypoint. Still alpha (v0.1.7.alpha as of early 2025). HNSW index in progress.

**Do this when it hits v1.0 or when brute-force latency becomes a problem and Qdrant is undesirable.**

**Graceful degradation pattern**: if `QDRANT_URL` is configured in env, use Qdrant; otherwise fall back to in-process brute-force. Same code path, different backend. Users get the right behavior for their scale without config changes.

**What not to use**:
- **pgvector**: requires PostgreSQL, abandons PocketBase's entire model
- **Chroma**: Python-native, slower, less mature than Qdrant
- **Weaviate/Milvus**: enterprise-scale complexity, massive resource overhead
- **LanceDB**: interesting but Go bindings are thin, awkward in Python sidecar

#### Job Persistence Layer

The in-memory channel queue loses all queued work on process restart. A `photos_job_queue` table provides durability with zero external dependencies (no Redis, no BullMQ):

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

**Enqueue**: instead of firing into an in-memory channel, insert a row:
```go
func (q *MLJobQueue) QueueDetectFaces(photoID string) {
    record := core.NewRecord("photos_job_queue")
    record.Set("photo", photoID)
    record.Set("job_type", "detect_faces")
    record.Set("status", "pending")
    record.Set("attempts", 0)
    q.app.Save(record)
}
```

**Worker loop**: a goroutine polls `WHERE status = 'pending' AND scheduled_at <= NOW() ORDER BY created_at LIMIT 100`, processes each, updates status. Runs continuously with a 1-second sleep between polls:
```go
func (q *MLJobQueue) WorkerLoop() {
    for {
        jobs, _ := q.app.GetPage("photos_job_queue", 1, 100,
            "status = 'pending' AND scheduled_at <= NOW() ORDER BY created_at")
        for _, j := range jobs {
            q.sem <- struct{}{}
            go func(job *core.Record) {
                defer func() { <-q.sem }()
                q.processJob(job)
            }(j)
        }
        time.Sleep(time.Second)
    }
}
```

**Startup reconciliation**: on boot, any jobs with `status = 'processing'` are reset to `pending` (they were in-flight when the process died). Jobs with `status = 'failed'` and `attempts < 3` are re-queued. No need to scan `photos_items` — the job table is the source of truth.

**Retry backoff**: on failure, increment `attempts`, set `scheduled_at = NOW() + (2^attempts * 30s)` for exponential backoff (30s, 60s, 120s). After 3 attempts, mark `failed` permanently.

**Cleanup**: a nightly job deletes rows with `status = 'done'` older than 7 days to prevent table bloat.

**Batching strategy**: ONNX Runtime gives 3.2× speed-up at batch=8 vs batch=1 on CPU. The worker loop should collect pending jobs into batches before dispatching to the ML sidecar:

```go
type BatchCollector struct {
    mu      sync.Mutex
    jobs    []*core.Record
    maxSize int
    timer   *time.Timer
    flush   func([]*core.Record)
}

func (b *BatchCollector) Add(job *core.Record) {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.jobs = append(b.jobs, job)
    if len(b.jobs) >= b.maxSize {
        b.flushLocked()
    } else if b.timer == nil {
        b.timer = time.AfterFunc(2*time.Second, b.flushLocked)
    }
}

func (b *BatchCollector) flushLocked() {
    if len(b.jobs) == 0 { return }
    batch := b.jobs
    b.jobs = nil
    b.timer = nil
    go b.flush(batch)
}
```

Worker loop becomes: poll pending jobs → feed to `BatchCollector` → collector flushes when batch is full (default 8) or timer expires (2s). The flush function sends all photos in one multipart request to the ML sidecar, receives N results, updates each job individually.

**Batch size tuning**:
- GPU: batch=16–32 (max throughput)
- CPU: batch=4–8 (sweet spot for ONNX Runtime)
- Low-power (N100): batch=4 (memory-constrained)

**Fallback**: if ML sidecar doesn't support batch endpoint, fall back to per-photo dispatch (single-image `/predict` still works).

**Why not Redis**: Redis adds an external dependency, operational complexity, and is overkill for self-hosted scale. A SQLite table survives restarts, is queryable for debugging, and handles thousands of jobs/sec without issue. Immich uses Redis because it's a Node.js ecosystem convention (Bull queues); Go + SQLite doesn't need it.

#### Face Clustering Algorithm (Inspired by Immich)

Immich uses a **greedy nearest-neighbor** approach with configurable thresholds:

1. **Detection**: RetinaFace finds faces, ArcFace generates 512-dim embeddings
2. **Storage**: embeddings stored as binary BLOB in `photos_faces.embedding` (2048 bytes). If Qdrant enabled, also maintain a separate `photos_faces` Qdrant collection for face matching
3. **Recognition**: for each unassigned face:
   - Load all face embeddings for the org, compute cosine distances in Go (or query Qdrant if configured)
   - Find faces within `maxDistance` (cosine distance, default ~0.5)
   - Require `minFaces` (default 3) matches to consider "core" person
   - If matches include an existing person → assign to that person
   - If no person found but core → create new person
   - If not core → defer for later processing (may merge when more faces detected)
4. **Merge**: users can manually merge people — reassigns all faces, deletes duplicate person
5. **Feature photo**: each person has a `thumbnail_face` relation pointing to their best representative face

**Configurable params**:
- `minScore`: face detection confidence threshold (default 0.7)
- `maxDistance`: max cosine distance for face matching (default 0.5)
- `minFaces`: minimum faces to form a "core" person (default 3)

**Performance consideration**: brute-force cosine similarity is O(n²) for n faces. For 10K faces, that's 100M distance computations — manageable in Go with SIMD (~100ms). For 100K+ faces, consider external vector service.

**Known limitation — transitive chaining**: greedy nearest-neighbor can chain incorrectly: A matches B, B matches C, but A and C aren't the same person. This causes distinct people to merge into one. Immich has struggled with this in production. Mitigations for v3:
- Keep `maxDistance` conservative (0.4–0.5) to reduce false positives
- Require `minFaces ≥ 3` before creating a new person (reduces singleton noise)
- Provide a "split person" UI action so users can manually correct merges

Future improvement (v3.x): replace with HDBSCAN or a proper graph-based clustering approach (connected components with stricter edge thresholds) that doesn't suffer from transitive chaining.

#### Smart Search (CLIP Embeddings)

1. **Encoding**: CLIP model encodes image → 512-dim vector (default ViT-B-32)
2. **Storage**: vectors stored as binary BLOB in `photos_items.smart_search_vector` (raw float32 bytes). If Qdrant enabled, also store point UUID in `qdrant_point_id` and push vector to Qdrant collection
3. **Query**: user types text → Go server encodes text with CLIP textual model → gets text embedding → searches:
   - **Brute-force mode** (default): load all org embeddings from SQLite, compute cosine similarity in Go, return top results
   - **Qdrant mode** (if `QDRANT_URL` configured): send text embedding to Qdrant KNN API, return top results
4. **Multilingual**: MCLIP models support 100+ languages via XLM-Roberta backbone
5. **Image-to-image**: search by photo → use existing asset's embedding as query vector
6. **Caching**: in-memory LRU cache (100 entries) for text embeddings in Go server — avoids re-encoding same query
7. **Model switching**: changing CLIP model invalidates all embeddings (set to null + `ml_status` to `pending`), requires re-index. If Qdrant, also recreate collection with new dimension size.

**Configurable params**:
- `modelName`: CLIP model name (default ViT-B-32)
- `enabled`: toggle smart search on/off

#### OCR Pipeline

1. **Detection**: DBNet finds text regions → returns polygon bounding boxes
2. **Recognition**: SVTR reads each region → returns text + confidence scores
3. **Filtering**: drop results below `minRecognitionScore` (default 0.9)
4. **Storage**: concatenate all text into `search_text` field on photos_items
5. **Multilingual**: PP-OCRv5 supports 20+ languages (Chinese, English, Korean, Japanese, etc.)
6. **Resolution**: max 736px for detection (configurable), auto-resize maintaining aspect ratio

**Configurable params**:
- `minDetectionScore`: text detection confidence (default 0.5)
- `minRecognitionScore`: text recognition confidence (default 0.9)
- `maxResolution`: max detection resolution (default 736)

#### Reverse Geocoding

- **Offline**: embed geonames DB as SQLite file shipped with Go server binary
- **Input**: lat/lon from EXIF GPS data (extracted during metadata extraction)
- **Output**: city, state, country strings stored on photos_items
- **Fallback**: if no GPS data, skip geocoding
- **Index strategy**: naive `ORDER BY distance LIMIT 1` is a full table scan on millions of rows. Use one of:
  1. **SQLite R*Tree extension**: create a virtual R*Tree index on geonames lat/lon, query with bounding box filter, then sort by exact distance. SQLite ships with R*Tree as an extension — enable with `CGO_ENABLED=1` and `#define SQLITE_ENABLE_RTREE`.
  2. **In-memory KD-tree at startup**: load geonames into a KD-tree (use `github.com/muesli/clusters` or implement from scratch). O(log n) nearest-neighbor lookup, ~50ms startup load for 12M geonames rows.
  3. **Pre-built spatial index**: ship a separate SQLite file with an R*Tree index already built. No CGO needed, just `ATTACH` the index database.
- **Recommended**: approach 2 (in-memory KD-tree) — simplest, no CGO, fast enough for self-hosted scale. Load geonames CSV at startup, build KD-tree, discard after build. Lookup is O(log n) with no disk I/O.
- **Data source**: GeoNames `allCountries.txt` (~12M entries, ~300MB CSV). Ship as compressed file in Go binary, decompress at startup.

#### Perceptual Hashing (Duplicate Detection)

- **Algorithm**: pHash (perceptual hash) — 64-bit hash based on DCT of image
- **Storage**: `perceptual_hash` column on photos_items (hex string)
- **Computation**: pure Go, no ML server needed — use `github.com/corona10/goimagehash`
- **Incremental comparison**: on each photo upload, compare new hash against all existing hashes (O(n) per upload, not O(n²)). 64-bit XOR + popcount is extremely fast (~1ns per pair). 100K existing photos = 100K comparisons = ~0.1ms.
- **Batch comparison**: run all-pairs O(n²) only on explicit "find duplicates" request from settings panel. 100K photos = 10B comparisons = ~10 seconds in Go — acceptable as a one-time batch operation.
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

func (c *MLClient) Predict(ctx context.Context, image io.Reader, pipeline PipelineSpec) (Response, error) {
    // Build multipart form: "entries" = JSON pipeline, "image" = file bytes
    // Try healthy URLs first, then fall back to unhealthy
    // Return first successful response
}

func (c *MLClient) Ping() bool {
    // GET /ping on each URL, update healthy map
}
```

#### Vector Search Client

```go
type VectorSearcher interface {
    Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error)
    Upsert(ctx context.Context, photoID string, embedding []float32) error
    Delete(ctx context.Context, photoID string) error
}

// BruteForceSearcher — loads all embeddings from SQLite, computes cosine similarity in Go
type BruteForceSearcher struct {
    app *pocketbase.PocketBase
}

// QdrantSearcher — calls Qdrant REST API for KNN search
type QdrantSearcher struct {
    url        string
    collection string
    apiKey     string
    client     *http.Client
}

// Factory: if QDRANT_URL env var is set, return QdrantSearcher; else BruteForceSearcher
func NewVectorSearcher(app *pocketbase.PocketBase) VectorSearcher {
    if qdrantURL := os.Getenv("QDRANT_URL"); qdrantURL != "" {
        return &QdrantSearcher{url: qdrantURL, collection: os.Getenv("QDRANT_COLLECTION")}
    }
    return &BruteForceSearcher{app: app}
}
```

Both implementations satisfy the same interface. The rest of the codebase calls `VectorSearcher.Search()` without knowing which backend is active.

#### ML Settings (TinyCld Settings Panel)

Add a settings panel via manifest `settings` field:

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

Single-record collection `photos_ml_state` for tracking ML pipeline configuration and summary stats:

| Field | Type | Notes |
|---|---|---|
| `clip_model_name` | text | current CLIP model, changes trigger re-index |
| `face_model_name` | text | current face recognition model |
| `last_face_detection` | date | timestamp of last face detection run |
| `last_face_recognition` | date | timestamp of last face recognition run |
| `last_clip_encode` | date | timestamp of last CLIP encoding run |
| `last_ocr_run` | date | timestamp of last OCR run |

**Per-photo status**: tracked via `photos_items.ml_status` (`pending` | `processing` | `done` | `failed`). Query `WHERE ml_status = 'failed'` to see which specific photos need retry.

**Job-level status**: tracked via `photos_job_queue` table — the authoritative source for what's queued, processing, done, or failed. The settings panel reads job counts from this table, not from aggregate counters. No need for derived counters in `photos_ml_state` — query the job table directly:

```sql
SELECT status, COUNT(*) FROM photos_job_queue GROUP BY status
```

This eliminates the need to maintain sync between aggregate counters and actual job state.

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

ML processing has meaningful resource demands. The photos package works without ML (graceful degradation), but enabling it requires:

| Tier | RAM | CPU | GPU | Indexing speed | Use case |
|---|---|---|---|---|---|
| Minimum | 4 GB | 2-core x86 | — | ~50 photos/hour | Small library (<5K photos), patient |
| Recommended | 8 GB | 4-core x86 | — | ~200 photos/hour | Medium library (10–50K), overnight indexing |
| GPU-accelerated | 8 GB+ | 2-core + NVIDIA | CUDA | ~2000 photos/hour | Large library (50K+), responsive |

**Storage overhead**: budget 30–50% above raw library size for thumbnails, embeddings, and ML artifacts:
- Thumbnails: ~50KB each (400px longest edge)
- CLIP embeddings: 2KB each (512 × float32)
- Face embeddings: 2KB each per detected face (~2–5 faces/photo average)
- ML model cache: 1–4 GB on disk (depends on models enabled)
- Example: 500 GB raw library → 650–750 GB total with ML enabled

**Low-power hardware (N100, Raspberry Pi, etc.)**: ML processing on CPU-only will be slow. Initial library indexing of 10K+ photos takes hours to days. Recommend:
- Enable ML but run indexing overnight or during off-hours
- Use `buffalo_s` instead of `buffalo_l` for face detection (smaller model, faster, slightly less accurate)
- Use `ViT-B-32` for CLIP (smallest model with good quality)
- Skip OCR if not needed (PP-OCRv5 is the slowest pipeline component on CPU)

**GPU passthrough**: Docker supports NVIDIA GPU via `--gpus` flag. The ML sidecar container accepts `MACHINE_LEARNING_DEVICE_ID=0` to use CUDA. One-time model download happens on first use; subsequent inference is fast.

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

New collections require PocketBase migrations in `pb-migrations/`:

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

Each migration follows PocketBase JS migration format:

```js
// 1717000001_create_photos_people.js
migrate((app) => {
  const collection = new Collection({
    id: 'photos_people',
    name: 'photos_people',
    type: 'base',
    system: false,
    schema: [
      { id: 'name', name: 'name', type: 'text', required: false },
      { id: 'thumbnail_face', name: 'thumbnail_face', type: 'relation', options: { collectionId: 'photos_faces', maxSelect: 1 } },
      { id: 'is_hidden', name: 'is_hidden', type: 'bool', required: false },
      { id: 'birth_date', name: 'birth_date', type: 'date', required: false },
      { id: 'color', name: 'color', type: 'text', required: false },
      { id: 'org', name: 'org', type: 'relation', options: { collectionId: 'orgs', maxSelect: 1 } },
      { id: 'owner', name: 'owner', type: 'relation', options: { collectionId: 'user_org', maxSelect: 1 } },
    ],
    indexes: ['CREATE INDEX idx_photos_people_org ON photos_people (org)', 'CREATE INDEX idx_photos_people_owner ON photos_people (owner)'],
    listRule: 'org = @request.auth.org.id',
    viewRule: 'org = @request.auth.org.id',
    createRule: 'org = @request.auth.org.id',
    updateRule: 'org = @request.auth.org.id',
    deleteRule: 'org = @request.auth.org.id',
  })
  return app.Save(collection)
}, (app) => {
  return app.Delete(app.FindCollectionByNameOrId('photos_people'))
})
```

```js
// 1717000006_create_photos_job_queue.js
migrate((app) => {
  const collection = new Collection({
    id: 'photos_job_queue',
    name: 'photos_job_queue',
    type: 'base',
    system: false,
    schema: [
      { id: 'photo', name: 'photo', type: 'relation', options: { collectionId: 'photos_items', maxSelect: 1, cascadeDelete: true } },
      { id: 'job_type', name: 'job_type', type: 'select', options: { values: ['detect_faces', 'encode_clip', 'run_ocr', 'compute_phash', 'reverse_geocode', 'recognize_faces'] } },
      { id: 'status', name: 'status', type: 'select', options: { values: ['pending', 'processing', 'done', 'failed'] }, default: 'pending' },
      { id: 'attempts', name: 'attempts', type: 'number', default: 0 },
      { id: 'last_error', name: 'last_error', type: 'text', required: false },
      { id: 'scheduled_at', name: 'scheduled_at', type: 'date', required: false },
      { id: 'created_at', name: 'created_at', type: 'date' },
    ],
    indexes: [
      'CREATE INDEX idx_job_queue_status_scheduled ON photos_job_queue (status, scheduled_at, created_at)',
      'CREATE INDEX idx_job_queue_photo ON photos_job_queue (photo)',
    ],
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  })
  return app.Save(collection)
}, (app) => {
  return app.Delete(app.FindCollectionByNameOrId('photos_job_queue'))
})
```

#### pbtsdb Types

Add to `tinycld/photos/types.ts`:

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

Register in `tinycld/photos/collections.ts`:

```ts
import { defineCollections } from '@tinycld/core/lib/pbtsdb'
import type { PhotosPerson, PhotosFace } from './types'

export const { useLiveQuery, useRecord, ... } = defineCollections<{
  photos_people: PhotosPerson
  photos_faces: PhotosFace
}>({ ... })
```

---

## v4 — Sharing & Collaboration

Let org members collaborate on albums and share externally.

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

Polish, sync, offline, and ecosystem integration.

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

# photos

Photos for your organization — [tinycld](https://tinycld.org/) feature package.

## Features

### Library & organization
- Chronological photo grid grouped by day
- Albums — create, rename, delete, add/remove photos
- Tags — tag photos and filter by tag
- Trash — soft-delete with restore and permanent delete
- Upload queue with progress tracking
- Configurable thumbnail quality (optimized / high)

### People & faces
- Automatic face detection using SCRFD (buffalo_l model)
- Face recognition via 512-dim embeddings
- Automated face clustering — detected faces are matched to existing people
- Merge two people into one; split a person into two
- People browser with per-person photo grid
- Hidden people support (exclude from suggestions)

### Semantic search & OCR
- Natural-language semantic search powered by CLIP (ViT-B-16-SigLIP2)
- Text-in-image search via OCR (PaddleOCR detection + recognition models)
- Filter by tags, date ranges, and people from the same search screen

### Duplicate detection
- Perceptual hash (pHash) computed for every photo
- Duplicate finder groups visually similar photos by Hamming distance
- In-app duplicate review and bulk delete

### Location & map
- EXIF GPS coordinates extracted on upload
- Offline reverse geocoding (city/state/country) from embedded cities database
- Map view clusters photos by location

### Memories
- Automatically surfaces "on this day" and curated sets

### Video
- Supports MP4, MOV, WebM, AVI, MKV
- Thumbnail generation via ffmpeg at upload time
- Duration and codec metadata stored via ffprobe

### ML pipeline
- Async job queue — face detection, CLIP encoding, OCR, pHash, geocoding run in the background
- Configurable batch size and poll interval
- GPU acceleration: CUDA (NVIDIA), CoreML (macOS/Apple Silicon), ROCm (AMD)
- Models auto-downloaded from HuggingFace on first use and cached locally
- ML settings screen: toggle OCR, tune face score thresholds, select CLIP model, trigger reprocess
- Vector search via HNSW index (USearch) with brute-force SQLite fallback

### Possible future upgrades

- CLIP model: [`nllb-clip-large-siglip__mrl`](https://huggingface.co/immich-app/nllb-clip-large-siglip__mrl) — highest recall on benchmarks; multilingual-optimised (recommended when primary search language is non-English)

## Development

```sh
git clone git@github.com:tinycld/photos.git
npx @tinycld/bootstrap@latest --assemble-only
pnpm install
cd app && pnpm run dev
```

## Checks

```sh
cd photos
pnpm exec tinycld-pkg check    # biome + typecheck
pnpm exec tinycld-pkg test     # vitest unit tests
pnpm exec tinycld-pkg test:e2e # playwright e2e specs
```

## Go server

Server plugin in `server/` (Go module `tinycld.org/packages/photos`). Provides
ML inference, vector search, thumbnailing, EXIF extraction, and geocoding.

### Setting environment variables

The Go server loads env vars from `.env` in its working directory (`app/`) or
from the shell environment. `photos/.env` is NOT picked up automatically — you
must copy the vars to where the Go binary can read them.

**Option 1 — `.env` in `app/` (recommended)**: Copy `photos/.env.example` to
`app/.env` and customize:

```sh
cp photos/.env.example app/.env
```

**Option 2 — inline export**: Export vars before running the dev command:

```sh
MACHINE_LEARNING_ENABLED=1 ONNXRUNTIME_SHARED_LIBRARY_PATH=/opt/homebrew/lib/libonnxruntime.dylib cd app && pnpm run dev
```

### libonnxruntime (ML inference)

ONNX Runtime shared library required for ML features. Set `ONNXRUNTIME_SHARED_LIBRARY_PATH`
pointing to the `.dylib`/`.so`.

**macOS (arm64 / x86_64)**:

```sh
brew install onnxruntime
```

`ONNXRUNTIME_SHARED_LIBRARY_PATH=$(brew --prefix onnxruntime)/lib/libonnxruntime.dylib`

**Linux (x86_64)**:

```sh
curl -L https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-1.21.0.tgz -o /tmp/onnx.tgz
tar xzf /tmp/onnx.tgz -C /tmp
sudo cp /tmp/onnxruntime-linux-x64-1.21.0/lib/libonnxruntime.so* /usr/local/lib/
sudo ldconfig
```

`ONNXRUNTIME_SHARED_LIBRARY_PATH=/usr/local/lib/libonnxruntime.so.1.21.0`

**Linux (arm64)**:

```sh
curl -L https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-arm64-1.21.0.tgz -o /tmp/onnx.tgz
tar xzf /tmp/onnx.tgz -C /tmp
sudo cp /tmp/onnxruntime-linux-arm64-1.21.0/lib/libonnxruntime.so* /usr/local/lib/
sudo ldconfig
```

**Arch Linux**:

```sh
yay -S onnxruntime
```

`ONNXRUNTIME_SHARED_LIBRARY_PATH=/usr/lib/libonnxruntime.so`

Other CPU archs & GPU-enabled builds: [releases](https://github.com/microsoft/onnxruntime/releases).

### usearch (vector search)

Optional HNSW index for faster search at scale. Enable with `USEARCH_INDEX_PATH` env var.

**macOS**:

```sh
wget https://github.com/unum-cloud/USearch/releases/download/v2.25.3/usearch_macos_arm64_2.25.3.zip
unzip usearch_macos_arm64_2.25.3.zip
sudo mv libusearch_c.dylib /usr/local/lib && sudo mv usearch.h /usr/local/include
```

**Linux (x86_64)**:

```sh
wget https://github.com/unum-cloud/USearch/releases/download/v2.25.3/usearch_linux_amd64_2.25.3.deb
sudo dpkg -i usearch_linux_amd64_2.25.3.deb
```

**Linux (arm64)**:

```sh
wget https://github.com/unum-cloud/USearch/releases/download/v2.25.3/usearch_linux_arm64_2.25.3.deb
sudo dpkg -i usearch_linux_arm64_2.25.3.deb
```

**Arch Linux**:

```sh
wget https://github.com/unum-cloud/USearch/releases/download/v2.25.3/usearch_linux_amd64_2.25.3.so -O /usr/local/lib/libusearch_c.so
wget https://github.com/unum-cloud/USearch/raw/v2.25.3/usearch/c/usearch.h -O /usr/local/include/usearch.h
```

Other platforms: [releases](https://github.com/unum-cloud/USearch/releases).

## Package anatomy

- `manifest.ts` — package capabilities
- `tinycld/photos/` — TypeScript surface (screens, collections, hooks, …)
- `server/` — Go server plugin
- `tests/` — vitest unit tests & Playwright e2e specs

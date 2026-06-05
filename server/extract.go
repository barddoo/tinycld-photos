package photos

import (
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

var supportedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

func extractImageMetadata(app *pocketbase.PocketBase, record *core.Record) {
	if !appIsLive(app) {
		return
	}

	filename := record.GetString("file")
	if filename == "" {
		return
	}

	mimeType := record.GetString("mime_type")
	if mimeType == "" {
		ext := strings.ToLower(filepath.Ext(filename))
		mimeType = mimeForExt(ext)
		record.Set("mime_type", mimeType)
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		app.Logger().Warn("extractImageMetadata: failed to open filesystem", "id", record.Id, "error", err)
		return
	}
	defer fsys.Close()

	key := record.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(key)
	if err != nil {
		app.Logger().Warn("extractImageMetadata: failed to read file", "id", record.Id, "key", key, "error", err)
		return
	}
	defer blob.Close()

	tmpFile, err := os.CreateTemp(os.TempDir(), "photo-extract-*"+filepath.Ext(filename))
	if err != nil {
		app.Logger().Warn("extractImageMetadata: failed to create temp file", "id", record.Id, "error", err)
		return
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.ReadFrom(blob); err != nil {
		tmpFile.Close()
		app.Logger().Warn("extractImageMetadata: failed to write temp file", "id", record.Id, "error", err)
		return
	}
	tmpFile.Close()

	if supportedImageTypes[mimeType] {
		f, err := os.Open(tmpPath)
		if err == nil {
			cfg, _, err := image.DecodeConfig(f)
			f.Close()
			if err == nil {
				record.Set("width", cfg.Width)
				record.Set("height", cfg.Height)
			}
		}
	}

	if record.GetDateTime("taken_at").Time().IsZero() {
		record.Set("taken_at", time.Now())
	}

	if !appIsLive(app) {
		return
	}

	fresh, err := app.FindRecordById("photos_items", record.Id)
	if err != nil {
		app.Logger().Warn("extractImageMetadata: failed to re-fetch record", "id", record.Id, "error", err)
		return
	}

	fresh.Set("width", record.GetInt("width"))
	fresh.Set("height", record.GetInt("height"))
	fresh.Set("mime_type", record.GetString("mime_type"))

	if takenAt := record.GetDateTime("taken_at"); !takenAt.Time().IsZero() {
		fresh.Set("taken_at", takenAt.Time())
	}

	if err := app.Save(fresh); err != nil {
		app.Logger().Warn("extractImageMetadata: failed to save metadata", "id", record.Id, "error", err)
	}
}

func appIsLive(app *pocketbase.PocketBase) bool {
	return app != nil && app.ConcurrentDB() != nil
}

func mimeForExt(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	case ".avif":
		return "image/avif"
	case ".tiff", ".tif":
		return "image/tiff"
	default:
		return "application/octet-stream"
	}
}

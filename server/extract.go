package photos

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	_ "golang.org/x/image/webp"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"golang.org/x/image/draw"
)

var supportedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

const maxThumbnailSize = 400

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

	extractExifDate(tmpPath, record)

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

	thumbnailPath, err := generateThumbnail(tmpPath, mimeType)
	if err == nil && thumbnailPath != "" {
		defer os.Remove(thumbnailPath)

		f, ferr := filesystem.NewFileFromPath(thumbnailPath)
		if ferr == nil {
			record.Set("thumbnail", f)
		}
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

	if thumbFile := record.Get("thumbnail"); thumbFile != nil {
		fresh.Set("thumbnail", thumbFile)
	}

	if err := app.Save(fresh); err != nil {
		app.Logger().Warn("extractImageMetadata: failed to save metadata", "id", record.Id, "error", err)
	}
}

func extractExifDate(path string, record *core.Record) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	// Only JPEG EXIF supported
	data := make([]byte, 2)
	if _, err := f.Read(data); err != nil {
		return
	}
	if data[0] != 0xFF || data[1] != 0xD8 {
		return
	}

	// Scan APP1 markers for Exif header
	buf := make([]byte, 65536)
	n, err := f.Read(buf)
	if err != nil {
		return
	}
	buf = buf[:n]

	offset := 0
	for offset+8 < len(buf) {
		if buf[offset] != 0xFF {
			break
		}
		marker := buf[offset+1]
		if marker == 0xE1 {
			size := int(buf[offset+2])<<8 | int(buf[offset+3])
			if offset+2+size > len(buf) {
				break
			}
			exifStart := offset + 4
			if exifStart+6 <= len(buf) && string(buf[exifStart:exifStart+6]) == "Exif\000\000" {
				tiffStart := exifStart + 6
				dt := parseExifDateTimeOriginal(buf[tiffStart:])
				if !dt.IsZero() {
					record.Set("taken_at", dt)
				}
				return
			}
			offset += 2 + size
		} else if marker == 0xE0 || marker == 0xE2 || marker == 0xDB || marker == 0xC4 || marker == 0xC0 || marker == 0xC2 || marker == 0xDA || marker == 0xDD || marker == 0xD9 {
			if offset+4 > len(buf) {
				break
			}
			size := int(buf[offset+2])<<8 | int(buf[offset+3])
			offset += 2 + size
		} else {
			break
		}
	}
}

func parseExifDateTimeOriginal(data []byte) time.Time {
	if len(data) < 8 {
		return time.Time{}
	}

	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return time.Time{}
	}

	if order.Uint16(data[2:4]) != 0x002A {
		return time.Time{}
	}

	ifdOffset := int(order.Uint32(data[4:8]))
	if ifdOffset < 8 || ifdOffset > len(data)-2 {
		return time.Time{}
	}

	numEntries := order.Uint16(data[ifdOffset : ifdOffset+2])
	entriesStart := ifdOffset + 2

	for i := 0; i < int(numEntries); i++ {
		entryOff := entriesStart + i*12
		if entryOff+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entryOff : entryOff+2])

		// Tag 0x8769 = ExifIFDPointer
		if tag == 0x8769 {
			exifOffset := readValueOffset(data, entryOff, order)
			if exifOffset > 0 && exifOffset < len(data) {
				if dt := readExifIfd(data[exifOffset:], order); !dt.IsZero() {
					return dt
				}
			}
		}
	}

	return time.Time{}
}

func readExifIfd(data []byte, order binary.ByteOrder) time.Time {
	if len(data) < 2 {
		return time.Time{}
	}

	numEntries := order.Uint16(data[:2])
	entriesStart := 2

	for i := 0; i < int(numEntries); i++ {
		entryOff := entriesStart + i*12
		if entryOff+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entryOff : entryOff+2])

		// Tag 0x9003 = DateTimeOriginal
		if tag == 0x9003 {
			return readExifDateTime(data, entryOff, order)
		}
	}

	return time.Time{}
}

func readExifDateTime(data []byte, entryOff int, order binary.ByteOrder) time.Time {
	dataType := order.Uint16(data[entryOff+2 : entryOff+4])
	count := order.Uint32(data[entryOff+4 : entryOff+8])

	if dataType != 2 {
		return time.Time{}
	}

	var str string
	if count <= 4 {
		str = string(data[entryOff+8 : entryOff+8+int(count)-1])
	} else {
		offset := int(order.Uint32(data[entryOff+8 : entryOff+12]))
		if offset < 0 || offset+int(count) > len(data) {
			return time.Time{}
		}
		str = string(data[offset : offset+int(count)-1])
	}

	t, err := time.Parse("2006:01:02 15:04:05", str)
	if err != nil {
		return time.Time{}
	}
	return t
}

func readValueOffset(data []byte, entryOff int, order binary.ByteOrder) int {
	return int(order.Uint32(data[entryOff+8 : entryOff+12]))
}

func generateThumbnail(srcPath, mimeType string) (string, error) {
	if !supportedImageTypes[mimeType] {
		return "", nil
	}

	f, err := os.Open(srcPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	srcImg, _, err := image.Decode(f)
	if err != nil {
		return "", err
	}

	bounds := srcImg.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	if w <= 0 || h <= 0 {
		return "", nil
	}

	newW, newH := calcThumbSize(w, h, maxThumbnailSize)
	if newW >= w && newH >= h {
		return "", nil
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), srcImg, srcImg.Bounds(), draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 85}); err != nil {
		return "", err
	}

	thumbFile, err := os.CreateTemp(os.TempDir(), "photo-thumb-*.jpg")
	if err != nil {
		return "", err
	}

	if _, err := thumbFile.Write(buf.Bytes()); err != nil {
		thumbFile.Close()
		os.Remove(thumbFile.Name())
		return "", err
	}
	thumbFile.Close()

	return thumbFile.Name(), nil
}

func calcThumbSize(w, h, max int) (int, int) {
	if w >= h && w > max {
		return max, h * max / w
	}
	if h > w && h > max {
		return w * max / h, max
	}
	return w, h
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

package photos

import (
	"bytes"
	"encoding/binary"
	"fmt"
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
	"github.com/strukturag/libheif/go/heif"
	"golang.org/x/image/draw"
)

var supportedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
	"image/heic": true,
	"image/heif": true,
	"image/avif": true,
	"image/tiff": true,
}

const maxThumbnailSize = 1024

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

	record.Set("type", mediaType(mimeType))

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

	isImage := supportedImageTypes[mimeType]
	isVideo := supportedVideoTypes[mimeType]

	if isImage {
		extractExifDate(tmpPath, record)
		extractExifCamera(tmpPath, record)

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

	if isVideo {
		duration, width, height, _, err := extractVideoMetadata(tmpPath)
		if err == nil {
			if duration > 0 {
				record.Set("duration", duration)
			}
			if width > 0 {
				record.Set("width", width)
				record.Set("height", height)
			}
		}
	}

	if record.GetDateTime("taken_at").Time().IsZero() {
		record.Set("taken_at", time.Now())
	}

	if isImage {
		thumbnailPath, err := generateThumbnail(tmpPath, mimeType)
		if err != nil {
			app.Logger().Debug("extractImageMetadata: thumbnail skipped", "id", record.Id, "mime", mimeType, "error", err)
		} else if thumbnailPath != "" {
			defer os.Remove(thumbnailPath)
			setThumbnail(record, thumbnailPath)
		}
	}

	if isVideo {
		thumbnailPath, err := generateVideoThumbnail(tmpPath)
		if err == nil && thumbnailPath != "" {
			defer os.Remove(thumbnailPath)
			setThumbnail(record, thumbnailPath)
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

	fresh.Set("type", record.GetString("type"))
	fresh.Set("width", record.GetInt("width"))
	fresh.Set("height", record.GetInt("height"))
	fresh.Set("mime_type", record.GetString("mime_type"))

	if cameraMake := record.GetString("camera_make"); cameraMake != "" {
		fresh.Set("camera_make", cameraMake)
	}
	if cameraModel := record.GetString("camera_model"); cameraModel != "" {
		fresh.Set("camera_model", cameraModel)
	}
	if lensModel := record.GetString("lens_model"); lensModel != "" {
		fresh.Set("lens_model", lensModel)
	}
	if iso := record.GetInt("iso"); iso > 0 {
		fresh.Set("iso", iso)
	}
	if aperture := record.GetString("aperture"); aperture != "" {
		fresh.Set("aperture", aperture)
	}
	if focalLength := record.GetString("focal_length"); focalLength != "" {
		fresh.Set("focal_length", focalLength)
	}

	if record.GetInt("duration") > 0 {
		fresh.Set("duration", record.GetInt("duration"))
	}

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

func setThumbnail(record *core.Record, path string) {
	f, err := filesystem.NewFileFromPath(path)
	if err == nil {
		record.Set("thumbnail", f)
	}
}

func mediaType(mime string) string {
	if strings.HasPrefix(mime, "video/") {
		return "video"
	}
	return "image"
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

	if dataType != 2 || count == 0 {
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

func extractExifCamera(path string, record *core.Record) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	data := make([]byte, 2)
	if _, err := f.Read(data); err != nil {
		return
	}
	if data[0] != 0xFF || data[1] != 0xD8 {
		return
	}

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
				parseExifCameraTags(buf[tiffStart:], record)
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

func parseExifCameraTags(data []byte, record *core.Record) {
	if len(data) < 8 {
		return
	}

	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return
	}

	if order.Uint16(data[2:4]) != 0x002A {
		return
	}

	ifdOffset := int(order.Uint32(data[4:8]))
	if ifdOffset < 8 || ifdOffset > len(data)-2 {
		return
	}

	numEntries := order.Uint16(data[ifdOffset : ifdOffset+2])
	entriesStart := ifdOffset + 2

	var exifIfdOffset int
	var gpsIfdOffset int
	_ = gpsIfdOffset

	for i := 0; i < int(numEntries); i++ {
		entryOff := entriesStart + i*12
		if entryOff+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entryOff : entryOff+2])
		switch tag {
		case 0x010F:
			record.Set("camera_make", readExifString(data, entryOff, order))
		case 0x0110:
			record.Set("camera_model", readExifString(data, entryOff, order))
		case 0x8769:
			exifIfdOffset = readValueOffset(data, entryOff, order)
		case 0x8825:
			gpsIfdOffset = readValueOffset(data, entryOff, order)
		}
	}

	if exifIfdOffset > 0 && exifIfdOffset < len(data) {
		parseExifSubIfd(data[exifIfdOffset:], record, order)
	}
}

func parseExifSubIfd(data []byte, record *core.Record, order binary.ByteOrder) {
	if len(data) < 2 {
		return
	}

	numEntries := order.Uint16(data[:2])
	entriesStart := 2

	for i := 0; i < int(numEntries); i++ {
		entryOff := entriesStart + i*12
		if entryOff+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entryOff : entryOff+2])
		switch tag {
		case 0x9202:
			aperture := readExifRational(data, entryOff, order)
			if aperture > 0 {
				record.Set("aperture", fmt.Sprintf("f/%.1f", aperture))
			}
		case 0x8827:
			iso := int(order.Uint16(data[entryOff+8 : entryOff+10]))
			if iso > 0 {
				record.Set("iso", iso)
			}
		case 0x920A:
			focalLength := readExifRational(data, entryOff, order)
			if focalLength > 0 {
				if focalLength >= 100 {
					record.Set("focal_length", fmt.Sprintf("%.0fmm", focalLength))
				} else {
					record.Set("focal_length", fmt.Sprintf("%.1fmm", focalLength))
				}
			}
		case 0x9207:
			record.Set("flash", int(order.Uint16(data[entryOff+8:entryOff+10])) > 0)
		}
	}

	ifd := readExifStringFull(data, 0x9286, order)
	if ifd != "" {
		record.Set("lens_model", ifd)
	}
}

func readExifString(data []byte, entryOff int, order binary.ByteOrder) string {
	dataType := order.Uint16(data[entryOff+2 : entryOff+4])
	count := order.Uint32(data[entryOff+4 : entryOff+8])

	if dataType != 2 || count == 0 {
		return ""
	}

	var str string
	if count <= 4 {
		str = string(data[entryOff+8 : entryOff+8+int(count)-1])
	} else {
		offset := int(order.Uint32(data[entryOff+8 : entryOff+12]))
		if offset < 0 || offset+int(count) > len(data) {
			return ""
		}
		str = string(data[offset : offset+int(count)-1])
	}

	return strings.TrimSpace(str)
}

func readExifStringFull(data []byte, tag uint16, order binary.ByteOrder) string {
	if len(data) < 2 {
		return ""
	}

	numEntries := order.Uint16(data[:2])
	entriesStart := 2

	for i := 0; i < int(numEntries); i++ {
		entryOff := entriesStart + i*12
		if entryOff+12 > len(data) {
			break
		}
		t := order.Uint16(data[entryOff : entryOff+2])
		if t == tag {
			return readExifString(data, entryOff, order)
		}
	}

	return ""
}

func readExifRational(data []byte, entryOff int, order binary.ByteOrder) float64 {
	dataType := order.Uint16(data[entryOff+2 : entryOff+4])

	if dataType == 3 {
		return float64(order.Uint16(data[entryOff+8 : entryOff+10]))
	}

	if dataType != 5 {
		return 0
	}

	offset := int(order.Uint32(data[entryOff+8 : entryOff+12]))
	if offset < 0 || offset+8 > len(data) {
		return 0
	}

	numerator := order.Uint32(data[offset : offset+4])
	denominator := order.Uint32(data[offset+4 : offset+8])

	if denominator == 0 {
		return 0
	}

	return float64(numerator) / float64(denominator)
}

func generateThumbnail(srcPath, mimeType string) (string, error) {
	if !supportedImageTypes[mimeType] {
		return "", nil
	}

	isHEIC := mimeType == "image/heic" || mimeType == "image/heif"
	if isHEIC {
		return generateHEICThumbnail(srcPath)
	}

	if mimeType == "image/avif" || mimeType == "image/tiff" {
		return "", fmt.Errorf("thumbnail not supported for %s — requires external decoder", mimeType)
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
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 92}); err != nil {
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

func generateHEICThumbnail(srcPath string) (string, error) {
	ctx, err := heif.NewContext()
	if err != nil {
		return "", fmt.Errorf("heif new context: %w", err)
	}

	if err := ctx.ReadFromFile(srcPath); err != nil {
		return "", fmt.Errorf("heif read: %w", err)
	}

	handle, err := ctx.GetPrimaryImageHandle()
	if err != nil {
		return "", fmt.Errorf("heif primary handle: %w", err)
	}

	img, err := handle.DecodeImage(heif.ColorspaceUndefined, heif.ChromaUndefined, nil)
	if err != nil {
		return "", fmt.Errorf("heif decode: %w", err)
	}

	srcImg, err := img.GetImage()
	if err != nil {
		return "", fmt.Errorf("heif to go image: %w", err)
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
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 92}); err != nil {
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
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	case ".avi":
		return "video/x-msvideo"
	case ".mkv":
		return "video/x-matroska"
	default:
		return "application/octet-stream"
	}
}

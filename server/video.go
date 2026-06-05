package photos

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	ffmpeg "github.com/u2takey/ffmpeg-go"
)

var supportedVideoTypes = map[string]bool{
	"video/mp4":        true,
	"video/quicktime":  true,
	"video/webm":       true,
	"video/x-msvideo":  true,
	"video/x-matroska": true,
}

type ffprobeOutput struct {
	Streams []ffprobeStream `json:"streams"`
	Format  ffprobeFormat   `json:"format"`
}

type ffprobeStream struct {
	CodecType string `json:"codec_type"`
	CodecName string `json:"codec_name"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

type ffprobeFormat struct {
	Duration string `json:"duration"`
}

func extractVideoMetadata(srcPath string) (duration int, width, height int, codec string, err error) {
	data, err := ffmpeg.Probe(srcPath)
	if err != nil {
		return 0, 0, 0, "", fmt.Errorf("ffprobe failed: %w", err)
	}

	var out ffprobeOutput
	if err := json.Unmarshal([]byte(data), &out); err != nil {
		return 0, 0, 0, "", fmt.Errorf("parse ffprobe output: %w", err)
	}

	if d := out.Format.Duration; d != "" {
		if dur, parseErr := time.ParseDuration(d + "s"); parseErr == nil {
			duration = int(dur.Milliseconds())
		}
	}

	for _, s := range out.Streams {
		if s.CodecType == "video" {
			width = s.Width
			height = s.Height
			codec = s.CodecName
			break
		}
	}

	return
}

func generateVideoThumbnail(srcPath string) (string, error) {
	thumbFile, err := os.CreateTemp(os.TempDir(), "video-thumb-*.jpg")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	thumbPath := thumbFile.Name()
	thumbFile.Close()

	err = ffmpeg.Input(srcPath, ffmpeg.KwArgs{"ss": "1"}).
		Filter("select", ffmpeg.Args{"gte(n,1)"}).
		Output(thumbPath, ffmpeg.KwArgs{
			"vframes": "1",
			"vf":      fmt.Sprintf("scale='min(%d,iw)':min'(%d,ih)':force_original_aspect_ratio=decrease", maxThumbnailSize, maxThumbnailSize),
			"q:v":     "2",
		}).
		OverWriteOutput().
		Run()

	if err != nil {
		os.Remove(thumbPath)
		return "", fmt.Errorf("ffmpeg thumbnail: %w", err)
	}

	info, err := os.Stat(thumbPath)
	if err != nil || info.Size() == 0 {
		os.Remove(thumbPath)
		return "", fmt.Errorf("thumbnail is empty")
	}

	return thumbPath, nil
}

func tryPairLivePhoto(app *pocketbase.PocketBase, record *core.Record) {
	mime := record.GetString("mime_type")
	if mime != "image/heic" && mime != "image/heif" && mime != "video/quicktime" {
		return
	}

	orgId := record.GetString("org")
	if orgId == "" {
		return
	}

	filename := record.GetString("file")
	stem := strings.TrimSuffix(filename, filepath.Ext(filename))
	ext := strings.ToLower(filepath.Ext(filename))

	isHEIC := ext == ".heic" || ext == ".heif"
	var pairMimes []string
	if isHEIC {
		pairMimes = []string{"video/quicktime"}
	} else {
		pairMimes = []string{"image/heic", "image/heif"}
	}

	var records []*core.Record
	for _, mime := range pairMimes {
		recs, err := app.FindRecordsByFilter(
			"photos_items",
			"org = {:org} && file ~ {:stem} && mime_type = {:mime}",
			"-created",
			0,
			1,
			dbx.Params{"org": orgId, "stem": stem + "%", "mime": mime},
		)
		if err == nil && len(recs) > 0 {
			records = recs
			break
		}
	}
	if len(records) == 0 {
		return
	}

	partner := records[0]
	record.Set("live_photo_pair_id", partner.Id)
	if err := app.Save(record); err != nil {
		app.Logger().Warn("tryPairLivePhoto: failed to save pair on source", "id", record.Id, "pair", partner.Id, "error", err)
		return
	}

	partner.Set("live_photo_pair_id", record.Id)
	if err := app.Save(partner); err != nil {
		app.Logger().Warn("tryPairLivePhoto: failed to save pair on partner", "id", partner.Id, "pair", record.Id, "error", err)
	}
}

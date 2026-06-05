package photos

import (
	"bytes"
	"fmt"
	"image"
	"io"

	"github.com/corona10/goimagehash"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type DuplicateGroup struct {
	Photos   []string
	Distance int
}

func ComputePHash(imgData []byte) (string, error) {
	img, _, err := image.Decode(bytes.NewReader(imgData))
	if err != nil {
		return "", fmt.Errorf("decode: %w", err)
	}

	hash, err := goimagehash.PerceptionHash(img)
	if err != nil {
		return "", fmt.Errorf("perception hash: %w", err)
	}

	return hash.ToString(), nil
}

func FindDuplicates(app *pocketbase.PocketBase, threshold int) ([]DuplicateGroup, error) {
	const batchLimit = 5000
	records, err := app.FindRecordsByFilter(
		"photos_items",
		"perceptual_hash != null && perceptual_hash != ''",
		"",
		batchLimit, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}

	type photoHash struct {
		id   string
		hash *goimagehash.ImageHash
	}

	var hashes []photoHash
	for _, r := range records {
		hashStr := r.GetString("perceptual_hash")
		if hashStr == "" {
			continue
		}
		hash, _ := goimagehash.ImageHashFromString(hashStr)
		if hash == nil {
			continue
		}
		hashes = append(hashes, photoHash{r.Id, hash})
	}

	visited := make(map[string]bool)
	var groups []DuplicateGroup

	for i := range hashes {
		if visited[hashes[i].id] {
			continue
		}

		group := DuplicateGroup{
			Photos: []string{hashes[i].id},
		}
		visited[hashes[i].id] = true

		for j := i + 1; j < len(hashes); j++ {
			if visited[hashes[j].id] {
				continue
			}
			dist, err := hashes[i].hash.Distance(hashes[j].hash)
			if err != nil {
				continue
			}
			if dist <= threshold {
				group.Photos = append(group.Photos, hashes[j].id)
				visited[hashes[j].id] = true
				group.Distance = dist
			}
		}

		if len(group.Photos) > 1 {
			groups = append(groups, group)
		}
	}

	return groups, nil
}

func ComputeAndStorePHash(app *pocketbase.PocketBase, photo *core.Record) error {
	fsys, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fsys.Close()

	file := photo.GetString("file")
	if file == "" {
		return fmt.Errorf("no file")
	}

	path := photo.BaseFilesPath() + "/" + file
	reader, err := fsys.GetReader(path)
	if err != nil {
		return err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return fmt.Errorf("read: %w", err)
	}

	hash, err := ComputePHash(data)
	if err != nil {
		return err
	}

	photo.Set("perceptual_hash", hash)
	return app.Save(photo)
}

package photos

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"strconv"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type faceWithEmb struct {
	record *core.Record
	emb    []float32
}

type personCluster struct {
	id         string
	embeddings [][]float32
}

func envFloat(key string, defaultVal float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return defaultVal
}

func envInt(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return defaultVal
}

func ClusterFaces(ctx context.Context, app *pocketbase.PocketBase, faceRecords []*core.Record) error {
	cfg := loadMLSettings(app)
	if len(faceRecords) == 0 {
		return nil
	}

	var faces []faceWithEmb
	for _, r := range faceRecords {
		if !r.GetBool("is_visible") {
			continue
		}
		embStr := r.GetString("embedding")
		if embStr == "" {
			continue
		}
		var emb []float32
		if err := json.Unmarshal([]byte(embStr), &emb); err != nil {
			continue
		}
		faces = append(faces, faceWithEmb{record: r, emb: emb})
	}

	peopleRecords, _ := app.FindRecordsByFilter("photos_people", "", "", 0, 0)

	faceRecordsAll, _ := app.FindRecordsByFilter("photos_faces", "person != '' && is_visible = true", "", 0, 0)

	personEmbMap := make(map[string][][]float32)
	for _, f := range faceRecordsAll {
		pid := f.GetString("person")
		if pid == "" {
			continue
		}
		embStr := f.GetString("embedding")
		if embStr == "" {
			continue
		}
		var emb []float32
		if err := json.Unmarshal([]byte(embStr), &emb); err != nil {
			continue
		}
		personEmbMap[pid] = append(personEmbMap[pid], emb)
	}

	var people []personCluster
	for _, p := range peopleRecords {
		pc := personCluster{id: p.Id}
		if embs, ok := personEmbMap[p.Id]; ok {
			pc.embeddings = embs
		}
		people = append(people, pc)
	}

	for i := range faces {
		if faces[i].record.GetString("person") != "" {
			continue
		}

		var bestPerson string
		var bestDist float64 = math.MaxFloat64

		for _, person := range people {
			minDist := math.MaxFloat64
			for _, pemb := range person.embeddings {
				d := cosineDist(faces[i].emb, pemb)
				if d < minDist {
					minDist = d
				}
			}
			if minDist < bestDist && minDist < cfg.MaxFaceDist {
				bestDist = minDist
				bestPerson = person.id
			}
		}

		if bestPerson != "" {
			faces[i].record.Set("person", bestPerson)
			app.Save(faces[i].record)
			for j := range people {
				if people[j].id == bestPerson {
					people[j].embeddings = append(people[j].embeddings, faces[i].emb)
					break
				}
			}
		}
	}

	return nil
}

func cosineDist(a, b []float32) float64 {
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 1
	}
	return 1 - (dot / (math.Sqrt(normA) * math.Sqrt(normB)))
}

func meanEmbedding(embs [][]float32) []float32 {
	if len(embs) == 0 {
		return nil
	}
	n := len(embs[0])
	mean := make([]float32, n)
	for _, e := range embs {
		for i, v := range e {
			mean[i] += v
		}
	}
	count := float32(len(embs))
	for i := range mean {
		mean[i] /= count
	}
	return mean
}

// ReclusterAndMergePeople re-assigns unassigned faces for orgID, then auto-merges
// person clusters whose centroids are within the configured MaxFaceDist threshold.
// Returns counts of faces assigned and clusters merged.
func ReclusterAndMergePeople(ctx context.Context, app *pocketbase.PocketBase, orgID string) (assigned int, merged int, err error) {
	cfg := loadMLSettings(app)

	// Step 1: assign unassigned faces for this org.
	unassigned, ferr := app.FindRecordsByFilter(
		"photos_faces",
		"person = '' && is_visible = true && org = {:org}",
		"", 0, 0,
		dbx.Params{"org": orgID},
	)
	if ferr != nil {
		return 0, 0, ferr
	}
	if len(unassigned) > 0 {
		if cerr := ClusterFaces(ctx, app, unassigned); cerr != nil {
			return 0, 0, cerr
		}
		assigned = len(unassigned)
	}

	// Step 2: load all people + their embeddings for this org.
	peopleRecords, _ := app.FindRecordsByFilter(
		"photos_people", "org = {:org}", "", 0, 0, dbx.Params{"org": orgID},
	)
	faceRecordsAll, _ := app.FindRecordsByFilter(
		"photos_faces",
		"person != '' && is_visible = true && org = {:org}",
		"", 0, 0,
		dbx.Params{"org": orgID},
	)

	personEmbMap := make(map[string][][]float32)
	for _, f := range faceRecordsAll {
		pid := f.GetString("person")
		embStr := f.GetString("embedding")
		if pid == "" || embStr == "" {
			continue
		}
		var emb []float32
		if json.Unmarshal([]byte(embStr), &emb) != nil {
			continue
		}
		personEmbMap[pid] = append(personEmbMap[pid], emb)
	}

	type centroidEntry struct {
		id       string
		centroid []float32
		count    int
	}

	var centroids []centroidEntry
	for _, p := range peopleRecords {
		embs := personEmbMap[p.Id]
		if len(embs) == 0 {
			continue
		}
		centroids = append(centroids, centroidEntry{
			id:       p.Id,
			centroid: meanEmbedding(embs),
			count:    len(embs),
		})
	}

	// Step 3: greedy pairwise centroid merge.
	absorbed := make(map[string]bool)
	for i := 0; i < len(centroids); i++ {
		if absorbed[centroids[i].id] {
			continue
		}
		for j := i + 1; j < len(centroids); j++ {
			if absorbed[centroids[j].id] {
				continue
			}
			d := cosineDist(centroids[i].centroid, centroids[j].centroid)
			if d >= cfg.MaxFaceDist {
				continue
			}
			// Keep the cluster with more faces as target.
			target, source := centroids[i].id, centroids[j].id
			if centroids[j].count > centroids[i].count {
				target, source = centroids[j].id, centroids[i].id
				// Update i's id so subsequent pairs merge into the right target.
				centroids[i].id = target
				centroids[i].count += centroids[j].count
			} else {
				centroids[i].count += centroids[j].count
			}
			if merr := MergePeople(ctx, app, source, target); merr == nil {
				absorbed[source] = true
				merged++
			}
		}
	}

	return assigned, merged, nil
}

func MergePeople(ctx context.Context, app *pocketbase.PocketBase, sourcePersonID, targetPersonID string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		faces, err := txApp.FindRecordsByFilter(
			"photos_faces",
			"person = {:pid}",
			"",
			0, 0,
			dbx.Params{"pid": sourcePersonID},
		)
		if err != nil {
			return err
		}

		for _, f := range faces {
			f.Set("person", targetPersonID)
			if err := txApp.Save(f); err != nil {
				return err
			}
		}

		source, err := txApp.FindRecordById("photos_people", sourcePersonID)
		if err != nil {
			return err
		}
		return txApp.Delete(source)
	})
}

func SplitPerson(ctx context.Context, app *pocketbase.PocketBase, personID string, faceIDs []string, newName string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId("photos_people")
		if err != nil {
			return err
		}

		newPerson := core.NewRecord(collection)
		newPerson.Set("name", newName)
		newPerson.Set("is_hidden", false)
		if err := txApp.Save(newPerson); err != nil {
			return err
		}

		for _, fid := range faceIDs {
			face, err := txApp.FindRecordById("photos_faces", fid)
			if err != nil {
				continue
			}
			face.Set("person", newPerson.Id)
			if err := txApp.Save(face); err != nil {
				return err
			}
		}

		return nil
	})
}

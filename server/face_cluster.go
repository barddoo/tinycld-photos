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

type FaceClusterConfig struct {
	MinScore    float64
	MaxDistance float64
	MinFaces    int
}

type faceWithEmb struct {
	record *core.Record
	emb    []float32
}

type personCluster struct {
	id         string
	embeddings [][]float32
}

func defaultFaceClusterConfig() FaceClusterConfig {
	return FaceClusterConfig{
		MinScore:    envFloat("MACHINE_LEARNING_FACIAL_RECOGNITION_MIN_SCORE", 0.7),
		MaxDistance: envFloat("MACHINE_LEARNING_FACIAL_RECOGNITION_MAX_DISTANCE", 0.5),
		MinFaces:    envInt("MACHINE_LEARNING_FACIAL_RECOGNITION_MIN_FACES", 3),
	}
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
	cfg := defaultFaceClusterConfig()
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
			if minDist < bestDist && minDist < cfg.MaxDistance {
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

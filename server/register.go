package photos

import (
	"os"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"

	"tinycld.org/core/audit"
	"tinycld.org/core/userorg"
)

func Register(app *pocketbase.PocketBase) {
	userorg.RegisterReassignable(userorg.ReassignableRef{
		Collection: "photos_items",
		Field:      "owner",
	})
	userorg.RegisterReassignable(userorg.ReassignableRef{
		Collection: "photos_albums",
		Field:      "owner",
	})

	audit.RegisterCollection(app, "photos_items", &audit.CollectionConfig{
		ExtractLabel: audit.LabelFromField("name"),
	})
	audit.RegisterCollection(app, "photos_albums", &audit.CollectionConfig{
		ExtractLabel: audit.LabelFromField("name"),
		ResolveOrg: func(a core.App, record *core.Record) string {
			albumID := record.GetString("album")
			if albumID == "" {
				return ""
			}
			return audit.ResolveViaRelation(a, "photos_albums", albumID, "org")
		},
	})

	routine.FireAndForget(func() {
		defer func() {
			if r := recover(); r != nil {
				app.Logger().Error("ML engine panic", "error", r)
			}
		}()

		libPath := os.Getenv("ONNXRUNTIME_SHARED_LIBRARY_PATH")
		if libPath == "" {
			libPath = "libonnxruntime.so"
		}
		cacheDir := os.Getenv("MACHINE_LEARNING_CACHE_FOLDER")
		if cacheDir == "" {
			cacheDir = "/tmp/ml_models"
		}

		if os.Getenv("MACHINE_LEARNING_ENABLED") == "" {
			return
		}

		mm := NewModelManager(cacheDir, 5*time.Minute)
		if err := mm.EnsureModels(); err != nil {
			app.Logger().Warn("ML model download failed", "error", err)
			if _, err := os.Stat(mm.ModelPath(TaskFaceDetection)); os.IsNotExist(err) {
				return
			}
		}

		engine := NewInferenceEngine(libPath, cacheDir)
		if err := engine.Init(); err != nil {
			app.Logger().Warn("ML engine init failed", "error", err)
			return
		}

		tasks := []ModelTask{
			TaskFaceDetection,
			TaskFaceRecognition,
			TaskCLIPVisual,
			TaskCLIPTextual,
			TaskOCRDetection,
			TaskOCRRecognition,
		}
		for _, task := range tasks {
			modelPath := mm.ModelPath(task)
			if modelPath == "" {
				continue
			}
			if err := engine.LoadModel(task, modelPath); err != nil {
				app.Logger().Warn("ML model load failed", "task", task, "error", err)
			}
		}

		q := NewJobQueue(app, engine)
		q.Start()
		mlQueue.Store(q)

		app.Logger().Info("ML engine initialized")
	})

	routine.FireAndForget(func() {
		if err := InitGeoCodeIndexFrom(""); err != nil {
			app.Logger().Warn("geocode index init failed", "error", err)
		} else {
			app.Logger().Info("geocode index loaded")
		}
	})

	routine.FireAndForget(func() {
		searcher := NewVectorSearcher(app)
		SetVectorSearcher(searcher)
		app.Logger().Info("vector searcher initialized")
	})

	RegisterMLAPI(app)

	app.OnRecordCreate("photos_items").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("ml_status") == "" {
			e.Record.Set("ml_status", "pending")
		}
		if e.Record.GetString("type") == "" {
			e.Record.Set("type", "image")
		}

		if err := e.Next(); err != nil {
			return err
		}

		routine.FireAndForget(func() {
			extractImageMetadata(app, e.Record)
			tryPairLivePhoto(app, e.Record)

			if q := mlQueue.Load(); q != nil {
				cfg := loadMLSettings(app)

				jobs := []JobType{JobComputePHash, JobDetectFaces, JobEncodeCLIP}
				if cfg.OCREnabled {
					jobs = append(jobs, JobRunOCR)
				}

				for _, jt := range jobs {
					if err := q.Enqueue(e.Record.Id, jt); err != nil {
						app.Logger().Error("failed to enqueue ML job", "photo", e.Record.Id, "job", jt, "error", err)
					}
				}

				fresh, _ := app.FindRecordById("photos_items", e.Record.Id)
				if fresh != nil {
					lat := fresh.GetFloat("latitude")
					lon := fresh.GetFloat("longitude")
					if lat != 0 || lon != 0 {
						if err := q.Enqueue(e.Record.Id, JobReverseGeocode); err != nil {
							app.Logger().Error("failed to enqueue geocode job", "photo", e.Record.Id, "error", err)
						}
					}
				}
			}
		})

		return nil
	})

	app.OnRecordAfterUpdateSuccess("photos_items").BindFunc(func(e *core.RecordEvent) error {
		oldFile := e.Record.Original().GetString("file")
		newFile := e.Record.GetString("file")
		if oldFile == newFile {
			return nil
		}

		routine.FireAndForget(func() {
			extractImageMetadata(app, e.Record)

			if q := mlQueue.Load(); q != nil {
				cfg := loadMLSettings(app)

				jobs := []JobType{JobComputePHash, JobDetectFaces, JobEncodeCLIP}
				if cfg.OCREnabled {
					jobs = append(jobs, JobRunOCR)
				}

				for _, jt := range jobs {
					if err := q.Enqueue(e.Record.Id, jt); err != nil {
						app.Logger().Error("failed to enqueue ML job", "photo", e.Record.Id, "job", jt, "error", err)
					}
				}

				fresh, _ := app.FindRecordById("photos_items", e.Record.Id)
				if fresh != nil {
					lat := fresh.GetFloat("latitude")
					lon := fresh.GetFloat("longitude")
					if lat != 0 || lon != 0 {
						if err := q.Enqueue(e.Record.Id, JobReverseGeocode); err != nil {
							app.Logger().Error("failed to enqueue geocode job", "photo", e.Record.Id, "error", err)
						}
					}
				}
			}
		})

		return nil
	})

	app.OnRecordAfterDeleteSuccess("photos_items").BindFunc(func(e *core.RecordEvent) error {
		return nil
	})
}

package photos

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterMLAPI(app *pocketbase.PocketBase) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/photos/ml/status", func(re *core.RequestEvent) error {
			return handleMLStatus(app, re)
		})
		e.Router.POST("/api/photos/ml/reprocess", func(re *core.RequestEvent) error {
			return handleReprocess(app, re)
		})
		e.Router.POST("/api/photos/ml/settings", func(re *core.RequestEvent) error {
			return handleMLSettings(app, re)
		})
		e.Router.GET("/api/photos/ml/duplicates", func(re *core.RequestEvent) error {
			return handleDuplicates(app, re)
		})
		e.Router.POST("/api/photos/ml/search", func(re *core.RequestEvent) error {
			return handleSemanticSearch(app, re)
		})
		e.Router.POST("/api/photos/people/merge", func(re *core.RequestEvent) error {
			return handleMergePeople(app, re)
		})
		e.Router.POST("/api/photos/people/recluster", func(re *core.RequestEvent) error {
			return handleRecluster(app, re)
		})
		return e.Next()
	})
}

type MLSettings struct {
	ClipModelName    string  `json:"clip_model_name"`
	FaceModelName    string  `json:"face_model_name"`
	OCREnabled       bool    `json:"ocr_enabled"`
	MinFaceScore     float64 `json:"min_face_score"`
	MaxFaceDist      float64 `json:"max_face_distance"`
	MinFaces         int     `json:"min_faces"`
	PollIntervalSecs int     `json:"poll_interval_secs"`
	BatchSize        int     `json:"batch_size"`
}

func loadMLSettings(app *pocketbase.PocketBase) MLSettings {
	records, _ := app.FindRecordsByFilter("photos_ml_state", "", "", 1, 0)
	if len(records) == 0 {
		return MLSettings{
			OCREnabled:       true,
			MinFaceScore:     0.7,
			MaxFaceDist:      0.6,
			MinFaces:         3,
			PollIntervalSecs: 30,
			BatchSize:        8,
		}
	}
	s := records[0]
	return MLSettings{
		ClipModelName:    s.GetString("clip_model_name"),
		FaceModelName:    s.GetString("face_model_name"),
		OCREnabled:       s.GetBool("ocr_enabled"),
		MinFaceScore:     s.GetFloat("min_face_score"),
		MaxFaceDist:      s.GetFloat("max_face_distance"),
		MinFaces:         int(s.GetFloat("min_faces")),
		PollIntervalSecs: int(s.GetFloat("poll_interval_secs")),
		BatchSize:        int(s.GetFloat("batch_size")),
	}
}

func handleMLStatus(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	cfg := loadMLSettings(app)

	status := map[string]interface{}{
		"engine_available": false,
		"gpu_provider":     "",
		"geocode_ready":    globalGeoIndex.ready,
		"jobs":             map[string]int{},
		"settings":         map[string]interface{}{},
	}
	if q := mlQueue.Load(); q != nil && q.engine != nil {
		status["engine_available"] = q.engine.IsAvailable()
		status["gpu_provider"] = q.engine.GPUProvider()
		status["clip_textual_loaded"] = q.engine.HasClipTextual()
		status["tokenizer_loaded"] = q.engine.HasTokenizer()
	}

	records, _ := app.FindRecordsByFilter("photos_job_queue", "", "", 0, 0)
	jobCounts := map[string]int{
		"pending":    0,
		"processing": 0,
		"done":       0,
		"failed":     0,
	}
	for _, r := range records {
		s := r.GetString("status")
		jobCounts[s]++
	}
	status["jobs"] = jobCounts

	stateRecords, _ := app.FindRecordsByFilter("photos_ml_state", "", "", 1, 0)
	settings := map[string]interface{}{
		"ocr_enabled":        cfg.OCREnabled,
		"min_face_score":     cfg.MinFaceScore,
		"max_face_distance":  cfg.MaxFaceDist,
		"min_faces":          cfg.MinFaces,
		"poll_interval_secs": cfg.PollIntervalSecs,
		"batch_size":         cfg.BatchSize,
	}

	if indexPath := os.Getenv("USEARCH_INDEX_PATH"); indexPath != "" {
		settings["usearch_index"] = indexPath
	}

	if len(stateRecords) > 0 {
		s := stateRecords[0]
		settings["face_model_name"] = s.GetString("face_model_name")
		settings["last_face_detection"] = s.GetString("last_face_detection")
		settings["last_face_recognition"] = s.GetString("last_face_recognition")
		settings["last_clip_encode"] = s.GetString("last_clip_encode")
		settings["last_ocr_run"] = s.GetString("last_ocr_run")
	}
	status["settings"] = settings

	return re.JSON(http.StatusOK, status)
}

func handleReprocess(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	var body struct {
		JobTypes []string `json:"job_types"`
		Status   string   `json:"status"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		body.Status = "pending"
		body.JobTypes = []string{"detect_faces", "encode_clip", "run_ocr", "compute_phash", "reverse_geocode"}
	}

	var filter string
	if body.Status == "" {
		body.Status = "pending"
	}
	if body.Status == "all" {
		// Empty filters can return no photo records for this collection; match all known ML states explicitly.
		filter = "ml_status = 'pending' || ml_status = 'failed' || ml_status = 'processing' || ml_status = 'done' || ml_status = ''"
	} else if body.Status == "failed" {
		filter = "ml_status = 'failed'"
	} else if body.Status == "pending" {
		filter = "ml_status = 'pending' || ml_status = 'failed'"
	} else {
		filter = fmt.Sprintf("ml_status = '%s'", body.Status)
	}

	photos, err := app.FindRecordsByFilter("photos_items", filter, "", 0, 0)
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	jobTypeMap := map[string]JobType{
		"detect_faces":    JobDetectFaces,
		"encode_clip":     JobEncodeCLIP,
		"run_ocr":         JobRunOCR,
		"compute_phash":   JobComputePHash,
		"reverse_geocode": JobReverseGeocode,
		"recognize_faces": JobBoostFaces,
	}

	enqueued := 0
	for _, photo := range photos {
		for _, jt := range body.JobTypes {
			if jobType, ok := jobTypeMap[jt]; ok {
				if err := enqueueJobDirect(app, photo.Id, jobType); err == nil {
					enqueued++
				}
			}
		}
	}

	return re.JSON(http.StatusOK, map[string]interface{}{
		"enqueued": enqueued,
		"photos":   len(photos),
	})
}

func handleMLSettings(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	var body map[string]interface{}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	col, err := app.FindCollectionByNameOrId("photos_ml_state")
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	records, _ := app.FindRecordsByFilter("photos_ml_state", "", "", 1, 0)
	var record *core.Record
	if len(records) > 0 {
		record = records[0]
	} else {
		record = core.NewRecord(col)
	}

	if v, ok := body["face_model_name"]; ok {
		record.Set("face_model_name", v)
	}
	if v, ok := body["clip_model_name"]; ok {
		record.Set("clip_model_name", v)
	}
	if v, ok := body["ocr_enabled"]; ok {
		record.Set("ocr_enabled", v)
	}
	if v, ok := body["min_face_score"]; ok {
		record.Set("min_face_score", v)
	}
	if v, ok := body["max_face_distance"]; ok {
		record.Set("max_face_distance", v)
	}
	if v, ok := body["min_faces"]; ok {
		record.Set("min_faces", v)
	}
	if v, ok := body["poll_interval_secs"]; ok {
		record.Set("poll_interval_secs", v)
	}
	if v, ok := body["batch_size"]; ok {
		record.Set("batch_size", v)
	}

	if err := app.Save(record); err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return re.JSON(http.StatusOK, map[string]interface{}{"saved": true})
}

func handleDuplicates(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	threshold := 5
	groups, err := FindDuplicates(app, threshold)
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return re.JSON(http.StatusOK, map[string]interface{}{
		"groups": groups,
		"count":  len(groups),
	})
}

func handleSemanticSearch(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	var body struct {
		Query string `json:"query"`
		TopK  int    `json:"topK"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	if body.Query == "" {
		return re.JSON(http.StatusOK, map[string]interface{}{"results": []interface{}{}})
	}
	if body.TopK <= 0 {
		body.TopK = 20
	}

	q := mlQueue.Load()
	if q == nil || q.engine == nil {
		return re.JSON(http.StatusOK, map[string]interface{}{
			"results": []interface{}{},
			"debug":   "ml engine not loaded",
		})
	}
	if !q.engine.HasClipTextual() {
		return re.JSON(http.StatusOK, map[string]interface{}{
			"results": []interface{}{},
			"debug":   "clip textual model not loaded",
		})
	}

	embeddings, err := q.engine.EncodeClipText([]string{body.Query})
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if len(embeddings) == 0 {
		return re.JSON(http.StatusOK, map[string]interface{}{
			"results": []interface{}{},
			"debug":   "text encoding returned empty",
		})
	}

	searcher := GetVectorSearcher()
	if searcher == nil {
		return re.JSON(http.StatusOK, map[string]interface{}{
			"results": []interface{}{},
			"debug":   "vector searcher not initialized",
		})
	}

	results, err := searcher.Search(re.Request.Context(), embeddings[0], body.TopK)
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	out := make([]map[string]interface{}, 0, len(results))
	for _, r := range results {
		out = append(out, map[string]interface{}{
			"id":    r.PhotoID,
			"score": r.Score,
		})
	}

	indexedCount := 0
	if rows, err := app.FindRecordsByFilter(
		"photos_items",
		"smart_search_vector != null && smart_search_vector != ''",
		"", 1000, 0,
	); err == nil {
		indexedCount = len(rows)
	}

	debugInfo := map[string]interface{}{
		"tokenizer_loaded": q.engine.HasTokenizer(),
		"results_found":    len(results),
		"indexed_photos":   indexedCount,
	}

	return re.JSON(http.StatusOK, map[string]interface{}{"results": out, "debug": debugInfo})
}

func handleMergePeople(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Authentication required", nil)
	}

	var body struct {
		SourceID string `json:"source_id"`
		TargetID string `json:"target_id"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if body.SourceID == "" || body.TargetID == "" {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "source_id and target_id required"})
	}

	callerOrg, err := getUserOrgID(app, re.Auth.Id)
	if err != nil || callerOrg == "" {
		return re.ForbiddenError("Not authorized", nil)
	}

	source, err := app.FindRecordById("photos_people", body.SourceID)
	if err != nil || source.GetString("org") != callerOrg {
		return re.ForbiddenError("Not authorized", nil)
	}
	target, err := app.FindRecordById("photos_people", body.TargetID)
	if err != nil || target.GetString("org") != callerOrg {
		return re.ForbiddenError("Not authorized", nil)
	}

	if err := MergePeople(re.Request.Context(), app, body.SourceID, body.TargetID); err != nil {
		app.Logger().Error("merge people failed", "source", body.SourceID, "target", body.TargetID, "error", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": "merge failed"})
	}
	return re.JSON(http.StatusOK, map[string]string{"status": "merged"})
}

func handleRecluster(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Authentication required", nil)
	}
	orgID, err := getUserOrgID(app, re.Auth.Id)
	if err != nil || orgID == "" {
		return re.ForbiddenError("Not authorized", nil)
	}

	assigned, merged, err := ReclusterAndMergePeople(re.Request.Context(), app, orgID)
	if err != nil {
		app.Logger().Error("recluster failed", "org", orgID, "error", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": "recluster failed"})
	}
	return re.JSON(http.StatusOK, map[string]interface{}{
		"assigned": assigned,
		"merged":   merged,
	})
}

func enqueueJobDirect(app *pocketbase.PocketBase, photoID string, jobType JobType) error {
	collection, err := app.FindCollectionByNameOrId("photos_job_queue")
	if err != nil {
		return fmt.Errorf("find collection: %w", err)
	}

	record := core.NewRecord(collection)
	record.Set("photo", photoID)
	record.Set("job_type", string(jobType))
	record.Set("status", string(JobPending))
	record.Set("attempts", 0)

	return app.Save(record)
}

func getUserOrgID(app *pocketbase.PocketBase, userID string) (string, error) {
	records, err := app.FindRecordsByFilter(
		"user_org",
		"user = {:user}",
		"", 1, 0,
		map[string]any{"user": userID},
	)
	if err != nil || len(records) == 0 {
		return "", fmt.Errorf("no org membership found")
	}
	return records[0].GetString("org"), nil
}

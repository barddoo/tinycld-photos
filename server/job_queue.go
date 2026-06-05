package photos

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

type JobType string

const (
	JobDetectFaces    JobType = "detect_faces"
	JobEncodeCLIP     JobType = "encode_clip"
	JobRunOCR         JobType = "run_ocr"
	JobComputePHash   JobType = "compute_phash"
	JobReverseGeocode JobType = "reverse_geocode"
	JobBoostFaces     JobType = "recognize_faces"
)

type JobStatus string

const (
	JobPending    JobStatus = "pending"
	JobProcessing JobStatus = "processing"
	JobDone       JobStatus = "done"
	JobFailed     JobStatus = "failed"
)

type JobQueue struct {
	app       *pocketbase.PocketBase
	engine    *InferenceEngine
	stopCh    chan struct{}
	batchSize int
	flushInt  time.Duration
	nodeID    string

	mu           sync.Mutex
	collector    map[string]*jobEntry
	collectTimer *time.Timer
}

type jobEntry struct {
	PhotoID   string
	JobType   JobType
	ImageData []byte
}

func NewJobQueue(app *pocketbase.PocketBase, engine *InferenceEngine) *JobQueue {
	return &JobQueue{
		app:       app,
		engine:    engine,
		stopCh:    make(chan struct{}),
		batchSize: 8,
		flushInt:  2 * time.Second,
		collector: make(map[string]*jobEntry),
		nodeID:    uuid.New().String()[:8],
	}
}

func (q *JobQueue) Start() {
	go q.reconcile()
	go q.workerLoop()
}

func (q *JobQueue) Stop() {
	close(q.stopCh)
}

func (q *JobQueue) Enqueue(photoID string, jobType JobType) error {
	collection, err := q.app.FindCollectionByNameOrId("photos_job_queue")
	if err != nil {
		return fmt.Errorf("find collection: %w", err)
	}

	record := core.NewRecord(collection)
	record.Set("photo", photoID)
	record.Set("job_type", string(jobType))
	record.Set("status", string(JobPending))
	record.Set("attempts", 0)

	return q.app.Save(record)
}

func (q *JobQueue) reconcile() {
	records, _ := q.app.FindRecordsByFilter(
		"photos_job_queue",
		"status = 'processing'",
		"",
		0, 0,
	)
	for _, r := range records {
		r.Set("status", string(JobPending))
		r.Set("node_id", "")
		q.app.Save(r)
	}

	records, _ = q.app.FindRecordsByFilter(
		"photos_job_queue",
		"status = 'failed' && attempts < 3",
		"",
		0, 0,
	)
	for _, r := range records {
		r.Set("status", string(JobPending))
		r.Set("scheduled_at", types.NowDateTime().Add(time.Minute))
		q.app.Save(r)
	}
}

func (q *JobQueue) workerLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-q.stopCh:
			return
		case <-ticker.C:
			q.processBatch()
		}
	}
}

func (q *JobQueue) processBatch() {
	records, err := q.app.FindRecordsByFilter(
		"photos_job_queue",
		"status = 'pending' && (scheduled_at = '' || scheduled_at <= @now)",
		"created_at",
		q.batchSize, 0,
	)
	if err != nil || len(records) == 0 {
		return
	}

	for _, r := range records {
		r.Set("status", string(JobProcessing))
		r.Set("node_id", q.nodeID)
		q.app.Save(r)
	}

	byType := make(map[JobType][]*core.Record)
	for _, r := range records {
		jt := JobType(r.GetString("job_type"))
		byType[jt] = append(byType[jt], r)
	}

	for jobType, jobs := range byType {
		q.processJobType(jobType, jobs)
	}
}

func (q *JobQueue) processJobType(jobType JobType, jobs []*core.Record) {
	var err error
	switch jobType {
	case JobDetectFaces:
		err = q.processDetectFaces(jobs)
	case JobEncodeCLIP:
		err = q.processEncodeCLIP(jobs)
	case JobComputePHash:
		err = nil
	case JobReverseGeocode:
		err = nil
	default:
		err = fmt.Errorf("unknown job type: %s", jobType)
	}

	if err != nil {
		for _, r := range jobs {
			q.markFailed(r, err)
		}
	} else {
		for _, r := range jobs {
			q.markDone(r)
		}
	}
}

func (q *JobQueue) loadPhotos(jobs []*core.Record) []*core.Record {
	photos := make([]*core.Record, 0, len(jobs))
	for _, r := range jobs {
		photoID := r.GetString("photo")
		photo, err := q.app.FindRecordById("photos_items", photoID)
		if err != nil {
			continue
		}
		photos = append(photos, photo)
	}
	return photos
}

func (q *JobQueue) processDetectFaces(jobs []*core.Record) error {
	if !q.engine.IsAvailable() {
		q.app.Logger().Warn("face detect: engine not available, skipping batch", "count", len(jobs))
		return nil
	}

	photos := q.loadPhotos(jobs)
	for _, photo := range photos {
		if photo.GetString("file") == "" {
			continue
		}

		imageData, err := q.readPhotoFile(photo)
		if err != nil {
			q.app.Logger().Warn("face detect: read file failed", "photo", photo.Id, "error", err)
			continue
		}

		results, err := q.engine.DetectFaces([][]byte{imageData})
		if err != nil {
			q.app.Logger().Warn("face detect: inference failed", "photo", photo.Id, "error", err)
			continue
		}
		if len(results) == 0 {
			q.app.Logger().Info("face detect: no results", "photo", photo.Id)
			continue
		}

		deduped := nms(results[0], 0.4)
		q.app.Logger().Info("face detect: done", "photo", photo.Id, "faces", len(deduped))
		w := photo.GetInt("width")
		h := photo.GetInt("height")

		preprocessed, _ := q.engine.preprocessBatch([][]byte{imageData}, 640, 640)
		var newFaces []*core.Record
		for _, face := range deduped {
			rec := q.createFaceRecord(photo.Id, face, w, h)
			if rec == nil {
				continue
			}
			if len(preprocessed) > 0 {
				if emb := q.recognizeFace(preprocessed[0], face.BBox); emb != nil {
					embJSON, _ := json.Marshal(emb)
					rec.Set("embedding", string(embJSON))
					q.app.Save(rec)
				}
			}
			newFaces = append(newFaces, rec)
		}

		if len(newFaces) > 0 {
			q.assignPeople(newFaces, photo.GetString("org"), photo.GetString("owner"))
		}

		photo.Set("ml_status", "processing")
		q.app.Save(photo)
	}

	return nil
}

func (q *JobQueue) processEncodeCLIP(jobs []*core.Record) error {
	if !q.engine.IsAvailable() {
		return nil
	}

	photos := q.loadPhotos(jobs)
	imageDataList := make([][]byte, 0, len(photos))
	photoIndex := make([]int, 0, len(photos))

	for i, photo := range photos {
		if photo.GetString("file") == "" {
			continue
		}
		data, err := q.readPhotoFile(photo)
		if err != nil {
			continue
		}
		imageDataList = append(imageDataList, data)
		photoIndex = append(photoIndex, i)
	}

	embeddings, err := q.engine.EncodeClipVisual(imageDataList)
	if err != nil {
		return err
	}

	for j, emb := range embeddings {
		photo := photos[photoIndex[j]]
		encoded, _ := json.Marshal(emb)
		photo.Set("smart_search_vector", string(encoded))
		photo.Set("ml_status", "done")
		q.app.Save(photo)
	}

	return nil
}

func (q *JobQueue) createFaceRecord(photoID string, result FaceDetectResult, imgW, imgH int) *core.Record {
	collection, err := q.app.FindCollectionByNameOrId("photos_faces")
	if err != nil {
		return nil
	}

	bbox, _ := json.Marshal(map[string]float32{
		"x1": result.BBox[0],
		"y1": result.BBox[1],
		"x2": result.BBox[2],
		"y2": result.BBox[3],
	})

	record := core.NewRecord(collection)
	record.Set("photo", photoID)
	record.Set("bounding_box", string(bbox))
	record.Set("image_width", imgW)
	record.Set("image_height", imgH)
	record.Set("source_type", "ml")
	record.Set("is_visible", true)

	if err := q.app.Save(record); err != nil {
		q.app.Logger().Error("failed to save face record", "photo", photoID, "error", err)
		return nil
	}
	return record
}

// recognizeFace crops the face from a 640x640 preprocessed JPEG and returns its embedding.
func (q *JobQueue) recognizeFace(img640 []byte, bbox [4]float32) []float32 {
	x1, y1, x2, y2 := int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
	if x1 < 0 {
		x1 = 0
	}
	if y1 < 0 {
		y1 = 0
	}
	if x2 > 640 {
		x2 = 640
	}
	if y2 > 640 {
		y2 = 640
	}
	if x2 <= x1 || y2 <= y1 {
		return nil
	}

	src, _, err := image.Decode(bytes.NewReader(img640))
	if err != nil {
		return nil
	}

	type subImager interface {
		SubImage(image.Rectangle) image.Image
	}
	si, ok := src.(subImager)
	if !ok {
		return nil
	}
	crop := si.SubImage(image.Rect(x1, y1, x2, y2))

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, crop, nil); err != nil {
		return nil
	}

	embs, err := q.engine.RecognizeFaces([][]byte{buf.Bytes()})
	if err != nil || len(embs) == 0 {
		return nil
	}
	return embs[0]
}

// assignPeople matches new face records (with embeddings) to existing people or creates new ones.
func (q *JobQueue) assignPeople(faces []*core.Record, orgID, ownerID string) {
	cfg := defaultFaceClusterConfig()

	existingFaces, _ := q.app.FindRecordsByFilter("photos_faces", "person != '' && is_visible = true && embedding != ''", "", 0, 0)

	type personEmbs struct {
		id         string
		embeddings [][]float32
	}
	personMap := make(map[string]*personEmbs)
	for _, f := range existingFaces {
		pid := f.GetString("person")
		embStr := f.GetString("embedding")
		if pid == "" || embStr == "" {
			continue
		}
		var emb []float32
		if err := json.Unmarshal([]byte(embStr), &emb); err != nil {
			continue
		}
		if _, ok := personMap[pid]; !ok {
			personMap[pid] = &personEmbs{id: pid}
		}
		personMap[pid].embeddings = append(personMap[pid].embeddings, emb)
	}

	col, err := q.app.FindCollectionByNameOrId("photos_people")
	if err != nil {
		return
	}

	for _, face := range faces {
		embStr := face.GetString("embedding")
		if embStr == "" {
			continue
		}
		var emb []float32
		if err := json.Unmarshal([]byte(embStr), &emb); err != nil {
			continue
		}

		var bestPerson string
		bestDist := math.MaxFloat64
		for _, pe := range personMap {
			for _, pemb := range pe.embeddings {
				d := cosineDist(emb, pemb)
				if d < bestDist && d < cfg.MaxDistance {
					bestDist = d
					bestPerson = pe.id
				}
			}
		}

		if bestPerson == "" {
			// no match — create a new person
			person := core.NewRecord(col)
			person.Set("name", "Unknown")
			person.Set("is_hidden", false)
			person.Set("thumbnail_face", face.Id)
			person.Set("org", orgID)
			person.Set("owner", ownerID)
			if err := q.app.Save(person); err != nil {
				q.app.Logger().Error("failed to create person", "error", err)
				continue
			}
			bestPerson = person.Id
			personMap[bestPerson] = &personEmbs{id: bestPerson}
		}

		personMap[bestPerson].embeddings = append(personMap[bestPerson].embeddings, emb)
		face.Set("person", bestPerson)
		q.app.Save(face)
	}
}

// nms removes overlapping detections, keeping the highest-score box when IoU > threshold.
func nms(faces []FaceDetectResult, iouThresh float32) []FaceDetectResult {
	if len(faces) <= 1 {
		return faces
	}
	// sort by score desc
	sorted := make([]FaceDetectResult, len(faces))
	copy(sorted, faces)
	for i := 1; i < len(sorted); i++ {
		for j := i; j > 0 && sorted[j].Score > sorted[j-1].Score; j-- {
			sorted[j], sorted[j-1] = sorted[j-1], sorted[j]
		}
	}
	keep := make([]FaceDetectResult, 0, len(sorted))
	suppressed := make([]bool, len(sorted))
	for i, a := range sorted {
		if suppressed[i] {
			continue
		}
		keep = append(keep, a)
		for j := i + 1; j < len(sorted); j++ {
			if !suppressed[j] && iou(a.BBox, sorted[j].BBox) > iouThresh {
				suppressed[j] = true
			}
		}
	}
	return keep
}

func iou(a, b [4]float32) float32 {
	x1 := max32(a[0], b[0])
	y1 := max32(a[1], b[1])
	x2 := min32(a[2], b[2])
	y2 := min32(a[3], b[3])
	inter := max32(0, x2-x1) * max32(0, y2-y1)
	if inter == 0 {
		return 0
	}
	aArea := (a[2] - a[0]) * (a[3] - a[1])
	bArea := (b[2] - b[0]) * (b[3] - b[1])
	return inter / (aArea + bArea - inter)
}

func max32(a, b float32) float32 {
	if a > b {
		return a
	}
	return b
}

func min32(a, b float32) float32 {
	if a < b {
		return a
	}
	return b
}

func (q *JobQueue) readPhotoFile(photo *core.Record) ([]byte, error) {
	fsys, err := q.app.NewFilesystem()
	if err != nil {
		return nil, err
	}
	defer fsys.Close()

	file := photo.GetString("file")
	if file == "" {
		return nil, fmt.Errorf("no file")
	}

	path := photo.BaseFilesPath() + "/" + file
	reader, err := fsys.GetReader(path)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	return data, nil
}

func (q *JobQueue) markProcessing(r *core.Record) {
	r.Set("status", string(JobProcessing))
	q.app.Save(r)
}

func (q *JobQueue) markDone(r *core.Record) {
	r.Set("status", string(JobDone))
	q.app.Save(r)
}

func (q *JobQueue) markFailed(r *core.Record, err error) {
	attempts := r.GetInt("attempts") + 1
	r.Set("attempts", attempts)
	r.Set("last_error", err.Error())

	if attempts >= 3 {
		r.Set("status", string(JobFailed))
	} else {
		r.Set("status", string(JobPending))
		backoff := time.Duration(math.Pow(2, float64(attempts))) * 30 * time.Second
		r.Set("scheduled_at", types.NowDateTime().Add(backoff))
	}

	q.app.Save(r)
}

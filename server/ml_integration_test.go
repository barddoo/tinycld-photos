package photos

import (
	"bytes"
	"image"
	"image/jpeg"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// mlSetup is a singleton that initialises the ONNX engine once per test binary
// run. Subsequent calls reuse the same engine.
var (
	mlOnce   sync.Once
	mlEng    *InferenceEngine
	mlEngErr error
)

// requireML skips the test unless MACHINE_LEARNING_ENABLED=1 and the ONNX
// runtime library is reachable. Returns a fully initialised engine.
func requireML(t *testing.T) *InferenceEngine {
	t.Helper()
	if os.Getenv("MACHINE_LEARNING_ENABLED") != "1" {
		t.Skip("set MACHINE_LEARNING_ENABLED=1 to run ML integration tests")
	}

	mlOnce.Do(func() {
		libPath := os.Getenv("ONNXRUNTIME_SHARED_LIBRARY_PATH")
		if libPath == "" {
			libPath = "/opt/homebrew/lib/libonnxruntime.dylib"
		}
		eng := NewInferenceEngine(libPath, "")
		if err := eng.Init(); err != nil {
			mlEngErr = err
			return
		}
		mlEng = eng
	})

	if mlEngErr != nil {
		t.Skipf("ONNX runtime init failed: %v", mlEngErr)
	}
	return mlEng
}

// modelPath returns the on-disk path for a model and skips the test if the
// file is absent (so tests don't fail just because a model hasn't been
// downloaded yet).
func modelPath(t *testing.T, task ModelTask, name string) string {
	t.Helper()
	cacheDir := os.Getenv("MACHINE_LEARNING_CACHE_FOLDER")
	if cacheDir == "" {
		cacheDir = "/tmp/ml_models"
	}
	path := filepath.Join(cacheDir, string(task), name, "model.onnx")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("model not found at %s (run the server once to download it)", path)
	}
	return path
}

// requireModel loads a task model into the engine and returns it, skipping if
// the model file is absent.
func requireModel(t *testing.T, eng *InferenceEngine, task ModelTask, name string) *InferenceEngine {
	t.Helper()
	path := modelPath(t, task, name)
	if err := eng.LoadModel(task, path); err != nil {
		t.Fatalf("LoadModel(%s): %v", task, err)
	}
	return eng
}

// cropFace extracts the bounding-box region from a JPEG and returns it as a
// JPEG-encoded byte slice ready for RecognizeFaces.
func cropFace(t *testing.T, imgData []byte, bbox [4]float32) []byte {
	t.Helper()
	img, _, err := image.Decode(bytes.NewReader(imgData))
	if err != nil {
		t.Fatalf("decode image for crop: %v", err)
	}
	x1 := int(bbox[0])
	y1 := int(bbox[1])
	x2 := int(bbox[2])
	y2 := int(bbox[3])
	b := img.Bounds()
	if x1 < b.Min.X {
		x1 = b.Min.X
	}
	if y1 < b.Min.Y {
		y1 = b.Min.Y
	}
	if x2 > b.Max.X {
		x2 = b.Max.X
	}
	if y2 > b.Max.Y {
		y2 = b.Max.Y
	}
	type subImager interface {
		SubImage(image.Rectangle) image.Image
	}
	sub := img.(subImager).SubImage(image.Rect(x1, y1, x2, y2))
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, sub, nil); err != nil {
		t.Fatalf("encode crop: %v", err)
	}
	return buf.Bytes()
}

// ---- tests -------------------------------------------------------------------

func TestBuffalo_FaceDetection_OneFace(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")

	data := readTestImage(t, imgFace)

	results, err := eng.DetectFaces([][]byte{data}, 0.5)
	if err != nil {
		t.Fatalf("DetectFaces: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 batch result, got %d", len(results))
	}

	after := nms(results[0], 0.4)
	if len(after) != 1 {
		t.Errorf("me.jpg: expected 1 face after NMS, got %d", len(after))
	}
}

func TestBuffalo_FaceDetection_NoFace(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")

	data := readTestImage(t, imgNoFace)

	results, err := eng.DetectFaces([][]byte{data}, 0.5)
	if err != nil {
		t.Fatalf("DetectFaces: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 batch result, got %d", len(results))
	}

	after := nms(results[0], 0.4)
	if len(after) != 0 {
		t.Errorf("vespa photo: expected 0 faces after NMS, got %d", len(after))
	}
}

func TestBuffalo_FaceDetection_Batch(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")

	d1 := readTestImage(t, imgFace)
	d2 := readTestImage(t, imgNoFace)

	results, err := eng.DetectFaces([][]byte{d1, d2}, 0.5)
	if err != nil {
		t.Fatalf("DetectFaces batch: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 batch results, got %d", len(results))
	}

	faces0 := nms(results[0], 0.4)
	faces1 := nms(results[1], 0.4)

	if len(faces0) != 1 {
		t.Errorf("batch[0] (me.jpg): expected 1 face, got %d", len(faces0))
	}
	if len(faces1) != 0 {
		t.Errorf("batch[1] (vespa): expected 0 faces, got %d", len(faces1))
	}
}

func TestBuffalo_FaceDetection_ScoreAboveThreshold(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")

	data := readTestImage(t, imgFace)

	results, _ := eng.DetectFaces([][]byte{data}, 0.5)
	faces := nms(results[0], 0.4)
	if len(faces) == 0 {
		t.Skip("no face detected — cannot check score")
	}

	if faces[0].Score < 0.5 {
		t.Errorf("expected score >= 0.5, got %v", faces[0].Score)
	}
}

func TestBuffalo_FaceRecognition_EmbeddingShape(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")
	requireModel(t, eng, TaskFaceRecognition, "buffalo_l")

	data := readTestImage(t, imgFace)
	results, _ := eng.DetectFaces([][]byte{data}, 0.5)
	faces := nms(results[0], 0.4)
	if len(faces) == 0 {
		t.Skip("no face detected — cannot test recognition")
	}

	crop := cropFace(t, data, faces[0].BBox)
	embeddings, err := eng.RecognizeFaces([][]byte{crop})
	if err != nil {
		t.Fatalf("RecognizeFaces: %v", err)
	}
	if len(embeddings) != 1 {
		t.Fatalf("expected 1 embedding, got %d", len(embeddings))
	}
	if len(embeddings[0]) != 512 {
		t.Errorf("expected 512-dim embedding, got %d", len(embeddings[0]))
	}
}

func TestBuffalo_FaceRecognition_Deterministic(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")
	requireModel(t, eng, TaskFaceRecognition, "buffalo_l")

	data := readTestImage(t, imgFace)
	results, _ := eng.DetectFaces([][]byte{data}, 0.5)
	faces := nms(results[0], 0.4)
	if len(faces) == 0 {
		t.Skip("no face detected")
	}

	crop := cropFace(t, data, faces[0].BBox)
	emb1, _ := eng.RecognizeFaces([][]byte{crop})
	emb2, _ := eng.RecognizeFaces([][]byte{crop})

	sim := cosineSimilarity(emb1[0], emb2[0])
	if math.Abs(float64(sim)-1.0) > 1e-4 {
		t.Errorf("same crop should yield identical embeddings, cosine similarity = %v", sim)
	}
}

func TestBuffalo_FaceRecognition_SamePersonHighSimilarity(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")
	requireModel(t, eng, TaskFaceRecognition, "buffalo_l")

	data := readTestImage(t, imgFace)
	results, _ := eng.DetectFaces([][]byte{data}, 0.5)
	faces := nms(results[0], 0.4)
	if len(faces) == 0 {
		t.Skip("no face detected")
	}

	crop := cropFace(t, data, faces[0].BBox)
	// Encode the same crop twice — should be nearly identical
	emb1, _ := eng.RecognizeFaces([][]byte{crop})
	emb2, _ := eng.RecognizeFaces([][]byte{crop})

	sim := cosineSimilarity(emb1[0], emb2[0])
	if sim < 0.99 {
		t.Errorf("same crop re-encoded: expected similarity >= 0.99, got %v", sim)
	}
}

func TestCLIP_Visual_EmbeddingShape(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")

	data := readTestImage(t, imgFace)
	embeddings, err := eng.EncodeClipVisual([][]byte{data})
	if err != nil {
		t.Fatalf("EncodeClipVisual: %v", err)
	}
	if len(embeddings) != 1 {
		t.Fatalf("expected 1 embedding, got %d", len(embeddings))
	}
	if len(embeddings[0]) != ClipDim {
		t.Errorf("expected %d-dim embedding, got %d", ClipDim, len(embeddings[0]))
	}
}

func TestCLIP_Visual_NonZeroEmbedding(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")

	data := readTestImage(t, imgFace)
	embeddings, _ := eng.EncodeClipVisual([][]byte{data})

	norm := float32(0)
	for _, v := range embeddings[0] {
		norm += v * v
	}
	if norm == 0 {
		t.Error("expected non-zero CLIP embedding")
	}
}

func TestCLIP_Visual_TwoDistinctImages(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")

	d1 := readTestImage(t, imgFace)
	d2 := readTestImage(t, imgNoFace)

	emb1, _ := eng.EncodeClipVisual([][]byte{d1})
	emb2, _ := eng.EncodeClipVisual([][]byte{d2})

	sim := cosineSimilarity(emb1[0], emb2[0])
	// Man in suit vs blue vespa — unrelated subjects, embeddings must differ.
	if math.Abs(float64(sim)-1.0) < 1e-4 {
		t.Error("expected different CLIP embeddings for different images")
	}
}

func TestCLIP_Visual_Deterministic(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")

	data := readTestImage(t, imgFace)
	emb1, _ := eng.EncodeClipVisual([][]byte{data})
	emb2, _ := eng.EncodeClipVisual([][]byte{data})

	sim := cosineSimilarity(emb1[0], emb2[0])
	if math.Abs(float64(sim)-1.0) > 1e-4 {
		t.Errorf("CLIP encoding not deterministic: similarity = %v", sim)
	}
}

func TestCLIP_Text_EmbeddingShape(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPTextual, "ViT-B-16-SigLIP2")

	embeddings, err := eng.EncodeClipText([]string{"man in suit"})
	if err != nil {
		t.Fatalf("EncodeClipText: %v", err)
	}
	if len(embeddings) != 1 {
		t.Fatalf("expected 1 embedding, got %d", len(embeddings))
	}
	if len(embeddings[0]) != ClipDim {
		t.Errorf("expected %d-dim embedding, got %d", ClipDim, len(embeddings[0]))
	}
}

func TestCLIP_Text_Deterministic(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPTextual, "ViT-B-16-SigLIP2")

	emb1, _ := eng.EncodeClipText([]string{"blue vespa scooter"})
	emb2, _ := eng.EncodeClipText([]string{"blue vespa scooter"})

	sim := cosineSimilarity(emb1[0], emb2[0])
	if math.Abs(float64(sim)-1.0) > 1e-4 {
		t.Errorf("text encoding not deterministic: similarity = %v", sim)
	}
}

func TestCLIP_Text_DifferentQueriesProduceDifferentEmbeddings(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPTextual, "ViT-B-16-SigLIP2")

	emb1, _ := eng.EncodeClipText([]string{"man in suit"})
	emb2, _ := eng.EncodeClipText([]string{"motorcycle"})

	sim := cosineSimilarity(emb1[0], emb2[0])
	if math.Abs(float64(sim)-1.0) < 1e-4 {
		t.Error("expected different text embeddings for different queries")
	}
}

// TestCLIP_CrossModal_TextToImage is the core semantic search test: a text
// query should rank the matching image higher than the unrelated one.
func TestCLIP_CrossModal_ManInSuit_MatchesFacePhoto(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")
	requireModel(t, eng, TaskCLIPTextual, "ViT-B-16-SigLIP2")

	dMan := readTestImage(t, imgFace)
	dMoto := readTestImage(t, imgNoFace)

	imgEmbs, err := eng.EncodeClipVisual([][]byte{dMan, dMoto})
	if err != nil {
		t.Fatalf("EncodeClipVisual: %v", err)
	}
	txtEmbs, err := eng.EncodeClipText([]string{"man in a suit"})
	if err != nil {
		t.Fatalf("EncodeClipText: %v", err)
	}

	query := txtEmbs[0]
	simMan := cosineSimilarity(query, imgEmbs[0])
	simMoto := cosineSimilarity(query, imgEmbs[1])

	if simMan <= simMoto {
		t.Errorf("'man in a suit' should match man.jpg (%.4f) more than motorcycle (%.4f)", simMan, simMoto)
	}
}

func TestCLIP_CrossModal_Motorcycle_MatchesMotorcyclePhoto(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")
	requireModel(t, eng, TaskCLIPTextual, "ViT-B-16-SigLIP2")

	dMan := readTestImage(t, imgFace)
	dMoto := readTestImage(t, imgNoFace)

	imgEmbs, err := eng.EncodeClipVisual([][]byte{dMan, dMoto})
	if err != nil {
		t.Fatalf("EncodeClipVisual: %v", err)
	}
	txtEmbs, err := eng.EncodeClipText([]string{"motorcycle"})
	if err != nil {
		t.Fatalf("EncodeClipText: %v", err)
	}

	query := txtEmbs[0]
	simMan := cosineSimilarity(query, imgEmbs[0])
	simMoto := cosineSimilarity(query, imgEmbs[1])

	if simMoto <= simMan {
		t.Errorf("'motorcycle' should match motorcycle photo (%.4f) more than man.jpg (%.4f)", simMoto, simMan)
	}
}

func TestBuffalo_FaceDetection_FivePersons(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")

	data := readTestImage(t, imgGroup)

	results, err := eng.DetectFaces([][]byte{data}, 0.5)
	if err != nil {
		t.Fatalf("DetectFaces: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 batch result, got %d", len(results))
	}

	after := nms(results[0], 0.4)
	if len(after) != 5 {
		t.Errorf("5-humans.jpg: expected 5 faces after NMS, got %d", len(after))
	}
}

func TestBuffalo_FaceRecognition_GroupEmbeddingsDistinct(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskFaceDetection, "buffalo_l")
	requireModel(t, eng, TaskFaceRecognition, "buffalo_l")

	data := readTestImage(t, imgGroup)
	results, _ := eng.DetectFaces([][]byte{data}, 0.5)
	faces := nms(results[0], 0.4)
	if len(faces) < 2 {
		t.Skipf("need at least 2 faces, got %d", len(faces))
	}

	crops := make([][]byte, len(faces))
	for i, f := range faces {
		crops[i] = cropFace(t, data, f.BBox)
	}

	embeddings, err := eng.RecognizeFaces(crops)
	if err != nil {
		t.Fatalf("RecognizeFaces: %v", err)
	}

	// Every pair of distinct persons should have similarity well below 1.0
	for i := 0; i < len(embeddings); i++ {
		for j := i + 1; j < len(embeddings); j++ {
			sim := cosineSimilarity(embeddings[i], embeddings[j])
			if sim > 0.8 {
				t.Errorf("faces %d and %d have suspiciously high similarity %.4f — likely the same embedding", i, j, sim)
			}
		}
	}
}

func TestCLIP_CrossModal_GroupPhoto_MatchesPeople(t *testing.T) {
	eng := requireML(t)
	requireModel(t, eng, TaskCLIPVisual, "ViT-B-16-SigLIP2")
	requireModel(t, eng, TaskCLIPTextual, "ViT-B-16-SigLIP2")

	dGroup := readTestImage(t, imgGroup)
	dMoto := readTestImage(t, imgNoFace)

	imgEmbs, err := eng.EncodeClipVisual([][]byte{dGroup, dMoto})
	if err != nil {
		t.Fatalf("EncodeClipVisual: %v", err)
	}
	txtEmbs, err := eng.EncodeClipText([]string{"group of people"})
	if err != nil {
		t.Fatalf("EncodeClipText: %v", err)
	}

	query := txtEmbs[0]
	simGroup := cosineSimilarity(query, imgEmbs[0])
	simMoto := cosineSimilarity(query, imgEmbs[1])

	if simGroup <= simMoto {
		t.Errorf("'group of people' should match 5-humans.jpg (%.4f) more than motorcycle (%.4f)", simGroup, simMoto)
	}
}

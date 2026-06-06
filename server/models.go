package photos

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type ModelTask string

const (
	TaskFaceDetection   ModelTask = "face_detection"
	TaskFaceRecognition ModelTask = "face_recognition"
	TaskCLIPVisual      ModelTask = "clip_visual"
	TaskCLIPTextual     ModelTask = "clip_textual"
	TaskOCRDetection    ModelTask = "ocr_detection"
	TaskOCRRecognition  ModelTask = "ocr_recognition"
)

type ModelEntry struct {
	Task     ModelTask
	Name     string
	URL      string
	Checksum string
	FileName string
}

type ModelManager struct {
	cacheDir string
	ttl      time.Duration
	mu       sync.RWMutex
	loaded   map[ModelTask]string
	client   *http.Client
}

func NewModelManager(cacheDir string, ttl time.Duration) *ModelManager {
	return &ModelManager{
		cacheDir: cacheDir,
		ttl:      ttl,
		loaded:   make(map[ModelTask]string),
		client: &http.Client{
			Timeout: 5 * time.Minute,
		},
	}
}

func (m *ModelManager) ModelPath(task ModelTask) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.loaded[task]
}

var defaultModelCatalog = []ModelEntry{
	{
		Task:     TaskFaceDetection,
		Name:     "buffalo_l",
		FileName: "model.onnx",
		URL:      "https://huggingface.co/immich-app/buffalo_l/resolve/main/detection/model.onnx",
		Checksum: "",
	},
	{
		Task:     TaskFaceRecognition,
		Name:     "buffalo_l",
		FileName: "model.onnx",
		URL:      "https://huggingface.co/immich-app/buffalo_l/resolve/main/recognition/model.onnx",
		Checksum: "",
	},
	{
		Task:     TaskCLIPVisual,
		Name:     "ViT-B-16-SigLIP2",
		FileName: "model.onnx",
		URL:      "https://huggingface.co/immich-app/ViT-B-16-SigLIP2__webli/resolve/main/visual/model.onnx",
		Checksum: "",
	},
	{
		Task:     TaskCLIPTextual,
		Name:     "ViT-B-16-SigLIP2",
		FileName: "model.onnx",
		URL:      "https://huggingface.co/immich-app/ViT-B-16-SigLIP2__webli/resolve/main/textual/model.onnx",
		Checksum: "",
	},
	{
		Task:     TaskOCRDetection,
		Name:     "PP-OCRv4",
		FileName: "model.onnx",
		URL:      "https://huggingface.co/deepghs/paddleocr/resolve/main/det/ch_PP-OCRv4_det/model.onnx",
		Checksum: "",
	},
	{
		Task:     TaskOCRRecognition,
		Name:     "PP-OCRv4",
		FileName: "model.onnx",
		URL:      "https://huggingface.co/deepghs/paddleocr/resolve/main/rec/en_PP-OCRv4_rec/model.onnx",
		Checksum: "",
	},
}

func (m *ModelManager) EnsureModels() error {
	for _, entry := range defaultModelCatalog {
		if err := m.ensureModel(entry); err != nil {
			return fmt.Errorf("model %s/%s: %w", entry.Task, entry.Name, err)
		}
	}
	return nil
}

func (m *ModelManager) ensureModel(entry ModelEntry) error {
	modelDir := filepath.Join(m.cacheDir, string(entry.Task), entry.Name)
	modelPath := filepath.Join(modelDir, entry.FileName)

	if _, err := os.Stat(modelPath); err == nil {
		if entry.Checksum != "" {
			ok, cerr := verifyChecksum(modelPath, entry.Checksum)
			if cerr != nil {
				return fmt.Errorf("verify existing model: %w", cerr)
			}
			if !ok {
				os.Remove(modelPath)
			}
		}
		if _, err := os.Stat(modelPath); err == nil {
			m.mu.Lock()
			m.loaded[entry.Task] = modelPath
			m.mu.Unlock()
			return nil
		}
	}

	os.MkdirAll(modelDir, 0755)

	tmpPath := modelPath + ".download"
	if err := m.downloadFile(entry.URL, tmpPath); err != nil {
		return fmt.Errorf("download %s: %w", entry.URL, err)
	}

	if entry.Checksum != "" {
		ok, err := verifyChecksum(tmpPath, entry.Checksum)
		if err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("checksum: %w", err)
		}
		if !ok {
			os.Remove(tmpPath)
			return fmt.Errorf("checksum mismatch for %s", entry.URL)
		}
	}

	if err := os.Rename(tmpPath, modelPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename: %w", err)
	}

	m.mu.Lock()
	m.loaded[entry.Task] = modelPath
	m.mu.Unlock()
	return nil
}

func (m *ModelManager) downloadFile(url, dest string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	if token := os.Getenv("HUGGING_FACE_HUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, resp.Body)
	return err
}

func verifyChecksum(path, expected string) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return false, err
	}

	return hex.EncodeToString(h.Sum(nil)) == expected, nil
}

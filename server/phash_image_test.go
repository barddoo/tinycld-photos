package photos

import (
	"bytes"
	"image/jpeg"
	"os"
	"strings"
	"testing"
)

const (
	imgFace   = "../../tests/data/man.jpg"
	imgNoFace = "../../tests/data/motorcycle.jpg"
	imgGroup  = "../../tests/data/5-humans.jpg"
)

func readTestImage(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("test image not available (%s): %v", path, err)
	}
	return data
}

func TestComputePHash(t *testing.T) {
	t.Run("produces non-empty hash for face image", func(t *testing.T) {
		data := readTestImage(t, imgFace)
		hash, err := ComputePHash(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hash == "" {
			t.Error("expected non-empty hash")
		}
	})

	t.Run("produces non-empty hash for no-face image", func(t *testing.T) {
		data := readTestImage(t, imgNoFace)
		hash, err := ComputePHash(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hash == "" {
			t.Error("expected non-empty hash")
		}
	})

	t.Run("hash is deterministic (same image → same hash)", func(t *testing.T) {
		data := readTestImage(t, imgFace)
		h1, err := ComputePHash(data)
		if err != nil {
			t.Fatalf("first hash error: %v", err)
		}
		h2, err := ComputePHash(data)
		if err != nil {
			t.Fatalf("second hash error: %v", err)
		}
		if h1 != h2 {
			t.Errorf("hashes differ for the same image: %q vs %q", h1, h2)
		}
	})

	t.Run("two distinct images produce different hashes", func(t *testing.T) {
		d1 := readTestImage(t, imgFace)
		d2 := readTestImage(t, imgNoFace)
		h1, err := ComputePHash(d1)
		if err != nil {
			t.Fatalf("hash1 error: %v", err)
		}
		h2, err := ComputePHash(d2)
		if err != nil {
			t.Fatalf("hash2 error: %v", err)
		}
		if h1 == h2 {
			t.Errorf("different images returned the same hash: %q", h1)
		}
	})

	t.Run("hash string has expected format (p:hex)", func(t *testing.T) {
		data := readTestImage(t, imgFace)
		hash, err := ComputePHash(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// goimagehash.ToString produces "p:0000000000000000" style
		if !strings.HasPrefix(hash, "p:") {
			t.Errorf("expected hash to start with 'p:', got %q", hash)
		}
	})

	t.Run("returns error for invalid image data", func(t *testing.T) {
		_, err := ComputePHash([]byte("not an image"))
		if err == nil {
			t.Error("expected error for invalid image data")
		}
	})

	t.Run("returns error for empty data", func(t *testing.T) {
		_, err := ComputePHash([]byte{})
		if err == nil {
			t.Error("expected error for empty data")
		}
	})
}

func TestImagesToFloat32WithRealImages(t *testing.T) {
	t.Run("produces float32 slice with correct length for single image", func(t *testing.T) {
		data := readTestImage(t, imgFace)
		width, height := 112, 112
		got := imagesToFloat32([][]byte{data}, width, height)
		want := 1 * 3 * width * height
		if len(got) != want {
			t.Errorf("expected %d elements, got %d", want, len(got))
		}
	})

	t.Run("produces float32 slice with correct length for two images", func(t *testing.T) {
		d1 := readTestImage(t, imgFace)
		d2 := readTestImage(t, imgNoFace)
		width, height := 112, 112
		got := imagesToFloat32([][]byte{d1, d2}, width, height)
		want := 2 * 3 * width * height
		if len(got) != want {
			t.Errorf("expected %d elements, got %d", want, len(got))
		}
	})

	t.Run("pixel values are normalized to [-1, 1] range", func(t *testing.T) {
		data := readTestImage(t, imgFace)
		got := imagesToFloat32([][]byte{data}, 64, 64)
		for i, v := range got {
			if v < -1.1 || v > 1.1 {
				t.Errorf("value at index %d out of range: %v", i, v)
				break
			}
		}
	})

	t.Run("different images produce different tensors", func(t *testing.T) {
		d1 := readTestImage(t, imgFace)
		d2 := readTestImage(t, imgNoFace)
		w, h := 64, 64
		t1 := imagesToFloat32([][]byte{d1}, w, h)
		t2 := imagesToFloat32([][]byte{d2}, w, h)
		same := true
		for i := range t1 {
			if t1[i] != t2[i] {
				same = false
				break
			}
		}
		if same {
			t.Error("expected different float32 tensors for different images")
		}
	})
}

func TestPreprocessBatchWithRealImages(t *testing.T) {
	engine := &InferenceEngine{}

	t.Run("decodes and resizes face image to target dimensions", func(t *testing.T) {
		data := readTestImage(t, imgFace)
		result, err := engine.preprocessBatch([][]byte{data}, 160, 160)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 1 {
			t.Fatalf("expected 1 result, got %d", len(result))
		}
		img, err := jpeg.Decode(bytes.NewReader(result[0]))
		if err != nil {
			t.Fatalf("result is not valid JPEG: %v", err)
		}
		b := img.Bounds()
		if b.Dx() != 160 || b.Dy() != 160 {
			t.Errorf("expected 160×160, got %d×%d", b.Dx(), b.Dy())
		}
	})

	t.Run("handles batch of two images", func(t *testing.T) {
		d1 := readTestImage(t, imgFace)
		d2 := readTestImage(t, imgNoFace)
		result, err := engine.preprocessBatch([][]byte{d1, d2}, 224, 224)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 2 {
			t.Fatalf("expected 2 results, got %d", len(result))
		}
		for i, r := range result {
			img, err := jpeg.Decode(bytes.NewReader(r))
			if err != nil {
				t.Fatalf("result[%d] is not valid JPEG: %v", i, err)
			}
			b := img.Bounds()
			if b.Dx() != 224 || b.Dy() != 224 {
				t.Errorf("result[%d]: expected 224×224, got %d×%d", i, b.Dx(), b.Dy())
			}
		}
	})

	t.Run("returns error for invalid image bytes", func(t *testing.T) {
		_, err := engine.preprocessBatch([][]byte{[]byte("garbage")}, 64, 64)
		if err == nil {
			t.Error("expected error for invalid image bytes")
		}
	})
}

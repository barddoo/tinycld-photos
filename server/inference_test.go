package photos

import (
	"image"
	"image/color"
	"math"
	"testing"
)

func TestCosineSimilarity(t *testing.T) {
	t.Run("identical vectors have similarity 1", func(t *testing.T) {
		a := []float32{1, 0, 0}
		s := cosineSimilarity(a, a)
		if math.Abs(float64(s)-1) > 1e-6 {
			t.Errorf("expected 1, got %v", s)
		}
	})

	t.Run("orthogonal vectors have similarity 0", func(t *testing.T) {
		a := []float32{1, 0, 0}
		b := []float32{0, 1, 0}
		s := cosineSimilarity(a, b)
		if math.Abs(float64(s)) > 1e-6 {
			t.Errorf("expected 0, got %v", s)
		}
	})

	t.Run("opposite vectors have similarity -1", func(t *testing.T) {
		a := []float32{1, 0, 0}
		b := []float32{-1, 0, 0}
		s := cosineSimilarity(a, b)
		if math.Abs(float64(s)+1) > 1e-6 {
			t.Errorf("expected -1, got %v", s)
		}
	})

	t.Run("zero vector a returns 0", func(t *testing.T) {
		a := []float32{0, 0, 0}
		b := []float32{1, 2, 3}
		s := cosineSimilarity(a, b)
		if s != 0 {
			t.Errorf("expected 0 for zero vector a, got %v", s)
		}
	})

	t.Run("is symmetric", func(t *testing.T) {
		a := []float32{1, 2, 3}
		b := []float32{4, 5, 6}
		if math.Abs(float64(cosineSimilarity(a, b)-cosineSimilarity(b, a))) > 1e-6 {
			t.Error("cosineSimilarity is not symmetric")
		}
	})

	t.Run("scaled vectors have the same similarity", func(t *testing.T) {
		a := []float32{1, 2, 3}
		b := []float32{2, 4, 6}
		s := cosineSimilarity(a, b)
		if math.Abs(float64(s)-1) > 1e-5 {
			t.Errorf("scaled vector: expected similarity ~1, got %v", s)
		}
	})
}

func TestSimpleToken(t *testing.T) {
	t.Run("returns a value in valid token range [1, 49405]", func(t *testing.T) {
		words := []string{"hello", "world", "photo", "beach", "sunset", "face"}
		for _, w := range words {
			tok := simpleToken(w)
			if tok < 1 || tok > 49405 {
				t.Errorf("simpleToken(%q) = %d, out of range [1, 49405]", w, tok)
			}
		}
	})

	t.Run("same input always returns the same token", func(t *testing.T) {
		for i := 0; i < 5; i++ {
			if simpleToken("deterministic") != simpleToken("deterministic") {
				t.Error("simpleToken is not deterministic")
			}
		}
	})

	t.Run("different words typically produce different tokens", func(t *testing.T) {
		t1 := simpleToken("apple")
		t2 := simpleToken("orange")
		// Not guaranteed (hash collision possible), but extremely unlikely for these words
		if t1 == t2 {
			t.Logf("hash collision for 'apple' and 'orange' (token %d) — rare but possible", t1)
		}
	})

	t.Run("empty string does not panic", func(t *testing.T) {
		tok := simpleToken("")
		_ = tok
	})
}

func TestTokenizeTexts(t *testing.T) {
	t.Run("each sequence has length maxLen", func(t *testing.T) {
		result := tokenizeTexts([]string{"hello world"}, 10)
		if len(result) != 1 {
			t.Fatalf("expected 1 result, got %d", len(result))
		}
		if len(result[0]) != 10 {
			t.Errorf("expected length 10, got %d", len(result[0]))
		}
	})

	t.Run("first token is SOT (49406)", func(t *testing.T) {
		result := tokenizeTexts([]string{"test"}, 8)
		if result[0][0] != 49406 {
			t.Errorf("expected SOT 49406 at position 0, got %d", result[0][0])
		}
	})

	t.Run("EOT token (49407) appears after words", func(t *testing.T) {
		result := tokenizeTexts([]string{"cat"}, 8)
		// ids[0]=SOT, ids[1]=token("cat"), ids[2]=EOT
		found := false
		for _, id := range result[0] {
			if id == 49407 {
				found = true
				break
			}
		}
		if !found {
			t.Error("EOT token 49407 not found in tokenized output")
		}
	})

	t.Run("empty text produces SOT then EOT then zeros", func(t *testing.T) {
		result := tokenizeTexts([]string{""}, 4)
		if result[0][0] != 49406 {
			t.Errorf("expected SOT at 0, got %d", result[0][0])
		}
		if result[0][1] != 49407 {
			t.Errorf("expected EOT at 1, got %d", result[0][1])
		}
	})

	t.Run("multiple texts produce multiple sequences", func(t *testing.T) {
		result := tokenizeTexts([]string{"cat", "dog", "bird"}, 8)
		if len(result) != 3 {
			t.Errorf("expected 3, got %d", len(result))
		}
	})

	t.Run("long text is truncated to maxLen-1 word tokens", func(t *testing.T) {
		words := "a b c d e f g h i j k l m n o p"
		result := tokenizeTexts([]string{words}, 5)
		if len(result[0]) != 5 {
			t.Errorf("expected length 5, got %d", len(result[0]))
		}
	})
}

func TestDecodeOCRText(t *testing.T) {
	t.Run("all-zero data produces empty string", func(t *testing.T) {
		data := make([]float32, 5*6625)
		result := decodeOCRText(data, 5)
		if result != "" {
			t.Errorf("expected empty string, got %q", result)
		}
	})

	t.Run("single character at position 0", func(t *testing.T) {
		// charset[0] = '0', so maxIdx=1 at step 0 → outputs '0'
		data := make([]float32, 5*6625)
		data[0*6625+1] = 1.0 // position 0, index 1 → charset[0]='0'
		result := decodeOCRText(data, 5)
		if result != "0" {
			t.Errorf("expected '0', got %q", result)
		}
	})

	t.Run("repeated same index collapses (CTC blank-like behavior)", func(t *testing.T) {
		// Same index at positions 0 and 1 → only one char emitted due to prevIdx check
		data := make([]float32, 5*6625)
		data[0*6625+1] = 1.0
		data[1*6625+1] = 1.0
		result := decodeOCRText(data, 5)
		if result != "0" {
			t.Errorf("expected single '0' (CTC collapse), got %q", result)
		}
	})

	t.Run("two different characters at consecutive positions", func(t *testing.T) {
		// charset: "0123456789abcdefghijklmnopqrstuvwxyz"
		// index 1 → '0', index 2 → '1'
		data := make([]float32, 5*6625)
		data[0*6625+1] = 1.0 // '0'
		data[1*6625+2] = 1.0 // '1'
		result := decodeOCRText(data, 5)
		if result != "01" {
			t.Errorf("expected '01', got %q", result)
		}
	})

	t.Run("zero seqLen produces empty string", func(t *testing.T) {
		result := decodeOCRText([]float32{}, 0)
		if result != "" {
			t.Errorf("expected empty string for seqLen=0, got %q", result)
		}
	})
}

func TestMergeTextBoxes(t *testing.T) {
	t.Run("empty input returns empty slice", func(t *testing.T) {
		got := mergeTextBoxes([][4]float32{})
		if len(got) != 0 {
			t.Errorf("expected empty, got %v", got)
		}
	})

	t.Run("single box is returned unchanged", func(t *testing.T) {
		boxes := [][4]float32{{10, 20, 100, 40}}
		got := mergeTextBoxes(boxes)
		if len(got) != 1 {
			t.Fatalf("expected 1, got %d", len(got))
		}
		if got[0] != boxes[0] {
			t.Errorf("box changed: %v → %v", boxes[0], got[0])
		}
	})

	t.Run("adjacent boxes on the same line are merged", func(t *testing.T) {
		// box2.x1 <= box1.x2+5 and overlapping y ranges → merged
		boxes := [][4]float32{
			{0, 10, 50, 30},
			{52, 10, 100, 30},
		}
		got := mergeTextBoxes(boxes)
		if len(got) != 1 {
			t.Fatalf("expected merged into 1, got %d boxes", len(got))
		}
		if got[0][0] != 0 || got[0][2] != 100 {
			t.Errorf("merged box has wrong x range: %v", got[0])
		}
	})

	t.Run("boxes far apart on the x axis stay separate", func(t *testing.T) {
		boxes := [][4]float32{
			{0, 10, 50, 30},
			{200, 10, 250, 30}, // x gap >> 5
		}
		got := mergeTextBoxes(boxes)
		if len(got) != 2 {
			t.Errorf("expected 2 separate boxes, got %d", len(got))
		}
	})

	t.Run("boxes on different y lines stay separate", func(t *testing.T) {
		boxes := [][4]float32{
			{0, 0, 50, 20},
			{0, 100, 50, 120}, // y gap >> 10
		}
		got := mergeTextBoxes(boxes)
		if len(got) != 2 {
			t.Errorf("expected 2 separate boxes, got %d", len(got))
		}
	})
}

func TestResizeImage(t *testing.T) {
	t.Run("same dimensions returns the original image", func(t *testing.T) {
		src := image.NewRGBA(image.Rect(0, 0, 100, 100))
		got := resizeImage(src, 100, 100)
		if got != src {
			t.Error("expected same image pointer when dimensions match")
		}
	})

	t.Run("output has the requested dimensions", func(t *testing.T) {
		src := image.NewRGBA(image.Rect(0, 0, 200, 150))
		got := resizeImage(src, 64, 64)
		b := got.Bounds()
		if b.Dx() != 64 || b.Dy() != 64 {
			t.Errorf("expected 64x64, got %dx%d", b.Dx(), b.Dy())
		}
	})

	t.Run("solid color image stays the same color after resize", func(t *testing.T) {
		src := image.NewRGBA(image.Rect(0, 0, 10, 10))
		red := color.RGBA{R: 255, G: 0, B: 0, A: 255}
		for y := 0; y < 10; y++ {
			for x := 0; x < 10; x++ {
				src.Set(x, y, red)
			}
		}
		got := resizeImage(src, 5, 5)
		r, g, b, _ := got.At(2, 2).RGBA()
		if r>>8 != 255 || g>>8 != 0 || b>>8 != 0 {
			t.Errorf("color not preserved: R=%d G=%d B=%d", r>>8, g>>8, b>>8)
		}
	})
}

package photos

import (
	"testing"
)

func TestMax32(t *testing.T) {
	tests := []struct{ a, b, want float32 }{
		{1, 2, 2},
		{2, 1, 2},
		{0, 0, 0},
		{-1, 0, 0},
		{-3, -1, -1},
	}
	for _, tt := range tests {
		if got := max32(tt.a, tt.b); got != tt.want {
			t.Errorf("max32(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestMin32(t *testing.T) {
	tests := []struct{ a, b, want float32 }{
		{1, 2, 1},
		{2, 1, 1},
		{0, 0, 0},
		{-1, 0, -1},
		{-3, -1, -3},
	}
	for _, tt := range tests {
		if got := min32(tt.a, tt.b); got != tt.want {
			t.Errorf("min32(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestIOU(t *testing.T) {
	t.Run("identical boxes have IoU 1", func(t *testing.T) {
		box := [4]float32{0, 0, 10, 10}
		got := iou(box, box)
		if got != 1 {
			t.Errorf("expected 1, got %v", got)
		}
	})

	t.Run("non-overlapping boxes have IoU 0", func(t *testing.T) {
		a := [4]float32{0, 0, 10, 10}
		b := [4]float32{20, 20, 30, 30}
		got := iou(a, b)
		if got != 0 {
			t.Errorf("expected 0, got %v", got)
		}
	})

	t.Run("adjacent (touching) boxes have IoU 0", func(t *testing.T) {
		a := [4]float32{0, 0, 10, 10}
		b := [4]float32{10, 0, 20, 10}
		got := iou(a, b)
		if got != 0 {
			t.Errorf("touching boxes: expected 0, got %v", got)
		}
	})

	t.Run("50%% overlap returns IoU 1/3", func(t *testing.T) {
		// a: (0,0)-(10,10) area=100; b: (5,0)-(15,10) area=100; intersection: (5,0)-(10,10)=50
		// IoU = 50 / (100+100-50) = 50/150 = 1/3
		a := [4]float32{0, 0, 10, 10}
		b := [4]float32{5, 0, 15, 10}
		got := iou(a, b)
		want := float32(50.0 / 150.0)
		if abs32(got-want) > 1e-5 {
			t.Errorf("expected ~%.4f, got %v", want, got)
		}
	})

	t.Run("is symmetric", func(t *testing.T) {
		a := [4]float32{0, 0, 10, 10}
		b := [4]float32{5, 5, 15, 15}
		if abs32(iou(a, b)-iou(b, a)) > 1e-6 {
			t.Error("iou is not symmetric")
		}
	})
}

func abs32(x float32) float32 {
	if x < 0 {
		return -x
	}
	return x
}

func TestNMS(t *testing.T) {
	t.Run("empty input returns empty slice", func(t *testing.T) {
		got := nms([]FaceDetectResult{}, 0.4)
		if len(got) != 0 {
			t.Errorf("expected empty, got %v", got)
		}
	})

	t.Run("single face is returned unchanged", func(t *testing.T) {
		faces := []FaceDetectResult{
			{BBox: [4]float32{0, 0, 10, 10}, Score: 0.9},
		}
		got := nms(faces, 0.4)
		if len(got) != 1 {
			t.Fatalf("expected 1, got %d", len(got))
		}
	})

	t.Run("non-overlapping faces are all kept", func(t *testing.T) {
		faces := []FaceDetectResult{
			{BBox: [4]float32{0, 0, 10, 10}, Score: 0.9},
			{BBox: [4]float32{50, 50, 60, 60}, Score: 0.8},
			{BBox: [4]float32{100, 100, 110, 110}, Score: 0.7},
		}
		got := nms(faces, 0.4)
		if len(got) != 3 {
			t.Errorf("expected 3 faces kept, got %d", len(got))
		}
	})

	t.Run("highly overlapping faces: only highest score kept", func(t *testing.T) {
		// Two nearly identical boxes — IoU ≈ 1 > 0.4 threshold → lower score suppressed
		faces := []FaceDetectResult{
			{BBox: [4]float32{0, 0, 10, 10}, Score: 0.95},
			{BBox: [4]float32{1, 1, 11, 11}, Score: 0.7},
		}
		got := nms(faces, 0.4)
		if len(got) != 1 {
			t.Fatalf("expected 1 face, got %d", len(got))
		}
		if got[0].Score != 0.95 {
			t.Errorf("expected highest-score face kept (0.95), got %v", got[0].Score)
		}
	})

	t.Run("output is sorted by score descending", func(t *testing.T) {
		faces := []FaceDetectResult{
			{BBox: [4]float32{0, 0, 10, 10}, Score: 0.5},
			{BBox: [4]float32{50, 50, 60, 60}, Score: 0.95},
			{BBox: [4]float32{100, 100, 110, 110}, Score: 0.7},
		}
		got := nms(faces, 0.4)
		if got[0].Score < got[1].Score || got[1].Score < got[2].Score {
			t.Errorf("output not sorted desc: %v %v %v", got[0].Score, got[1].Score, got[2].Score)
		}
	})

	t.Run("does not mutate the original slice header", func(t *testing.T) {
		faces := []FaceDetectResult{
			{BBox: [4]float32{0, 0, 10, 10}, Score: 0.9},
			{BBox: [4]float32{5, 5, 15, 15}, Score: 0.6},
		}
		originalLen := len(faces)
		nms(faces, 0.4)
		if len(faces) != originalLen {
			t.Errorf("original slice length changed from %d to %d", originalLen, len(faces))
		}
	})
}

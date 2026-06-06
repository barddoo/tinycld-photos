package photos

import (
	"math"
	"testing"
)

func TestCosineDist(t *testing.T) {
	t.Run("identical vectors have distance 0", func(t *testing.T) {
		a := []float32{1, 0, 0}
		d := cosineDist(a, a)
		if d != 0 {
			t.Errorf("expected 0, got %v", d)
		}
	})

	t.Run("orthogonal vectors have distance 1", func(t *testing.T) {
		a := []float32{1, 0, 0}
		b := []float32{0, 1, 0}
		d := cosineDist(a, b)
		if math.Abs(d-1) > 1e-6 {
			t.Errorf("expected 1, got %v", d)
		}
	})

	t.Run("opposite vectors have distance 2", func(t *testing.T) {
		a := []float32{1, 0, 0}
		b := []float32{-1, 0, 0}
		d := cosineDist(a, b)
		if math.Abs(d-2) > 1e-6 {
			t.Errorf("expected 2, got %v", d)
		}
	})

	t.Run("zero vector a returns 1 (max distance)", func(t *testing.T) {
		a := []float32{0, 0, 0}
		b := []float32{1, 2, 3}
		d := cosineDist(a, b)
		if d != 1 {
			t.Errorf("expected 1 for zero vector a, got %v", d)
		}
	})

	t.Run("zero vector b returns 1 (max distance)", func(t *testing.T) {
		a := []float32{1, 2, 3}
		b := []float32{0, 0, 0}
		d := cosineDist(a, b)
		if d != 1 {
			t.Errorf("expected 1 for zero vector b, got %v", d)
		}
	})

	t.Run("is symmetric", func(t *testing.T) {
		a := []float32{1, 2, 3}
		b := []float32{4, 5, 6}
		if math.Abs(cosineDist(a, b)-cosineDist(b, a)) > 1e-9 {
			t.Error("cosineDist is not symmetric")
		}
	})

	t.Run("scaled vector has same distance as original", func(t *testing.T) {
		a := []float32{1, 2, 3}
		b := []float32{2, 4, 6} // 2×a
		d := cosineDist(a, b)
		if d > 1e-6 {
			t.Errorf("scaled vector should have dist ~0, got %v", d)
		}
	})
}

func TestEnvFloat(t *testing.T) {
	t.Run("returns default when env var is unset", func(t *testing.T) {
		t.Setenv("TEST_FLOAT_UNSET_XYZ", "")
		got := envFloat("TEST_FLOAT_UNSET_XYZ", 3.14)
		if got != 3.14 {
			t.Errorf("expected 3.14, got %v", got)
		}
	})

	t.Run("returns parsed value when env var is set", func(t *testing.T) {
		t.Setenv("TEST_FLOAT_VAL", "2.718")
		got := envFloat("TEST_FLOAT_VAL", 0)
		if math.Abs(got-2.718) > 1e-9 {
			t.Errorf("expected 2.718, got %v", got)
		}
	})

	t.Run("returns default when env var is not a valid float", func(t *testing.T) {
		t.Setenv("TEST_FLOAT_BAD", "notanumber")
		got := envFloat("TEST_FLOAT_BAD", 42.0)
		if got != 42.0 {
			t.Errorf("expected 42.0, got %v", got)
		}
	})

	t.Run("handles negative values", func(t *testing.T) {
		t.Setenv("TEST_FLOAT_NEG", "-1.5")
		got := envFloat("TEST_FLOAT_NEG", 0)
		if math.Abs(got-(-1.5)) > 1e-9 {
			t.Errorf("expected -1.5, got %v", got)
		}
	})
}

func TestEnvInt(t *testing.T) {
	t.Run("returns default when env var is unset", func(t *testing.T) {
		t.Setenv("TEST_INT_UNSET_XYZ", "")
		got := envInt("TEST_INT_UNSET_XYZ", 8)
		if got != 8 {
			t.Errorf("expected 8, got %v", got)
		}
	})

	t.Run("returns parsed value when env var is set", func(t *testing.T) {
		t.Setenv("TEST_INT_VAL", "16")
		got := envInt("TEST_INT_VAL", 0)
		if got != 16 {
			t.Errorf("expected 16, got %v", got)
		}
	})

	t.Run("returns default when env var is not a valid int", func(t *testing.T) {
		t.Setenv("TEST_INT_BAD", "three")
		got := envInt("TEST_INT_BAD", 5)
		if got != 5 {
			t.Errorf("expected 5, got %v", got)
		}
	})

	t.Run("handles zero", func(t *testing.T) {
		t.Setenv("TEST_INT_ZERO", "0")
		got := envInt("TEST_INT_ZERO", 99)
		if got != 0 {
			t.Errorf("expected 0, got %v", got)
		}
	})
}

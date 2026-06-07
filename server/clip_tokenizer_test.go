package photos

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// buildTestTokenizer writes a minimal tokenizer.json and loads it.
func buildTestTokenizer(t *testing.T) *UnigramTokenizer {
	t.Helper()

	// Minimal vocab covering the test phrases: metaspace variants + common words.
	vocab := [][]interface{}{
		{"<unk>", 0.0},
		{"</s>", 0.0}, // EOS id=1
		{"▁", -1.0},
		{"▁the", -2.0},
		{"▁motor", -3.0},
		{"▁motorcycle", -2.5},
		{"cycle", -4.0},
		{"▁scooter", -2.8},
		{"▁beach", -2.7},
		{"▁sun", -3.0},
		{"set", -3.5},
		{"▁sunset", -2.6},
		{"a", -5.0},
		{"b", -5.0},
		{"c", -5.0},
	}

	vocabRaw := make([]json.RawMessage, len(vocab))
	for i, entry := range vocab {
		b, _ := json.Marshal(entry)
		vocabRaw[i] = b
	}

	tj := map[string]interface{}{
		"model": map[string]interface{}{
			"type":   "Unigram",
			"vocab":  vocabRaw,
			"unk_id": 0,
		},
		"added_tokens": []interface{}{
			map[string]interface{}{"id": 1, "content": "</s>"},
		},
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "tokenizer.json")
	data, _ := json.Marshal(tj)
	os.WriteFile(path, data, 0644)

	tok, err := loadUnigramTokenizer(path)
	if err != nil {
		t.Fatalf("loadUnigramTokenizer: %v", err)
	}
	return tok
}

func TestUnigramTokenizerEncode(t *testing.T) {
	tok := buildTestTokenizer(t)

	t.Run("known word produces correct id", func(t *testing.T) {
		ids := tok.Encode("motorcycle", 16)
		// "motorcycle" → "▁motorcycle" which is in vocab at index 5
		if ids[0] != 5 {
			t.Errorf("expected token id 5, got %d", ids[0])
		}
		// EOS should follow
		if ids[1] != 1 {
			t.Errorf("expected EOS id 1 at position 1, got %d", ids[1])
		}
		// Rest should be padding 0
		for i := 2; i < 16; i++ {
			if ids[i] != 0 {
				t.Errorf("expected pad 0 at position %d, got %d", i, ids[i])
			}
		}
	})

	t.Run("length is always maxLen", func(t *testing.T) {
		ids := tok.Encode("beach sunset", 8)
		if len(ids) != 8 {
			t.Errorf("expected length 8, got %d", len(ids))
		}
	})

	t.Run("empty text produces EOS then padding", func(t *testing.T) {
		ids := tok.Encode("", 8)
		if ids[0] != 1 { // EOS
			t.Errorf("expected EOS at position 0, got %d", ids[0])
		}
	})

	t.Run("attention mask logic: non-zero ids get mask 1", func(t *testing.T) {
		ids := tok.Encode("motorcycle", 8)
		// Check that at least one id is non-zero (would get mask=1).
		nonZero := false
		for _, id := range ids {
			if id != 0 {
				nonZero = true
			}
		}
		if !nonZero {
			t.Error("all ids are zero, attention mask would be all-zero")
		}
	})
}

func TestUnigramTokenizerSegment(t *testing.T) {
	tok := buildTestTokenizer(t)

	t.Run("single known word segments correctly", func(t *testing.T) {
		segs := tok.segment("motorcycle")
		if len(segs) == 0 {
			t.Fatal("expected segments, got none")
		}
		// Should produce ▁motorcycle as one token (it's in vocab).
		if segs[0] != "▁motorcycle" {
			t.Errorf("expected ▁motorcycle, got %q", segs[0])
		}
	})

	t.Run("unknown chars don't hang", func(t *testing.T) {
		segs := tok.segment("xyzxyz")
		if len(segs) == 0 {
			t.Error("expected at least one segment for unknown text")
		}
	})
}

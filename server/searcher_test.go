package photos

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	usearch "github.com/unum-cloud/usearch/golang"
)

// makeUsearchSearcher builds a UsearchSearcher with a real in-memory index
// but no PocketBase dependency. The app field is left nil; only Search,
// Upsert, and Delete code-paths that do not call app are exercised.
func makeUsearchSearcher(t *testing.T, dim uint, indexPath string) *UsearchSearcher {
	t.Helper()
	conf := usearch.DefaultConfig(dim)
	conf.Metric = usearch.Cosine
	conf.Quantization = usearch.F32
	idx, err := usearch.NewIndex(conf)
	if err != nil {
		t.Fatalf("usearch.NewIndex: %v", err)
	}
	if err := idx.Reserve(100); err != nil {
		t.Fatalf("usearch.Reserve: %v", err)
	}
	return &UsearchSearcher{
		indexPath: indexPath,
		idx:       idx,
		idMap:     newIDMap(),
	}
}

// makeEmbedding returns a unit vector in dimension dim with value 1 at axis.
func makeEmbedding(dim, axis int) []float32 {
	v := make([]float32, dim)
	v[axis] = 1.0
	return v
}

func TestUsearchSearcher(t *testing.T) {
	const dim = 4 // use small dim for speed; behaviour is identical to ClipDim

	tmp := t.TempDir()
	indexPath := filepath.Join(tmp, "test.usearch")

	t.Run("empty index returns empty results", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		results, err := s.Search(context.Background(), makeEmbedding(dim, 0), 5)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected empty results, got %d", len(results))
		}
	})

	t.Run("Upsert then Search finds the inserted vector", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		vec := makeEmbedding(dim, 1)
		if err := s.Upsert(context.Background(), "photo-1", vec); err != nil {
			t.Fatalf("Upsert error: %v", err)
		}
		results, err := s.Search(context.Background(), vec, 1)
		if err != nil {
			t.Fatalf("Search error: %v", err)
		}
		if len(results) != 1 {
			t.Fatalf("expected 1 result, got %d", len(results))
		}
		if results[0].PhotoID != "photo-1" {
			t.Errorf("expected photo-1, got %q", results[0].PhotoID)
		}
	})

	t.Run("Search score is in (0, 1] for identical vector", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		vec := makeEmbedding(dim, 2)
		_ = s.Upsert(context.Background(), "photo-score", vec)
		results, _ := s.Search(context.Background(), vec, 1)
		if len(results) == 0 {
			t.Fatal("no results")
		}
		score := results[0].Score
		if score <= 0 || score > 1.001 {
			t.Errorf("expected score in (0,1], got %v", score)
		}
	})

	t.Run("closest vector ranks first", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		// axis-0 is the query direction
		_ = s.Upsert(context.Background(), "close", makeEmbedding(dim, 0))
		far := make([]float32, dim)
		far[1] = 0.9
		far[0] = 0.1
		_ = s.Upsert(context.Background(), "far", far)

		results, err := s.Search(context.Background(), makeEmbedding(dim, 0), 2)
		if err != nil {
			t.Fatalf("Search error: %v", err)
		}
		if len(results) < 2 {
			t.Fatalf("expected 2 results, got %d", len(results))
		}
		if results[0].PhotoID != "close" {
			t.Errorf("expected 'close' to rank first, got %q", results[0].PhotoID)
		}
	})

	t.Run("topK limits the number of results", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		for i := 0; i < 10; i++ {
			v := make([]float32, dim)
			v[i%dim] = 1.0
			_ = s.Upsert(context.Background(), string(rune('a'+i)), v)
		}
		results, err := s.Search(context.Background(), makeEmbedding(dim, 0), 3)
		if err != nil {
			t.Fatalf("Search error: %v", err)
		}
		if len(results) > 3 {
			t.Errorf("expected at most 3 results, got %d", len(results))
		}
	})

	t.Run("Upsert is idempotent (same ID twice does not duplicate)", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		vec := makeEmbedding(dim, 0)
		_ = s.Upsert(context.Background(), "dup", vec)
		_ = s.Upsert(context.Background(), "dup", vec)
		results, err := s.Search(context.Background(), vec, 10)
		if err != nil {
			t.Fatalf("Search error: %v", err)
		}
		count := 0
		for _, r := range results {
			if r.PhotoID == "dup" {
				count++
			}
		}
		if count != 1 {
			t.Errorf("expected 'dup' to appear once, got %d times", count)
		}
	})

	t.Run("Delete removes a photo from search results", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		vec := makeEmbedding(dim, 0)
		_ = s.Upsert(context.Background(), "to-delete", vec)

		// Confirm it's found before deletion
		before, _ := s.Search(context.Background(), vec, 5)
		found := false
		for _, r := range before {
			if r.PhotoID == "to-delete" {
				found = true
				break
			}
		}
		if !found {
			t.Fatal("expected 'to-delete' to be found before deletion")
		}

		if err := s.Delete(context.Background(), "to-delete"); err != nil {
			t.Fatalf("Delete error: %v", err)
		}

		// idMap should no longer contain the ID
		if s.idMap.Contains("to-delete") {
			t.Error("expected idMap to no longer contain 'to-delete' after Delete")
		}
	})

	t.Run("Delete of unknown ID is a no-op", func(t *testing.T) {
		s := makeUsearchSearcher(t, dim, indexPath)
		err := s.Delete(context.Background(), "never-existed")
		if err != nil {
			t.Errorf("expected no error for unknown ID, got: %v", err)
		}
	})

	t.Run("index is persisted to disk by Upsert", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "persist.usearch")
		s := makeUsearchSearcher(t, dim, path)
		s.indexPath = path
		_ = s.Upsert(context.Background(), "saved", makeEmbedding(dim, 0))
		if _, err := os.Stat(path); err != nil {
			t.Errorf("expected index file at %s, got error: %v", path, err)
		}
	})

	t.Run("Search returns error when index is nil", func(t *testing.T) {
		s := &UsearchSearcher{} // idx is nil
		_, err := s.Search(context.Background(), makeEmbedding(dim, 0), 5)
		if err == nil {
			t.Error("expected error when idx is nil")
		}
	})

	t.Run("Upsert returns error when index is nil", func(t *testing.T) {
		s := &UsearchSearcher{}
		err := s.Upsert(context.Background(), "x", makeEmbedding(dim, 0))
		if err == nil {
			t.Error("expected error when idx is nil")
		}
	})

	t.Run("Delete returns error when index is nil", func(t *testing.T) {
		s := &UsearchSearcher{}
		err := s.Delete(context.Background(), "x")
		if err == nil {
			t.Error("expected error when idx is nil")
		}
	})
}

func TestGlobalSearcher(t *testing.T) {
	t.Run("GetVectorSearcher returns nil when nothing is set", func(t *testing.T) {
		// Ensure the global is cleared before this test
		globalSearcher.Store(nil)
		got := GetVectorSearcher()
		if got != nil {
			t.Errorf("expected nil, got %T", got)
		}
	})

	t.Run("SetVectorSearcher then GetVectorSearcher returns the same implementation", func(t *testing.T) {
		tmp := t.TempDir()
		s := makeUsearchSearcher(t, 4, filepath.Join(tmp, "global.usearch"))
		var vs VectorSearcher = s
		SetVectorSearcher(vs)
		got := GetVectorSearcher()
		if got == nil {
			t.Fatal("expected non-nil searcher after SetVectorSearcher")
		}
		// Verify it's the same underlying searcher by doing a round-trip
		_ = got.Upsert(context.Background(), "g1", makeEmbedding(4, 0))
		results, err := got.Search(context.Background(), makeEmbedding(4, 0), 1)
		if err != nil {
			t.Fatalf("Search error: %v", err)
		}
		if len(results) == 0 || results[0].PhotoID != "g1" {
			t.Errorf("expected g1, got %v", results)
		}
	})
}

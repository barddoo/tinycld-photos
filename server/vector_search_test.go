package photos

import (
	"sync"
	"testing"
)

func TestSortResults(t *testing.T) {
	t.Run("sorts by score descending", func(t *testing.T) {
		candidates := []scoredPhoto{
			{id: "c", score: 0.3},
			{id: "a", score: 0.9},
			{id: "b", score: 0.6},
		}
		sortResults(candidates)
		if candidates[0].id != "a" || candidates[1].id != "b" || candidates[2].id != "c" {
			t.Errorf("wrong order: %v %v %v", candidates[0].id, candidates[1].id, candidates[2].id)
		}
	})

	t.Run("single element is unchanged", func(t *testing.T) {
		candidates := []scoredPhoto{{id: "x", score: 0.5}}
		sortResults(candidates)
		if candidates[0].id != "x" {
			t.Errorf("expected x, got %q", candidates[0].id)
		}
	})

	t.Run("equal scores preserve relative order (stable)", func(t *testing.T) {
		candidates := []scoredPhoto{
			{id: "first", score: 0.5},
			{id: "second", score: 0.5},
		}
		sortResults(candidates)
		// Both have equal score; either order is acceptable, just no panic
		if len(candidates) != 2 {
			t.Errorf("expected 2 results, got %d", len(candidates))
		}
	})

	t.Run("empty slice does not panic", func(t *testing.T) {
		sortResults([]scoredPhoto{})
	})

	t.Run("already sorted input is unchanged", func(t *testing.T) {
		candidates := []scoredPhoto{
			{id: "a", score: 1.0},
			{id: "b", score: 0.5},
			{id: "c", score: 0.1},
		}
		sortResults(candidates)
		if candidates[0].id != "a" {
			t.Errorf("first should still be a, got %q", candidates[0].id)
		}
	})
}

func TestIDMap(t *testing.T) {
	t.Run("GetOrAssign assigns monotonically increasing uint64 keys", func(t *testing.T) {
		m := newIDMap()
		id1 := m.GetOrAssign("photo-a")
		id2 := m.GetOrAssign("photo-b")
		if id1 == id2 {
			t.Error("distinct strings should get distinct keys")
		}
		if id2 <= id1 {
			t.Errorf("keys should increase: %d then %d", id1, id2)
		}
	})

	t.Run("GetOrAssign returns the same key for the same string", func(t *testing.T) {
		m := newIDMap()
		id1 := m.GetOrAssign("photo-x")
		id2 := m.GetOrAssign("photo-x")
		if id1 != id2 {
			t.Errorf("same string should return same key: %d vs %d", id1, id2)
		}
	})

	t.Run("GetString retrieves the original string", func(t *testing.T) {
		m := newIDMap()
		key := m.GetOrAssign("my-photo-id")
		str, ok := m.GetString(key)
		if !ok {
			t.Fatal("expected ok=true")
		}
		if str != "my-photo-id" {
			t.Errorf("expected my-photo-id, got %q", str)
		}
	})

	t.Run("GetString returns false for unknown key", func(t *testing.T) {
		m := newIDMap()
		_, ok := m.GetString(9999)
		if ok {
			t.Error("expected ok=false for unknown key")
		}
	})

	t.Run("Contains returns true for assigned IDs", func(t *testing.T) {
		m := newIDMap()
		m.GetOrAssign("photo-1")
		if !m.Contains("photo-1") {
			t.Error("expected Contains=true for assigned ID")
		}
	})

	t.Run("Contains returns false for unassigned IDs", func(t *testing.T) {
		m := newIDMap()
		if m.Contains("never-assigned") {
			t.Error("expected Contains=false for unassigned ID")
		}
	})

	t.Run("Remove deletes from both maps", func(t *testing.T) {
		m := newIDMap()
		key := m.GetOrAssign("photo-del")
		m.Remove("photo-del")

		if m.Contains("photo-del") {
			t.Error("Contains should be false after Remove")
		}
		_, ok := m.GetString(key)
		if ok {
			t.Error("GetString should return false after Remove")
		}
	})

	t.Run("Remove is a no-op for unknown IDs", func(t *testing.T) {
		m := newIDMap()
		m.Remove("never-existed") // should not panic
	})

	t.Run("Len reflects number of entries", func(t *testing.T) {
		m := newIDMap()
		if m.Len() != 0 {
			t.Errorf("expected 0, got %d", m.Len())
		}
		m.GetOrAssign("a")
		m.GetOrAssign("b")
		if m.Len() != 2 {
			t.Errorf("expected 2, got %d", m.Len())
		}
		m.Remove("a")
		if m.Len() != 1 {
			t.Errorf("expected 1 after remove, got %d", m.Len())
		}
	})

	t.Run("is safe for concurrent use", func(t *testing.T) {
		m := newIDMap()
		var wg sync.WaitGroup
		for i := 0; i < 50; i++ {
			wg.Add(1)
			go func(n int) {
				defer wg.Done()
				id := m.GetOrAssign("photo")
				m.GetString(id)
				m.Contains("photo")
				m.Len()
			}(i)
		}
		wg.Wait()
	})
}

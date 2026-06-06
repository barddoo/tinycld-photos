package photos

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/pocketbase/pocketbase"
	usearch "github.com/unum-cloud/usearch/golang"
)

type SearchResult struct {
	PhotoID string
	Score   float32
}

type scoredPhoto struct {
	id    string
	score float32
}

type VectorSearcher interface {
	Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error)
	Upsert(ctx context.Context, photoID string, embedding []float32) error
	Delete(ctx context.Context, photoID string) error
}

var globalSearcher atomic.Pointer[VectorSearcher]

func SetVectorSearcher(s VectorSearcher) {
	globalSearcher.Store(&s)
}

func GetVectorSearcher() VectorSearcher {
	p := globalSearcher.Load()
	if p != nil {
		return *p
	}
	return nil
}

func NewVectorSearcher(app *pocketbase.PocketBase) VectorSearcher {
	indexPath := os.Getenv("USEARCH_INDEX_PATH")
	if indexPath != "" {
		s := &UsearchSearcher{
			indexPath: indexPath,
			app:       app,
		}
		if err := s.init(); err != nil {
			app.Logger().Warn("usearch init failed, falling back to brute-force", "error", err)
			return &BruteForceSearcher{app: app}
		}
		return s
	}
	return &BruteForceSearcher{app: app}
}

// BruteForceSearcher scans SQLite records and computes cosine similarity in Go.
type BruteForceSearcher struct {
	app *pocketbase.PocketBase
}

func (s *BruteForceSearcher) Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error) {
	const maxScan = 5000
	records, err := s.app.FindRecordsByFilter(
		"photos_items",
		"smart_search_vector != null && smart_search_vector != ''",
		"",
		maxScan, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}

	var candidates []scoredPhoto

	for _, r := range records {
		vecStr := r.GetString("smart_search_vector")
		if vecStr == "" {
			continue
		}
		var vec []float32
		if err := json.Unmarshal([]byte(vecStr), &vec); err != nil {
			continue
		}
		if len(vec) == 0 {
			continue
		}
		sim := cosineSimilarity(query, vec)
		if sim < 0.1 {
			continue
		}
		candidates = append(candidates, scoredPhoto{r.Id, sim})
	}

	if len(candidates) == 0 {
		return nil, nil
	}

	sortResults(candidates)

	results := make([]SearchResult, 0, min(topK, len(candidates)))
	for i := 0; i < len(candidates) && i < topK; i++ {
		results = append(results, SearchResult{
			PhotoID: candidates[i].id,
			Score:   candidates[i].score,
		})
	}
	return results, nil
}

func sortResults(candidates []scoredPhoto) {
	for i := 0; i < len(candidates); i++ {
		for j := i + 1; j < len(candidates); j++ {
			if candidates[j].score > candidates[i].score {
				candidates[i], candidates[j] = candidates[j], candidates[i]
			}
		}
	}
}

func (s *BruteForceSearcher) Upsert(ctx context.Context, photoID string, embedding []float32) error {
	record, err := s.app.FindRecordById("photos_items", photoID)
	if err != nil {
		return err
	}
	encoded, _ := json.Marshal(embedding)
	record.Set("smart_search_vector", string(encoded))
	return s.app.Save(record)
}

func (s *BruteForceSearcher) Delete(ctx context.Context, photoID string) error {
	record, err := s.app.FindRecordById("photos_items", photoID)
	if err != nil {
		return err
	}
	record.Set("smart_search_vector", nil)
	return s.app.Save(record)
}

// IDMap provides a bidirectional mapping between PocketBase string IDs and
// usearch uint64 keys.
type IDMap struct {
	mu       sync.RWMutex
	strToU64 map[string]uint64
	u64ToStr map[uint64]string
	next     uint64
}

func newIDMap() *IDMap {
	return &IDMap{
		strToU64: make(map[string]uint64),
		u64ToStr: make(map[uint64]string),
		next:     1,
	}
}

func (m *IDMap) GetOrAssign(strID string) uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id, ok := m.strToU64[strID]; ok {
		return id
	}
	id := m.next
	m.next++
	m.strToU64[strID] = id
	m.u64ToStr[id] = strID
	return id
}

func (m *IDMap) GetString(u64ID uint64) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.u64ToStr[u64ID]
	return s, ok
}

func (m *IDMap) Remove(strID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id, ok := m.strToU64[strID]; ok {
		delete(m.strToU64, strID)
		delete(m.u64ToStr, id)
	}
}

func (m *IDMap) Contains(strID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.strToU64[strID]
	return ok
}

func (m *IDMap) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.strToU64)
}

// UsearchSearcher wraps a usearch HNSW index for approximate nearest-neighbor
// search. SQLite is the source of truth; the usearch index is rebuilt from
// on startup and persisted to disk for faster subsequent loads.
type UsearchSearcher struct {
	indexPath string
	app       *pocketbase.PocketBase

	idx   *usearch.Index
	idMap *IDMap
	mu    sync.RWMutex
}

func (s *UsearchSearcher) init() error {
	dir := filepath.Dir(s.indexPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create index dir: %w", err)
	}

	conf := usearch.DefaultConfig(512)
	conf.Metric = usearch.Cosine
	conf.Quantization = usearch.F32

	var err error
	s.idx, err = usearch.NewIndex(conf)
	if err != nil {
		return fmt.Errorf("new index: %w", err)
	}
	s.idMap = newIDMap()

	return s.rebuildFromDB()
}

func (s *UsearchSearcher) rebuildFromDB() error {
	records, err := s.app.FindRecordsByFilter(
		"photos_items",
		"smart_search_vector != null && smart_search_vector != ''",
		"",
		0, 0,
	)
	if err != nil {
		return fmt.Errorf("query vectors: %w", err)
	}

	if len(records) > 0 {
		_ = s.idx.Reserve(uint(len(records)))
	}

	for _, r := range records {
		vecStr := r.GetString("smart_search_vector")
		if vecStr == "" {
			continue
		}
		var vec []float32
		if err := json.Unmarshal([]byte(vecStr), &vec); err != nil {
			continue
		}
		if len(vec) != 512 {
			continue
		}
		u64Key := s.idMap.GetOrAssign(r.Id)
		_ = s.idx.Add(usearch.Key(u64Key), vec)
	}

	return s.idx.Save(s.indexPath)
}

func (s *UsearchSearcher) Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error) {
	s.mu.RLock()
	idx := s.idx
	idMap := s.idMap
	s.mu.RUnlock()

	if idx == nil {
		return nil, fmt.Errorf("index not initialized")
	}

	keys, distances, err := idx.Search(query, uint(topK))
	if err != nil {
		return nil, fmt.Errorf("usearch search: %w", err)
	}

	results := make([]SearchResult, 0, len(keys))
	for i := range keys {
		strID, ok := idMap.GetString(uint64(keys[i]))
		if !ok {
			continue
		}
		score := 1.0 - distances[i]
		results = append(results, SearchResult{PhotoID: strID, Score: score})
	}
	return results, nil
}

func (s *UsearchSearcher) Upsert(ctx context.Context, photoID string, embedding []float32) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.idx == nil {
		return fmt.Errorf("index not initialized")
	}

	u64Key := s.idMap.GetOrAssign(photoID)
	if err := s.idx.Add(usearch.Key(u64Key), embedding); err != nil {
		return fmt.Errorf("usearch upsert: %w", err)
	}

	return s.idx.Save(s.indexPath)
}

func (s *UsearchSearcher) Delete(ctx context.Context, photoID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.idx == nil {
		return fmt.Errorf("index not initialized")
	}

	if !s.idMap.Contains(photoID) {
		return nil
	}

	u64Key := s.idMap.GetOrAssign(photoID)
	if err := s.idx.Remove(usearch.Key(u64Key)); err != nil {
		return fmt.Errorf("usearch remove: %w", err)
	}
	s.idMap.Remove(photoID)

	return s.idx.Save(s.indexPath)
}

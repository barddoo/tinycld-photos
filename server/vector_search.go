package photos

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
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

func NewVectorSearcher(app *pocketbase.PocketBase) VectorSearcher {
	qdrantURL := os.Getenv("QDRANT_URL")
	if qdrantURL != "" {
		return &QdrantSearcher{
			baseURL:    qdrantURL,
			collection: os.Getenv("QDRANT_COLLECTION"),
			apiKey:     os.Getenv("QDRANT_API_KEY"),
			client:     &http.Client{},
		}
	}
	return &BruteForceSearcher{app: app}
}

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

type QdrantSearcher struct {
	baseURL    string
	collection string
	apiKey     string
	client     *http.Client
}

func (s *QdrantSearcher) Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error) {
	body := map[string]any{
		"vector": query,
		"limit":  topK,
		"with_payload": false,
	}

	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST",
		s.baseURL+"/collections/"+url.PathEscape(s.collection)+"/points/search",
		strings.NewReader(string(data)),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.apiKey != "" {
		req.Header.Set("api-key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var qRes struct {
		Result []struct {
			ID     string  `json:"id"`
			Score  float32 `json:"score"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&qRes); err != nil {
		return nil, err
	}

	results := make([]SearchResult, len(qRes.Result))
	for i, r := range qRes.Result {
		results[i] = SearchResult{PhotoID: r.ID, Score: r.Score}
	}
	return results, nil
}

func (s *QdrantSearcher) Upsert(ctx context.Context, photoID string, embedding []float32) error {
	point := map[string]any{
		"id":     photoID,
		"vector": embedding,
	}
	body := map[string]any{
		"points": []any{point},
	}

	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "PUT",
		s.baseURL+"/collections/"+url.PathEscape(s.collection)+"/points",
		strings.NewReader(string(data)),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.apiKey != "" {
		req.Header.Set("api-key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (s *QdrantSearcher) Delete(ctx context.Context, photoID string) error {
	body := map[string]any{
		"points": []string{photoID},
	}
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST",
		s.baseURL+"/collections/"+url.PathEscape(s.collection)+"/points/delete",
		strings.NewReader(string(data)),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.apiKey != "" {
		req.Header.Set("api-key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

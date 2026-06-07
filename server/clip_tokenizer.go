package photos

import (
	"encoding/json"
	"math"
	"os"
	"strings"
)

// UnigramTokenizer implements SentencePiece unigram tokenization as used by
// the SigLIP2 CLIP text encoder. Vocabulary and scores are loaded from a
// HuggingFace tokenizer.json file.
type UnigramTokenizer struct {
	tokenToID    map[string]int32
	tokenToScore map[string]float64
	unkID        int32
	eosID        int32
	padID        int32
}

// tokenizerJSON is a minimal parse of the HuggingFace tokenizer.json format.
type tokenizerJSON struct {
	Model struct {
		Type  string            `json:"type"`
		Vocab []json.RawMessage `json:"vocab"` // each entry is [token, score]
		UnkID int32             `json:"unk_id"`
	} `json:"model"`
	AddedTokens []struct {
		ID      int32  `json:"id"`
		Content string `json:"content"`
	} `json:"added_tokens"`
}

func loadUnigramTokenizer(path string) (*UnigramTokenizer, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var tj tokenizerJSON
	if err := json.Unmarshal(data, &tj); err != nil {
		return nil, err
	}

	t := &UnigramTokenizer{
		tokenToID:    make(map[string]int32, len(tj.Model.Vocab)),
		tokenToScore: make(map[string]float64, len(tj.Model.Vocab)),
		unkID:        tj.Model.UnkID,
		eosID:        1, // SigLIP uses token id 1 as EOS
		padID:        0,
	}

	for i, raw := range tj.Model.Vocab {
		var entry [2]json.RawMessage
		if err := json.Unmarshal(raw, &entry); err != nil {
			continue
		}
		var token string
		if err := json.Unmarshal(entry[0], &token); err != nil {
			continue
		}
		var score float64
		if err := json.Unmarshal(entry[1], &score); err != nil {
			continue
		}
		t.tokenToID[token] = int32(i)
		t.tokenToScore[token] = score
	}

	// Override EOS from added_tokens if present.
	for _, at := range tj.AddedTokens {
		if at.Content == "</s>" || at.Content == "<eos>" {
			t.eosID = at.ID
		}
	}

	return t, nil
}

// Encode tokenizes text into a fixed-length int32 slice of length maxLen.
// Positions past the last real token are padded with padID (0).
func (t *UnigramTokenizer) Encode(text string, maxLen int) []int32 {
	ids := make([]int32, maxLen)
	tokens := t.segment(strings.ToLower(text))

	pos := 0
	for _, tok := range tokens {
		if pos >= maxLen-1 {
			break
		}
		if id, ok := t.tokenToID[tok]; ok {
			ids[pos] = id
		} else {
			ids[pos] = t.unkID
		}
		pos++
	}
	ids[pos] = t.eosID // EOS at first padding position
	return ids
}

// segment runs Viterbi over the metaspace-prefixed text and returns the
// sequence of SentencePiece tokens.
func (t *UnigramTokenizer) segment(text string) []string {
	if text == "" {
		return nil
	}

	// SentencePiece metaspace convention: replace spaces with ▁ and prefix ▁.
	text = "▁" + strings.ReplaceAll(text, " ", "▁")

	runes := []rune(text)
	n := len(runes)

	const negInf = -1e38
	const maxTokenRunes = 32 // skip substrings longer than this

	best := make([]float64, n+1)
	bestLen := make([]int, n+1) // how many runes in the winning token ending at i
	for i := range best {
		best[i] = negInf
	}
	best[0] = 0

	for i := 0; i < n; i++ {
		if best[i] == negInf {
			continue
		}
		limit := n
		if i+maxTokenRunes < limit {
			limit = i + maxTokenRunes
		}
		for j := i + 1; j <= limit; j++ {
			substr := string(runes[i:j])
			score, ok := t.tokenToScore[substr]
			if !ok {
				continue
			}
			if candidate := best[i] + score; candidate > best[j] {
				best[j] = candidate
				bestLen[j] = j - i
			}
		}
		// Single-rune fallback so we never get stuck.
		if best[i+1] == negInf {
			best[i+1] = best[i] + math.Log(1e-10)
			bestLen[i+1] = 1
		}
	}

	// Backtrack.
	tokens := make([]string, 0, n/2)
	pos := n
	for pos > 0 {
		l := bestLen[pos]
		if l == 0 {
			l = 1
		}
		start := pos - l
		tokens = append(tokens, string(runes[start:pos]))
		pos = start
	}

	// Reverse in-place.
	for i, j := 0, len(tokens)-1; i < j; i, j = i+1, j-1 {
		tokens[i], tokens[j] = tokens[j], tokens[i]
	}
	return tokens
}

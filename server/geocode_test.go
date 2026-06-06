package photos

import (
	"math"
	"testing"
)

func TestParseFloat(t *testing.T) {
	tests := []struct {
		input string
		want  float64
	}{
		{"0", 0},
		{"1", 1},
		{"-1", -1},
		{"3.14", 3.14},
		{"-2.5", -2.5},
		{"100", 100},
		{"0.5", 0.5},
		{"12.345", 12.345},
		{"-0.001", -0.001},
		{"", 0},
	}
	for _, tt := range tests {
		got := parseFloat(tt.input)
		if math.Abs(got-tt.want) > 1e-9 {
			t.Errorf("parseFloat(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestHaversine(t *testing.T) {
	t.Run("same point is zero distance", func(t *testing.T) {
		d := haversine(48.8566, 2.3522, 48.8566, 2.3522)
		if d != 0 {
			t.Errorf("same point: expected 0, got %v", d)
		}
	})

	t.Run("Paris to London is ~340 km", func(t *testing.T) {
		d := haversine(48.8566, 2.3522, 51.5074, -0.1278)
		if math.Abs(d-340) > 20 {
			t.Errorf("Paris–London: expected ~340 km, got %.1f km", d)
		}
	})

	t.Run("New York to Los Angeles is ~3940 km", func(t *testing.T) {
		d := haversine(40.7128, -74.006, 34.0522, -118.2437)
		if d < 3800 || d > 4100 {
			t.Errorf("NYC–LA: expected ~3940 km, got %.1f km", d)
		}
	})

	t.Run("is symmetric", func(t *testing.T) {
		d1 := haversine(48.8566, 2.3522, 51.5074, -0.1278)
		d2 := haversine(51.5074, -0.1278, 48.8566, 2.3522)
		if math.Abs(d1-d2) > 1e-9 {
			t.Errorf("not symmetric: %.9f vs %.9f", d1, d2)
		}
	})

	t.Run("returns km not radians", func(t *testing.T) {
		// A one-degree latitude shift is ~111 km
		d := haversine(0, 0, 1, 0)
		if d < 100 || d > 120 {
			t.Errorf("1° latitude: expected ~111 km, got %.1f", d)
		}
	})
}

func TestReverseGeocode(t *testing.T) {
	idx := &GeoCodeIndex{
		points: []GeoEntry{
			{Lat: 48.8566, Lon: 2.3522, City: "Paris", State: "Île-de-France", Country: "FR"},
			{Lat: 51.5074, Lon: -0.1278, City: "London", State: "England", Country: "GB"},
			{Lat: 40.7128, Lon: -74.006, City: "New York", State: "New York", Country: "US"},
		},
		ready: true,
	}

	t.Run("finds the nearest city", func(t *testing.T) {
		city, _, _ := idx.ReverseGeocode(48.8566, 2.3522)
		if city != "Paris" {
			t.Errorf("expected Paris, got %q", city)
		}
	})

	t.Run("returns all three fields", func(t *testing.T) {
		city, state, country := idx.ReverseGeocode(51.5074, -0.1278)
		if city != "London" {
			t.Errorf("city: expected London, got %q", city)
		}
		if state != "England" {
			t.Errorf("state: expected England, got %q", state)
		}
		if country != "GB" {
			t.Errorf("country: expected GB, got %q", country)
		}
	})

	t.Run("returns empty strings when index is not ready", func(t *testing.T) {
		notReady := &GeoCodeIndex{
			points: []GeoEntry{{Lat: 48.8566, Lon: 2.3522, City: "Paris"}},
			ready:  false,
		}
		city, state, country := notReady.ReverseGeocode(48.8566, 2.3522)
		if city != "" || state != "" || country != "" {
			t.Errorf("expected empty strings for not-ready index, got %q %q %q", city, state, country)
		}
	})

	t.Run("returns empty strings when no city is within 50 km", func(t *testing.T) {
		// Mid-Atlantic — far from all indexed cities
		city, state, country := idx.ReverseGeocode(30.0, -40.0)
		if city != "" || state != "" || country != "" {
			t.Errorf("expected empty strings for remote location, got %q %q %q", city, state, country)
		}
	})

	t.Run("returns empty strings for empty points slice", func(t *testing.T) {
		empty := &GeoCodeIndex{points: []GeoEntry{}, ready: true}
		city, state, country := empty.ReverseGeocode(48.0, 2.0)
		if city != "" || state != "" || country != "" {
			t.Errorf("expected empty strings for empty index, got %q %q %q", city, state, country)
		}
	})

	t.Run("picks closest among multiple candidates", func(t *testing.T) {
		// Slightly offset toward London — should still resolve to Paris since it's closer
		city, _, _ := idx.ReverseGeocode(49.0, 2.0)
		if city != "Paris" {
			t.Errorf("expected Paris for coord near Paris, got %q", city)
		}
	})
}

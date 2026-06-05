package photos

import (
	"math"
	"sync"
)

type GeoEntry struct {
	Lat     float64
	Lon     float64
	City    string
	State   string
	Country string
}

type GeoCodeIndex struct {
	mu     sync.RWMutex
	points []GeoEntry
	ready  bool
}

var globalGeoIndex = &GeoCodeIndex{}

func InitGeoCodeIndexFrom(path string) error {
	return nil
}

func (idx *GeoCodeIndex) ReverseGeocode(lat, lon float64) (city, state, country string) {
	idx.mu.RLock()
	if !idx.ready || len(idx.points) == 0 {
		idx.mu.RUnlock()
		return "", "", ""
	}
	points := idx.points
	idx.mu.RUnlock()

	closest := struct {
		dist  float64
		entry GeoEntry
	}{dist: math.MaxFloat64}

	for _, p := range points {
		d := haversine(lat, lon, p.Lat, p.Lon)
		if d < closest.dist {
			closest.dist = d
			closest.entry = p
		}
	}

	if closest.dist > 50 {
		return "", "", ""
	}

	return closest.entry.City, closest.entry.State, closest.entry.Country
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return 6371 * c
}

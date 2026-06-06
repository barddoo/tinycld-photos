package photos

import (
	"bufio"
	"compress/gzip"
	_ "embed"
	"math"
	"strings"
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

//go:embed cities.gz
var citiesGZ []byte

func InitGeoCodeIndexFrom(path string) error {
	gr, err := gzip.NewReader(strings.NewReader(string(citiesGZ)))
	if err != nil {
		return err
	}
	defer gr.Close()

	var points []GeoEntry
	scanner := bufio.NewScanner(gr)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Split(line, "\t")
		if len(fields) < 17 {
			continue
		}

		lat := parseFloat(fields[4])
		lon := parseFloat(fields[5])
		if lat == 0 && lon == 0 {
			continue
		}

		name := fields[1]
		admin1 := fields[10]
		country := fields[8]

		if name == "" {
			continue
		}

		points = append(points, GeoEntry{
			Lat:     lat,
			Lon:     lon,
			City:    name,
			State:   admin1,
			Country: country,
		})
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	globalGeoIndex.mu.Lock()
	globalGeoIndex.points = points
	globalGeoIndex.ready = true
	globalGeoIndex.mu.Unlock()

	return nil
}

func parseFloat(s string) float64 {
	var result float64
	var neg bool
	i := 0

	if len(s) > 0 && s[0] == '-' {
		neg = true
		i = 1
	}

	for ; i < len(s); i++ {
		if s[i] == '.' {
			break
		}
		result = result*10 + float64(s[i]-'0')
	}

	if i < len(s) && s[i] == '.' {
		i++
		frac := 0.0
		div := 1.0
		for ; i < len(s); i++ {
			frac = frac*10 + float64(s[i]-'0')
			div *= 10
		}
		result += frac / div
	}

	if neg {
		return -result
	}
	return result
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

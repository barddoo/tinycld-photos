import { describe, expect, it } from 'vitest'
import { filterPhotosByText, mergeSearchResults } from '~/tinycld/photos/lib/search-utils'
import { photoView } from './helpers'

describe('filterPhotosByText', () => {
    const photos = [
        photoView('p1', { name: 'Beach Sunset', description: '', location: '' }),
        photoView('p2', { name: 'Family Dinner', description: 'Birthday party', location: '' }),
        photoView('p3', { name: 'Mountain Trip', description: '', location: 'Chamonix, France' }),
        photoView('p4', { name: 'Office', description: '', location: '' }),
    ]

    it('matches on the name field (case-insensitive)', () => {
        const result = filterPhotosByText(photos, 'beach')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p1')
    })

    it('matches on the description field', () => {
        const result = filterPhotosByText(photos, 'birthday')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p2')
    })

    it('matches on the location field', () => {
        const result = filterPhotosByText(photos, 'chamonix')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p3')
    })

    it('is case-insensitive for uppercase query', () => {
        const result = filterPhotosByText(photos, 'BEACH')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p1')
    })

    it('returns [] for an empty query string', () => {
        expect(filterPhotosByText(photos, '')).toEqual([])
    })

    it('returns [] for a whitespace-only query', () => {
        expect(filterPhotosByText(photos, '   ')).toEqual([])
    })

    it('returns [] when no photos match', () => {
        expect(filterPhotosByText(photos, 'xyzzy-no-match')).toEqual([])
    })

    it('can match multiple photos with a shared term', () => {
        const result = filterPhotosByText(photos, 'trip')
        expect(result.map(p => p.id)).toContain('p3')
    })

    it('does not mutate the input array', () => {
        const input = [photoView('p1', { name: 'Beach' })]
        const originalLength = input.length
        filterPhotosByText(input, 'beach')
        expect(input).toHaveLength(originalLength)
    })
})

describe('mergeSearchResults', () => {
    const allPhotos = [
        photoView('p1', { name: 'Beach' }),
        photoView('p2', { name: 'Mountain' }),
        photoView('p3', { name: 'City' }),
        photoView('p4', { name: 'Forest' }),
    ]

    it('returns ftsResults unchanged when semanticResults is empty', () => {
        const ftsResults = [allPhotos[0], allPhotos[1]]
        const merged = mergeSearchResults(allPhotos, [], ftsResults)
        expect(merged).toEqual(ftsResults)
    })

    it('semantic results come first', () => {
        const semanticResults = [{ id: 'p3', score: 0.95 }, { id: 'p4', score: 0.8 }]
        const ftsResults = [allPhotos[0]]
        const merged = mergeSearchResults(allPhotos, semanticResults, ftsResults)
        expect(merged[0].id).toBe('p3')
        expect(merged[1].id).toBe('p4')
    })

    it('FTS-only results come after semantic results', () => {
        const semanticResults = [{ id: 'p3', score: 0.95 }]
        const ftsResults = [allPhotos[0], allPhotos[2]]
        const merged = mergeSearchResults(allPhotos, semanticResults, ftsResults)
        const ids = merged.map(p => p.id)
        expect(ids[0]).toBe('p3')
        expect(ids).toContain('p1')
        expect(ids.filter(id => id === 'p3')).toHaveLength(1)
    })

    it('photos in both semantic and FTS appear only once (in semantic slot)', () => {
        const semanticResults = [{ id: 'p1', score: 0.9 }]
        const ftsResults = [allPhotos[0], allPhotos[1]]
        const merged = mergeSearchResults(allPhotos, semanticResults, ftsResults)
        const p1Count = merged.filter(p => p.id === 'p1').length
        expect(p1Count).toBe(1)
    })

    it('returns only semantic photos when ftsResults is empty', () => {
        const semanticResults = [{ id: 'p2', score: 0.85 }]
        const merged = mergeSearchResults(allPhotos, semanticResults, [])
        expect(merged).toHaveLength(1)
        expect(merged[0].id).toBe('p2')
    })

    it('returns [] when both semantic and fts have no results', () => {
        const merged = mergeSearchResults(allPhotos, [], [])
        expect(merged).toEqual([])
    })
})

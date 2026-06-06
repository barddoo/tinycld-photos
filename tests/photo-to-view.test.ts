import { describe, expect, it } from 'vitest'
import { photoToView, toPhotoViews } from '~/tinycld/photos/lib/photo-utils'
import { photoItem } from './helpers'

describe('photoToView', () => {
    it('maps all snake_case fields to camelCase counterparts', () => {
        const item = photoItem('p1', {
            taken_at: '2024-06-01T12:00:00Z',
            mime_type: 'image/png',
            is_favorite: true,
            trashed_at: '',
            live_photo_pair_id: 'pair-1',
            search_text: 'beach sunset',
            perceptual_hash: 'abc123',
            ml_status: 'processing',
            camera_make: 'Apple',
            camera_model: 'iPhone 15',
            lens_model: '5mm',
            focal_length: '26mm',
        })

        const view = photoToView(item)

        expect(view.id).toBe('p1')
        expect(view.takenAt).toBe('2024-06-01T12:00:00Z')
        expect(view.mimeType).toBe('image/png')
        expect(view.isFavorite).toBe(true)
        expect(view.trashedAt).toBe('')
        expect(view.livePhotoPairId).toBe('pair-1')
        expect(view.searchText).toBe('beach sunset')
        expect(view.perceptualHash).toBe('abc123')
        expect(view.mlStatus).toBe('processing')
        expect(view.cameraMake).toBe('Apple')
        expect(view.cameraModel).toBe('iPhone 15')
        expect(view.lensModel).toBe('5mm')
        expect(view.focalLength).toBe('26mm')
    })

    it('preserves null for latitude and longitude', () => {
        const view = photoToView(photoItem('p1', { latitude: null, longitude: null }))
        expect(view.latitude).toBeNull()
        expect(view.longitude).toBeNull()
    })

    it('maps numeric latitude/longitude when present', () => {
        const view = photoToView(photoItem('p1', { latitude: 48.8566, longitude: 2.3522 }))
        expect(view.latitude).toBe(48.8566)
        expect(view.longitude).toBe(2.3522)
    })

    it('maps numeric dimensions and size', () => {
        const view = photoToView(photoItem('p1', { width: 3840, height: 2160, size: 10485760 }))
        expect(view.width).toBe(3840)
        expect(view.height).toBe(2160)
        expect(view.size).toBe(10485760)
    })
})

describe('toPhotoViews', () => {
    it('returns [] for null input', () => {
        expect(toPhotoViews(null)).toEqual([])
    })

    it('returns [] for undefined input', () => {
        expect(toPhotoViews(undefined)).toEqual([])
    })

    it('returns [] for empty array', () => {
        expect(toPhotoViews([])).toEqual([])
    })

    it('skips null elements inside the array', () => {
        const result = toPhotoViews([null, photoItem('p1'), undefined])
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p1')
    })

    it('skips items where trashed_at is set', () => {
        const items = [
            photoItem('p1'),
            photoItem('p2', { trashed_at: '2024-01-01T00:00:00Z' }),
            photoItem('p3'),
        ]
        const result = toPhotoViews(items)
        expect(result.map(p => p.id)).toEqual(['p1', 'p3'])
    })

    it('deduplicates by id — second occurrence is dropped', () => {
        const items = [photoItem('p1'), photoItem('p1'), photoItem('p2')]
        const result = toPhotoViews(items)
        expect(result).toHaveLength(2)
        expect(result.map(p => p.id)).toEqual(['p1', 'p2'])
    })

    it('preserves input order for non-trashed, non-duplicate items', () => {
        const items = [photoItem('c'), photoItem('a'), photoItem('b')]
        const result = toPhotoViews(items)
        expect(result.map(p => p.id)).toEqual(['c', 'a', 'b'])
    })

    it('does not mutate the input array', () => {
        const items = [photoItem('p1'), photoItem('p2')]
        const original = items.map(i => i.id)
        toPhotoViews(items)
        expect(items.map(i => i.id)).toEqual(original)
    })

    it('converts all non-trashed items to views', () => {
        const items = [photoItem('p1', { is_favorite: true }), photoItem('p2')]
        const result = toPhotoViews(items)
        expect(result[0].isFavorite).toBe(true)
    })
})

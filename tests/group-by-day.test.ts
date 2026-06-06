import { describe, expect, it } from 'vitest'
import { formatDateLabel, groupByDay } from '~/tinycld/photos/lib/photo-utils'
import { photoView } from './helpers'

describe('formatDateLabel', () => {
    it('returns "Today" for today\'s ISO date string', () => {
        const todayStr = new Date().toISOString().slice(0, 10)
        expect(formatDateLabel(todayStr)).toBe('Today')
    })

    it('returns "Yesterday" for yesterday\'s date', () => {
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        expect(formatDateLabel(yesterdayStr)).toBe('Yesterday')
    })

    it('returns a formatted long date for an older date', () => {
        const label = formatDateLabel('2000-01-15')
        expect(label).toContain('2000')
        expect(label).not.toBe('Today')
        expect(label).not.toBe('Yesterday')
    })

    it('does not crash for the "unknown" sentinel key', () => {
        expect(() => formatDateLabel('unknown')).not.toThrow()
    })
})

describe('groupByDay', () => {
    it('returns [] for empty input', () => {
        expect(groupByDay([])).toEqual([])
    })

    it('photos with the same date land in the same segment', () => {
        const photos = [
            photoView('p1', { takenAt: '2024-03-10T08:00:00Z' }),
            photoView('p2', { takenAt: '2024-03-10T18:00:00Z' }),
        ]
        const segments = groupByDay(photos)
        expect(segments).toHaveLength(1)
        expect(segments[0].date).toBe('2024-03-10')
        expect(segments[0].photos).toHaveLength(2)
    })

    it('photos with different dates produce separate segments', () => {
        const photos = [
            photoView('p1', { takenAt: '2024-03-10T08:00:00Z' }),
            photoView('p2', { takenAt: '2024-03-11T08:00:00Z' }),
        ]
        const segments = groupByDay(photos)
        expect(segments).toHaveLength(2)
    })

    it('segments are sorted newest-date-first', () => {
        const photos = [
            photoView('p1', { takenAt: '2024-01-01T00:00:00Z' }),
            photoView('p2', { takenAt: '2024-06-15T00:00:00Z' }),
            photoView('p3', { takenAt: '2023-12-31T00:00:00Z' }),
        ]
        const segments = groupByDay(photos)
        expect(segments[0].date).toBe('2024-06-15')
        expect(segments[1].date).toBe('2024-01-01')
        expect(segments[2].date).toBe('2023-12-31')
    })

    it('photos without a takenAt value are grouped under "unknown"', () => {
        const photos = [
            photoView('p1', { takenAt: '' }),
            photoView('p2', { takenAt: '2024-03-10T08:00:00Z' }),
        ]
        const segments = groupByDay(photos)
        const unknownSegment = segments.find(s => s.date === 'unknown')
        expect(unknownSegment).toBeDefined()
        expect(unknownSegment?.photos).toHaveLength(1)
        expect(unknownSegment?.photos[0].id).toBe('p1')
    })

    it('each segment has a non-empty label', () => {
        const photos = [photoView('p1', { takenAt: '2024-03-10T08:00:00Z' })]
        const segments = groupByDay(photos)
        expect(segments[0].label.length).toBeGreaterThan(0)
    })

    it('preserves order of photos within a segment', () => {
        const photos = [
            photoView('p1', { takenAt: '2024-03-10T18:00:00Z' }),
            photoView('p2', { takenAt: '2024-03-10T08:00:00Z' }),
        ]
        const segments = groupByDay(photos)
        expect(segments[0].photos.map(p => p.id)).toEqual(['p1', 'p2'])
    })
})

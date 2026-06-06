import { describe, expect, it } from 'vitest'
import {
    filterVisiblePeople,
    toPersonView,
    uniquePhotoIds,
} from '~/tinycld/photos/lib/people-utils'
import { photoFace, photoPerson } from './helpers'

describe('toPersonView', () => {
    it('maps id and name', () => {
        const person = photoPerson('per-1', { name: 'Alice' })
        const view = toPersonView(person)
        expect(view.id).toBe('per-1')
        expect(view.name).toBe('Alice')
    })

    it('maps thumbnail_face to thumbnailFace, preserving null', () => {
        const view = toPersonView(photoPerson('per-1', { thumbnail_face: null }))
        expect(view.thumbnailFace).toBeNull()
    })

    it('maps thumbnail_face to thumbnailFace when set', () => {
        const view = toPersonView(photoPerson('per-1', { thumbnail_face: 'face-42' }))
        expect(view.thumbnailFace).toBe('face-42')
    })

    it('maps is_hidden to isHidden', () => {
        const view = toPersonView(photoPerson('per-1', { is_hidden: true }))
        expect(view.isHidden).toBe(true)
    })

    it('maps birth_date to birthDate, preserving null', () => {
        const view = toPersonView(photoPerson('per-1', { birth_date: null }))
        expect(view.birthDate).toBeNull()
    })

    it('maps birth_date to birthDate when set', () => {
        const view = toPersonView(photoPerson('per-1', { birth_date: '1990-05-20' }))
        expect(view.birthDate).toBe('1990-05-20')
    })

    it('maps color, preserving null', () => {
        const view = toPersonView(photoPerson('per-1', { color: null }))
        expect(view.color).toBeNull()
    })

    it('maps color when set', () => {
        const view = toPersonView(photoPerson('per-1', { color: '#e74c3c' }))
        expect(view.color).toBe('#e74c3c')
    })

    it('sets photoCount to 0 (computed elsewhere)', () => {
        const view = toPersonView(photoPerson('per-1'))
        expect(view.photoCount).toBe(0)
    })

    it('coerces undefined thumbnail_face to null via || null', () => {
        const person = photoPerson('per-1')
        person.thumbnail_face = undefined as unknown as null
        const view = toPersonView(person)
        expect(view.thumbnailFace).toBeNull()
    })
})

describe('filterVisiblePeople', () => {
    it('returns only non-hidden people', () => {
        const people = [
            photoPerson('p1', { is_hidden: false }),
            photoPerson('p2', { is_hidden: true }),
            photoPerson('p3', { is_hidden: false }),
        ]
        const visible = filterVisiblePeople(people)
        expect(visible.map(p => p.id)).toEqual(['p1', 'p3'])
    })

    it('returns [] when all people are hidden', () => {
        const people = [
            photoPerson('p1', { is_hidden: true }),
            photoPerson('p2', { is_hidden: true }),
        ]
        expect(filterVisiblePeople(people)).toEqual([])
    })

    it('returns all when none are hidden', () => {
        const people = [photoPerson('p1'), photoPerson('p2')]
        expect(filterVisiblePeople(people)).toHaveLength(2)
    })

    it('returns [] for empty input', () => {
        expect(filterVisiblePeople([])).toEqual([])
    })

    it('does not mutate the input array', () => {
        const people = [photoPerson('p1'), photoPerson('p2', { is_hidden: true })]
        const original = people.map(p => p.id)
        filterVisiblePeople(people)
        expect(people.map(p => p.id)).toEqual(original)
    })
})

describe('uniquePhotoIds', () => {
    it('returns unique photo IDs from an array of faces', () => {
        const faces = [
            photoFace('f1', 'photo-a'),
            photoFace('f2', 'photo-b'),
            photoFace('f3', 'photo-a'),
        ]
        const ids = uniquePhotoIds(faces)
        expect(ids).toHaveLength(2)
        expect(ids).toContain('photo-a')
        expect(ids).toContain('photo-b')
    })

    it('returns [] for empty input', () => {
        expect(uniquePhotoIds([])).toEqual([])
    })

    it('returns a single ID when all faces point to one photo', () => {
        const faces = [
            photoFace('f1', 'photo-x'),
            photoFace('f2', 'photo-x'),
            photoFace('f3', 'photo-x'),
        ]
        expect(uniquePhotoIds(faces)).toEqual(['photo-x'])
    })

    it('preserves insertion order (first occurrence wins)', () => {
        const faces = [
            photoFace('f1', 'photo-b'),
            photoFace('f2', 'photo-a'),
            photoFace('f3', 'photo-b'),
        ]
        const ids = uniquePhotoIds(faces)
        expect(ids[0]).toBe('photo-b')
        expect(ids[1]).toBe('photo-a')
    })

    it('handles a face assigned to a person (person does not affect photo deduplication)', () => {
        const faces = [
            photoFace('f1', 'photo-a', { person: 'person-1' }),
            photoFace('f2', 'photo-a', { person: 'person-2' }),
        ]
        expect(uniquePhotoIds(faces)).toHaveLength(1)
    })
})

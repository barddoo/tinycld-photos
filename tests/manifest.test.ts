import { describe, expect, it } from 'vitest'
import manifest from '../manifest'

describe('photos manifest', () => {
    it('declares required identifiers', () => {
        expect(manifest.name).toBe('Photos')
        expect(manifest.slug).toBe('photos')
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('has a description', () => {
        expect(manifest.description).toBe('Photos for your organization')
    })
})

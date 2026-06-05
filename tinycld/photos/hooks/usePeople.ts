import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { PersonView, PhotosFace, PhotosPerson } from '../types'

export function usePeople() {
    const [peopleStore] = useStore('photos_people')

    const { data: people, isLoading } = useOrgLiveQuery(
        (q, { orgId }) =>
            q
                .from({ p: peopleStore })
                .where(({ p }) => eq(p.org, orgId))
                .orderBy(({ p }) => p.name, 'asc'),
    )

    const viewModels = useMemo<PersonView[]>(() => {
        if (!people) return []
        return people
            .filter((p: PhotosPerson) => !p.is_hidden)
            .map((p: PhotosPerson) => ({
                id: p.id,
                name: p.name,
                thumbnailFace: p.thumbnail_face || null,
                isHidden: p.is_hidden || false,
                birthDate: p.birth_date || null,
                color: p.color || null,
                photoCount: 0,
            }))
    }, [people])

    return { people: viewModels, isLoading }
}

export function usePersonPhotos(personId: string) {
    const [facesStore] = useStore('photos_faces')

    const { data: faces, isLoading } = useOrgLiveQuery(
        (q, { orgId }) =>
            q
                .from({ f: facesStore })
                .where(({ f }) => eq(f.person, personId)),
        [personId],
    )

    const photoIds = useMemo(() => {
        if (!faces) return []
        return [...new Set(faces.map((f: PhotosFace) => f.photo))]
    }, [faces])

    return { photoIds, isLoading }
}

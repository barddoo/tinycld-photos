import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import { filterVisiblePeople, toPersonView, uniquePhotoIds } from '../lib/people-utils'
import type { PersonView, PhotoItem, PhotosFace, PhotosPerson } from '../types'

export { filterVisiblePeople, toPersonView, uniquePhotoIds } from '../lib/people-utils'

export function usePeople() {
    const [peopleStore] = useStore('photos_people')
    const [facesStore] = useStore('photos_faces')
    const [photosStore] = useStore('photos_items')

    const { data: people, isLoading } = useOrgLiveQuery((q, { orgId }) =>
        q
            .from({ p: peopleStore })
            .where(({ p }) => eq(p.org, orgId))
            .orderBy(({ p }) => p.name, 'asc')
    )

    const { data: faces } = useOrgLiveQuery(q => q.from({ f: facesStore }))

    const { data: photos } = useOrgLiveQuery((q, { orgId }) =>
        q.from({ p: photosStore }).where(({ p }) => eq(p.org, orgId))
    )

    const faceToPhotoMap = useMemo(() => {
        const map = new Map<string, PhotoItem>()
        if (!faces || !photos) return map
        const photoMap = new Map((photos as PhotoItem[]).map(p => [p.id, p]))
        for (const f of faces as PhotosFace[]) {
            const photo = photoMap.get(f.photo)
            if (photo) map.set(f.id, photo)
        }
        return map
    }, [faces, photos])

    const viewModels = useMemo<PersonView[]>(() => {
        if (!people) return []
        return filterVisiblePeople(people as PhotosPerson[]).map(p => {
            const photo = p.thumbnail_face ? faceToPhotoMap.get(p.thumbnail_face) : null
            return toPersonView(p, photo?.id, photo?.file, photo?.thumbnail)
        })
    }, [people, faceToPhotoMap])

    return { people: viewModels, isLoading }
}

export function usePersonPhotos(personId: string) {
    const [facesStore] = useStore('photos_faces')

    const { data: faces, isLoading } = useOrgLiveQuery(
        q => q.from({ f: facesStore }).where(({ f }) => eq(f.person, personId)),
        [personId]
    )

    const photoIds = useMemo(() => {
        if (!faces) return []
        return uniquePhotoIds(faces as PhotosFace[])
    }, [faces])

    return { photoIds, isLoading }
}

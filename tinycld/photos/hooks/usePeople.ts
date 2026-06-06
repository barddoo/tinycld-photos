import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { PersonView, PhotosFace, PhotosPerson } from '../types'
import { filterVisiblePeople, toPersonView, uniquePhotoIds } from '../lib/people-utils'

export { filterVisiblePeople, toPersonView, uniquePhotoIds } from '../lib/people-utils'

export function usePeople() {
    const [peopleStore] = useStore('photos_people')

    const { data: people, isLoading } = useOrgLiveQuery((q, { orgId }) =>
        q
            .from({ p: peopleStore })
            .where(({ p }) => eq(p.org, orgId))
            .orderBy(({ p }) => p.name, 'asc')
    )

    const viewModels = useMemo<PersonView[]>(() => {
        if (!people) return []
        return filterVisiblePeople(people as PhotosPerson[]).map(toPersonView)
    }, [people])

    return { people: viewModels, isLoading }
}

export function usePersonPhotos(personId: string) {
    const [facesStore] = useStore('photos_faces')

    const { data: faces, isLoading } = useOrgLiveQuery(
        (q, { orgId }) => q.from({ f: facesStore }).where(({ f }) => eq(f.person, personId)),
        [personId]
    )

    const photoIds = useMemo(() => {
        if (!faces) return []
        return uniquePhotoIds(faces as PhotosFace[])
    }, [faces])

    return { photoIds, isLoading }
}

import type PocketBase from 'pocketbase'

function log(...args: unknown[]) {
    process.stdout.write(`[seed:photos] ${args.join(' ')}\n`)
}

interface SeedContext {
    user: { id: string; email: string; name: string }
    org: { id: string }
    userOrg: { id: string }
}

const SAMPLE_ALBUMS = [
    { name: 'Vacation 2025', description: 'Summer trip photos' },
    { name: 'Family', description: 'Family moments' },
    { name: 'Screenshots', description: 'Captures and screenshots' },
]

export default async function seed(pb: PocketBase, { org, userOrg }: SeedContext) {
    const existingAlbums = await pb.collection('photos_albums').getList(1, 1, {
        filter: `org = "${org.id}"`,
    })
    if (existingAlbums.totalItems > 0) {
        log(`Skipping (${existingAlbums.totalItems} albums already exist)`)
        return
    }

    for (const album of SAMPLE_ALBUMS) {
        log(`Creating album: ${album.name}`)
        await pb.collection('photos_albums').create({
            name: album.name,
            description: album.description,
            org: org.id,
            owner: userOrg.id,
        })
    }

    log(`Created ${SAMPLE_ALBUMS.length} albums (upload photos to populate them)`)
}

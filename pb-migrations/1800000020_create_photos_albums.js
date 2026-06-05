/// <reference path="../pb_data/types.d.ts" />
migrate(
    app => {
        const photosItemsId = app.findCollectionByNameOrId('photos_items').id
        const orgsId = app.findCollectionByNameOrId('orgs').id
        const userOrgId = app.findCollectionByNameOrId('user_org').id

        // Create photos_albums collection
        const albums = new Collection({
            name: 'photos_albums',
            type: 'base',
            listRule: 'org.user_org_via_org.user ?= @request.auth.id',
            viewRule: 'org.user_org_via_org.user ?= @request.auth.id',
            createRule: 'org.user_org_via_org.user ?= @request.auth.id',
            updateRule: 'org.user_org_via_org.user ?= @request.auth.id',
            deleteRule: 'org.user_org_via_org.user ?= @request.auth.id',
            fields: [
                {
                    name: 'name',
                    type: 'text',
                    required: true,
                    min: 1,
                    max: 200,
                },
                {
                    name: 'description',
                    type: 'text',
                    required: false,
                    max: 2000,
                },
                {
                    name: 'cover_photo',
                    type: 'relation',
                    required: false,
                    collectionId: photosItemsId,
                    maxSelect: 1,
                },
                {
                    name: 'org',
                    type: 'relation',
                    required: true,
                    collectionId: orgsId,
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    name: 'owner',
                    type: 'relation',
                    required: true,
                    collectionId: userOrgId,
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            indexes: [
                'CREATE INDEX `idx_photos_albums_org` ON `photos_albums` (`org`)',
            ],
        })
        app.save(albums)
        const albumsId = albums.id

        // Create photos_album_items join table
        const albumItems = new Collection({
            name: 'photos_album_items',
            type: 'base',
            listRule: 'album.org.user_org_via_org.user ?= @request.auth.id',
            viewRule: 'album.org.user_org_via_org.user ?= @request.auth.id',
            createRule: 'album.org.user_org_via_org.user ?= @request.auth.id',
            updateRule: 'album.org.user_org_via_org.user ?= @request.auth.id',
            deleteRule: 'album.org.user_org_via_org.user ?= @request.auth.id',
            fields: [
                {
                    name: 'album',
                    type: 'relation',
                    required: true,
                    collectionId: albumsId,
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    name: 'photo',
                    type: 'relation',
                    required: true,
                    collectionId: photosItemsId,
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    name: 'sort_order',
                    type: 'number',
                    required: false,
                    min: 0,
                },
                {
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
            ],
            indexes: [
                'CREATE UNIQUE INDEX `idx_photos_album_items_unique` ON `photos_album_items` (`album`, `photo`)',
                'CREATE INDEX `idx_photos_album_items_album_sort` ON `photos_album_items` (`album`, `sort_order` ASC)',
            ],
        })
        app.save(albumItems)
    },
    app => {
        const dropCollections = ['photos_album_items', 'photos_albums']
        for (const name of dropCollections) {
            try {
                const collection = app.findCollectionByNameOrId(name)
                app.delete(collection)
            } catch {
                // already gone
            }
        }
    }
)

/// <reference path="../pb_data/types.d.ts" />
migrate(
    app => {
        const collection = app.findCollectionByNameOrId('photos_items')
        const orgsId = app.findCollectionByNameOrId('orgs').id

        collection.fields.add(
            new Field({
                name: 'org',
                type: 'relation',
                required: true,
                collectionId: orgsId,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        collection.fields.add(
            new Field({
                name: 'file',
                type: 'file',
                required: true,
                maxSelect: 1,
                maxSize: 104857600,
                mimeTypes: [
                    'image/jpeg',
                    'image/png',
                    'image/webp',
                    'image/heic',
                    'image/heif',
                    'image/gif',
                    'image/avif',
                    'image/tiff',
                ],
            })
        )
        collection.fields.add(
            new Field({
                name: 'thumbnail',
                type: 'file',
                required: false,
                maxSelect: 1,
                maxSize: 10485760,
            })
        )
        collection.fields.add(
            new Field({
                name: 'taken_at',
                type: 'date',
                required: false,
            })
        )
        collection.fields.add(
            new Field({
                name: 'width',
                type: 'number',
                required: false,
                min: 0,
            })
        )
        collection.fields.add(
            new Field({
                name: 'height',
                type: 'number',
                required: false,
                min: 0,
            })
        )
        collection.fields.add(
            new Field({
                name: 'size',
                type: 'number',
                required: true,
                min: 0,
            })
        )
        collection.fields.add(
            new Field({
                name: 'mime_type',
                type: 'text',
                required: true,
                max: 255,
            })
        )
        collection.fields.add(
            new Field({
                name: 'description',
                type: 'text',
                required: false,
                max: 2000,
            })
        )
        collection.fields.add(
            new Field({
                name: 'is_favorite',
                type: 'bool',
            })
        )
        collection.fields.add(
            new Field({
                name: 'trashed_at',
                type: 'date',
                required: false,
            })
        )

        const orgMemberRule = 'org.user_org_via_org.user ?= @request.auth.id'
        collection.listRule = orgMemberRule
        collection.viewRule = orgMemberRule
        collection.createRule = orgMemberRule
        collection.updateRule = orgMemberRule
        collection.deleteRule = orgMemberRule

        collection.indexes = collection.indexes.concat([
            'CREATE INDEX `idx_photos_items_org` ON `photos_items` (`org`)',
            'CREATE INDEX `idx_photos_items_taken_at` ON `photos_items` (`taken_at` DESC)',
            'CREATE INDEX `idx_photos_items_org_taken_at` ON `photos_items` (`org`, `taken_at` DESC)',
        ])

        app.save(collection)
    },
    app => {
        const collection = app.findCollectionByNameOrId('photos_items')

        const dropFields = [
            'org',
            'file',
            'thumbnail',
            'taken_at',
            'width',
            'height',
            'size',
            'mime_type',
            'description',
            'is_favorite',
            'trashed_at',
        ]
        for (const name of dropFields) {
            const field = collection.fields.find(f => f.name === name)
            if (field) collection.fields.remove(field)
        }

        collection.listRule = 'owner.user = @request.auth.id'
        collection.viewRule = 'owner.user = @request.auth.id'
        collection.createRule = 'owner.user = @request.auth.id'
        collection.updateRule = 'owner.user = @request.auth.id'
        collection.deleteRule = 'owner.user = @request.auth.id'

        app.save(collection)
    }
)

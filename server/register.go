package photos

import (
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"

	"tinycld.org/core/audit"
	"tinycld.org/core/userorg"
)

func Register(app *pocketbase.PocketBase) {
	userorg.RegisterReassignable(userorg.ReassignableRef{
		Collection: "photos_items",
		Field:      "owner",
	})
	userorg.RegisterReassignable(userorg.ReassignableRef{
		Collection: "photos_albums",
		Field:      "owner",
	})

	audit.RegisterCollection(app, "photos_items", &audit.CollectionConfig{
		ExtractLabel: audit.LabelFromField("name"),
	})
	audit.RegisterCollection(app, "photos_albums", &audit.CollectionConfig{
		ExtractLabel: audit.LabelFromField("name"),
		ResolveOrg: func(a core.App, record *core.Record) string {
			albumID := record.GetString("album")
			if albumID == "" {
				return ""
			}
			return audit.ResolveViaRelation(a, "photos_albums", albumID, "org")
		},
	})

	app.OnRecordCreate("photos_items").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		routine.FireAndForget(func() {
			extractImageMetadata(app, e.Record)
		})

		return nil
	})

	app.OnRecordAfterUpdateSuccess("photos_items").BindFunc(func(e *core.RecordEvent) error {
		oldFile := e.Record.Original().GetString("file")
		newFile := e.Record.GetString("file")
		if oldFile == newFile {
			return nil
		}

		routine.FireAndForget(func() {
			extractImageMetadata(app, e.Record)
		})

		return nil
	})

	app.OnRecordAfterDeleteSuccess("photos_items").BindFunc(func(e *core.RecordEvent) error {
		routine.FireAndForget(func() {
			deletePhotoFiles(app, e.Record)
		})

		return nil
	})
}

func deletePhotoFiles(app *pocketbase.PocketBase, record *core.Record) {
	fsys, err := app.NewFilesystem()
	if err != nil {
		app.Logger().Warn("deletePhotoFiles: failed to open filesystem", "id", record.Id, "error", err)
		return
	}
	defer fsys.Close()

	basePath := record.BaseFilesPath()

	if file := record.GetString("file"); file != "" {
		if err := fsys.Delete(basePath + "/" + file); err != nil {
			app.Logger().Warn("deletePhotoFiles: failed to delete file", "id", record.Id, "file", file, "error", err)
		}
	}

	if thumb := record.GetString("thumbnail"); thumb != "" {
		if err := fsys.Delete(basePath + "/" + thumb); err != nil {
			app.Logger().Warn("deletePhotoFiles: failed to delete thumbnail", "id", record.Id, "thumb", thumb, "error", err)
		}
	}
}

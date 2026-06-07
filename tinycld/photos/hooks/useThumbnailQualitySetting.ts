import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { mutation, useMutation } from "@tinycld/core/lib/mutations";
import { useStore } from "@tinycld/core/lib/pocketbase";
import { useOrgInfo } from "@tinycld/core/lib/use-org-info";
import { newRecordId } from "pbtsdb/core";
import { useCallback } from "react";

export type ThumbnailQualityMode = "high" | "optimized";

const APP = "photos";
const KEY = "thumbnail_quality_mode";

export function useThumbnailQualitySetting() {
	const { orgId } = useOrgInfo();
	const [settingsCollection] = useStore("settings");

	const { data: rows } = useLiveQuery(
		(query) =>
			query
				.from({ settings: settingsCollection })
				.where(({ settings }) =>
					and(
						eq(settings.app, APP),
						eq(settings.key, KEY),
						eq(settings.org, orgId ?? ""),
					),
				),
		[orgId],
	);

	const existing = rows?.[0];
	const mode: ThumbnailQualityMode = existing
		? (existing.value as ThumbnailQualityMode)
		: "optimized";

	const upsert = useMutation({
		mutationFn: mutation(function* (newMode: ThumbnailQualityMode) {
			if (!orgId) return;
			if (existing) {
				yield settingsCollection.update(existing.id, (draft) => {
					draft.value = newMode;
				});
			} else {
				yield settingsCollection.insert({
					id: newRecordId(),
					app: APP,
					key: KEY,
					value: newMode,
					org: orgId,
				});
			}
		}),
	});

	const setMode = useCallback(
		(m: ThumbnailQualityMode) => {
			upsert.mutate(m);
		},
		[upsert],
	);

	return { mode, setMode };
}

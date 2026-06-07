import { describe, expect, it } from "vitest";
import manifest from "../manifest";

describe("photos manifest", () => {
	it("declares required identifiers", () => {
		expect(manifest.name).toBe("Photos");
		expect(manifest.slug).toBe("photos");
		expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("has a description", () => {
		expect(manifest.description).toBe("Photos for your organization");
	});

	it("points routes directory at screens", () => {
		expect(manifest.routes?.directory).toBe("screens");
	});

	it("declares public routes directory", () => {
		expect(manifest.publicRoutes?.directory).toBe("public-screens");
	});

	it("declares migrations, collections, and seed", () => {
		expect(manifest.migrations?.directory).toBe("pb-migrations");
		expect(manifest.collections?.register).toBe("collections");
		expect(manifest.collections?.types).toBe("types");
		expect(manifest.seed?.script).toBe("seed");
	});

	it("declares a nav entry with label, icon, and order", () => {
		expect(manifest.nav?.label).toBe("Photos");
		expect(manifest.nav?.icon).toBe("aperture");
		expect(typeof manifest.nav?.order).toBe("number");
		expect(typeof manifest.nav?.shortcut).toBe("string");
	});

	it("declares a server module", () => {
		expect(manifest.server?.package).toBe("server");
		expect(manifest.server?.module).toBe("tinycld.org/packages/photos");
	});

	it("declares sidebar and provider components", () => {
		expect(manifest.sidebar?.component).toBe("sidebar");
		expect(manifest.provider?.component).toBe("provider");
	});

	it("declares settings pages for ML and storage", () => {
		expect(Array.isArray(manifest.settings)).toBe(true);
		expect(manifest.settings?.length).toBeGreaterThan(0);
		const slugs = manifest.settings?.map((s) => s.slug) ?? [];
		expect(slugs).toContain("photos-ml");
		expect(slugs).toContain("photos-storage");
	});
});

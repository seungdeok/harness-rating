import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import pkg from "../package.json" with { type: "json" };

test("--version prints the package version", () => {
	const out = execFileSync(process.execPath, ["src/cli.ts", "--version"], {
		encoding: "utf8",
	});
	expect(out.trim()).toBe(pkg.version);
});

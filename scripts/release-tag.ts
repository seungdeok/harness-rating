import { appendFileSync, readFileSync } from "node:fs";

const INTEGER = "(?:0|[1-9][0-9]*)";
const VERSION = `${INTEGER}\\.${INTEGER}\\.${INTEGER}`;

/** Stable releases only; reserved test tags can never authorize publication. */
export function releaseMode(
	tag: string,
	version: string,
): "publish" | "dry-run" {
	if (!new RegExp(`^${VERSION}$`).test(version)) {
		throw new Error("Release package version must be stable major.minor.patch");
	}
	if (tag === `v${version}`) return "publish";
	const testTag = tag.match(
		new RegExp(`^v(${VERSION})-dry-run\\.${INTEGER}(?:\\.${INTEGER})*$`),
	);
	if (testTag?.[1] === version) return "dry-run";
	throw new Error(
		`Tag must be v${version} or v${version}-dry-run.<numeric identifier(s)>`,
	);
}

if (import.meta.main) {
	try {
		const { version } = JSON.parse(readFileSync("package.json", "utf8"));
		const mode = releaseMode(process.env.RELEASE_TAG ?? "", version);
		if (!process.env.GITHUB_OUTPUT)
			throw new Error("GITHUB_OUTPUT is required");
		appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
		console.log(`Release mode: ${mode}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

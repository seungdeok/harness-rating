#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { version } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const { values } = parseArgs({
	options: { version: { type: "boolean", short: "v" } },
});

if (values.version) {
	console.log(version);
} else {
	// ponytail: scanning lands in later issues; until then only --version works
	console.error(
		"harness-rating: scanning is not implemented yet. Use --version.",
	);
	process.exitCode = 2;
}

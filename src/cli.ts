#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildReport, type Report } from "./report/build.ts";
import { toJson } from "./report/json.ts";
import { renderExplain, renderTerminal } from "./report/terminal.ts";
import { loadRubric } from "./rubric/load.ts";
import { walk } from "./scan/walk.ts";

// Exit codes: 0 pass, 1 below --min-level, 2 usage or scan error.
const USAGE = `Usage: harness-rating [path] [--json <file>] [--min-level <0-4>] [--explain <check>]`;

function main(argv: string[]): number {
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (error) {
		console.error(`harness-rating: ${(error as Error).message}\n${USAGE}`);
		return 2;
	}
	const { values, positionals, minLevel } = parsed;
	const root = fileURLToPath(new URL("..", import.meta.url));
	const { version } = JSON.parse(
		readFileSync(`${root}package.json`, "utf8"),
	) as { version: string };

	if (values.version) {
		console.log(version);
		return 0;
	}
	if (values.help) {
		console.log(USAGE);
		return 0;
	}

	const rubric = loadRubric(`${root}rubric/v0.1.yaml`);

	if (values.explain !== undefined) {
		const id = values.explain.toUpperCase();
		const check = rubric.checks.find((c) => c.id === id);
		if (!check) {
			console.error(`harness-rating: no check ${values.explain}\n${USAGE}`);
			return 2;
		}
		process.stdout.write(renderExplain(check));
		return 0;
	}

	const target = positionals[0] ?? ".";
	let report: Report;
	try {
		report = buildReport(walk(target), rubric, version);
	} catch (error) {
		console.error(
			`harness-rating: cannot scan ${target}: ${(error as Error).message}`,
		);
		return 2;
	}

	if (values.json !== undefined) {
		try {
			writeFileSync(values.json, toJson(report));
		} catch (error) {
			console.error(`harness-rating: ${(error as Error).message}`);
			return 2;
		}
	}
	process.stdout.write(renderTerminal(report, rubric, target));

	if (report.level < minLevel) {
		console.error(
			`harness-rating: L${report.level} is below the required L${minLevel}`,
		);
		return 1;
	}
	return 0;
}

function parse(argv: string[]) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			json: { type: "string" },
			"min-level": { type: "string" },
			explain: { type: "string" },
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (positionals.length > 1) throw new Error("expected at most one path");
	const minLevel = values["min-level"] ?? "0";
	if (!/^[0-4]$/.test(minLevel)) {
		throw new Error("--min-level must be an integer from 0 to 4");
	}
	return { values, positionals, minLevel: Number(minLevel) };
}

process.exitCode = main(process.argv.slice(2));

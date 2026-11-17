#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { validateRubric } from "./validate.ts";

let files = process.argv.slice(2);
if (files.length === 0) {
	try {
		files = readdirSync("rubric")
			.filter(
				(name) =>
					/\.(yaml|yml)$/.test(name) &&
					name !== "sources.yaml" &&
					name !== "sources.yml",
			)
			.sort()
			.map((name) => `rubric/${name}`);
		if (files.length === 0) throw new Error("No rubric YAML files found.");
	} catch (error) {
		console.error(
			`${error instanceof Error ? error.message : String(error)}\nFix: add a rubric/*.yaml file or pass an explicit rubric path.`,
		);
		process.exit(1);
	}
}

for (const file of files) {
	try {
		const document = parseDocument(readFileSync(resolve(file), "utf8"), {
			version: "1.2",
			uniqueKeys: true,
		});
		const problems = [...document.errors, ...document.warnings];
		if (problems.length > 0)
			throw new Error(problems.map((problem) => problem.message).join("\n"));
		const result = validateRubric(document.toJS({ maxAliasCount: 100 }));
		if (!result.valid) {
			console.error(`${file}:\n${result.errors.join("\n")}`);
			process.exitCode = 1;
		} else {
			console.log(`${file}: valid rubric v${result.rubric.version}`);
		}
	} catch (error) {
		console.error(
			`${file}: ${error instanceof Error ? error.message : String(error)}\nFix: provide a readable YAML/JSON rubric with valid syntax and unique keys.`,
		);
		process.exitCode = 1;
	}
}

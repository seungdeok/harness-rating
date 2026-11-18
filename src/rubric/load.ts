import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import type { Rubric } from "./types.ts";
import { type RubricValidation, validateRubric } from "./validate.ts";

/** Parses a YAML or JSON rubric file and validates it. Throws on syntax errors. */
export function parseRubricFile(path: string): RubricValidation {
	const document = parseDocument(readFileSync(path, "utf8"), {
		version: "1.2",
		uniqueKeys: true,
	});
	const problems = [...document.errors, ...document.warnings];
	if (problems.length > 0) {
		throw new Error(problems.map((problem) => problem.message).join("\n"));
	}
	return validateRubric(document.toJS({ maxAliasCount: 100 }));
}

/** Loads a rubric for the engine. Throws if it is unreadable or invalid. */
export function loadRubric(path: string): Rubric {
	const result = parseRubricFile(path);
	if (!result.valid) {
		throw new Error(`${path}: invalid rubric\n${result.errors.join("\n")}`);
	}
	return result.rubric;
}

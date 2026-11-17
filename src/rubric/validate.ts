import { createRequire } from "node:module";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { Requirement, Rubric } from "./types.ts";

const validateSchema: ValidateFunction<Rubric> = createRequire(import.meta.url)(
	"../../rubric/validate.cjs",
);

export type RubricValidation =
	| { valid: true; rubric: Rubric }
	| { valid: false; errors: string[] };

function isDate(value: string): boolean {
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return (
		Number.isFinite(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

function schemaError(error: ErrorObject, input: unknown): string {
	let path = error.instancePath;
	if (error.keyword === "required") path += `/${error.params.missingProperty}`;
	if (error.keyword === "additionalProperties")
		path += `/${error.params.additionalProperty}`;
	let context = "rubric";
	const match = /^\/checks\/(\d+)/.exec(path);
	if (
		match &&
		typeof input === "object" &&
		input !== null &&
		"checks" in input &&
		Array.isArray(input.checks)
	) {
		const index = Number(match[1]);
		const check = input.checks[index];
		context = `check ${typeof check?.id === "string" ? check.id : `at index ${index}`}`;
	}
	let fix = "Use the structure and values defined in rubric/schema.json.";
	switch (error.keyword) {
		case "required":
			fix = `Add ${error.params.missingProperty}.`;
			break;
		case "additionalProperties":
			fix = `Remove unsupported field ${error.params.additionalProperty}.`;
			break;
		case "minItems":
			fix = "Add at least one entry.";
			break;
		case "pattern":
			fix = `Use a value matching ${error.params.pattern}.`;
			break;
		case "const":
			fix = `Use ${JSON.stringify(error.params.allowedValue)}.`;
			break;
		case "enum":
			fix = `Use one of ${error.params.allowedValues.join(", ")}.`;
			break;
		case "type":
			fix = `Use a value of type ${error.params.type}.`;
			break;
		case "uniqueItems":
			fix = "Remove duplicate entries.";
			break;
	}
	return `${context} ${path || "/"}: ${error.message}. Fix: ${fix}`;
}

/** Validate parsed data without coercing, changing it, or accessing the network. */
export function validateRubric(input: unknown): RubricValidation {
	if (!validateSchema(input)) {
		return {
			valid: false,
			errors: (validateSchema.errors ?? []).map((error) =>
				schemaError(error, input),
			),
		};
	}
	const errors: string[] = [];
	if (!isDate(input.sources_version))
		errors.push(
			"rubric /sources_version: invalid calendar date. Fix: use a real date in YYYY-MM-DD format.",
		);
	const ids = new Set<string>();
	for (const check of input.checks) {
		if (ids.has(check.id))
			errors.push(
				`check ${check.id}: duplicate check ID. Fix: give each check a unique id and update its level references.`,
			);
		ids.add(check.id);
		const orgs = new Set(check.sources.map((source) => source.org));
		const expected = orgs.size >= 3 ? "A" : orgs.size === 2 ? "B" : "C";
		if (check.tier !== expected)
			errors.push(
				`check ${check.id} /tier: ${orgs.size} distinct organizations require tier ${expected}, not ${check.tier}. Fix: set tier to ${expected}; documents from the same org count once.`,
			);
		for (const [index, source] of check.sources.entries()) {
			if (!isDate(source.checked))
				errors.push(
					`check ${check.id} /sources/${index}/checked: invalid calendar date. Fix: use a real date in YYYY-MM-DD format.`,
				);
			try {
				new URL(source.url);
			} catch {
				errors.push(
					`check ${check.id} /sources/${index}/url: invalid URL. Fix: use a complete public HTTP or HTTPS URL.`,
				);
			}
		}
	}
	function visit(requirement: Requirement, path: string): void {
		if (typeof requirement === "string") {
			if (!ids.has(requirement))
				errors.push(
					`rubric ${path}: unknown check ID ${requirement}. Fix: add check ${requirement} or replace this reference with an existing check ID.`,
				);
			return;
		}
		const key = "any_of" in requirement ? "any_of" : "all_of";
		const children =
			"any_of" in requirement ? requirement.any_of : requirement.all_of;
		children.forEach((child, index) => {
			visit(child, `${path}/${key}/${index}`);
		});
	}
	for (const [level, value] of Object.entries(input.levels)) {
		value.requires.forEach((requirement, index) => {
			visit(requirement, `/levels/${level}/requires/${index}`);
		});
	}
	return errors.length > 0
		? { valid: false, errors }
		: { valid: true, rubric: input };
}

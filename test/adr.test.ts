import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Parallel branches once both added an ADR 0005; numbers must stay unique and gap-free.
test("ADR files are numbered 0001..N without duplicates or gaps, matching their titles", () => {
	const files = readdirSync("docs/adr")
		.filter((name) => /^\d{4}-/.test(name))
		.sort();
	const numbers = files.map((name) => Number(name.slice(0, 4)));
	expect(numbers).toEqual(numbers.map((_, index) => index + 1));
	for (const name of files) {
		const title = readFileSync(`docs/adr/${name}`, "utf8").split("\n")[0];
		expect(title, name).toMatch(new RegExp(`^# ADR ${name.slice(0, 4)}: `));
	}
});

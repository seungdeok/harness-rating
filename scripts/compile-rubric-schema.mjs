import { readFileSync, writeFileSync } from "node:fs";
import { Ajv } from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";

const schema = JSON.parse(
	readFileSync(new URL("../rubric/schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv({ allErrors: true, code: { source: true } });
const code = standaloneCode(ajv, ajv.compile(schema));
// Keep the shipped validator independent of Ajv and its runtime helpers.
if (/\brequire\(/.test(code)) {
	throw new Error(
		"The generated rubric validator must not require runtime dependencies.",
	);
}
writeFileSync(new URL("../rubric/validate.cjs", import.meta.url), code);

# Rubric validation

`schema.json` describes rubric files. Validation also checks distinct organization
counts, evidence tiers, real calendar dates, unique check IDs, and recursive level
references. Errors identify the check or level, field path, and suggested repair.

```sh
npm run validate:rubric
```

Without arguments the validator checks every `rubric/*.yaml` and `rubric/*.yml` file
except the source registry (`sources.yaml`, which has a different shape), and fails
if no rubric files exist. The public rubric is `v0.1.yaml`.

To check specific files:

```sh
npm run generate:rubric-validator
node src/rubric/validate-cli.ts ./company-rubric.yaml ./other-rubric.json
```

YAML is parsed as YAML 1.2. Duplicate keys, unsupported tags, malformed documents,
and excessive alias expansion fail validation. Quoting dates is optional.
Validation reads local data only; it does not fetch source URLs or verify the
substance or independence of recommendations. Those require source review.

Ajv is development-only. Build, test, and rubric-validation commands compile the
schema into an ignored standalone `validate.cjs`, which is included in the npm
package. The generator rejects runtime imports so JSON Schema validation adds no
runtime dependencies. After editing the schema, regenerate before running the
TypeScript entry point directly. Runtime engine loading remains out of scope.

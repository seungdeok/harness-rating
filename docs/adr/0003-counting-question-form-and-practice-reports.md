# ADR 0003: Prescriptive questions count as recommendations; reports of a team's own practice do not

- Status: Accepted
- Date: 2026-11-17
- Issue: #7

## Context

The [source rules](../spec/SPEC.md#source-rules) count a sentence only if it says what to do. Two kinds of sentence in the source list did not fit that rule cleanly while assigning tiers for rubric v0.1:

- Böckeler's timing guidance is written as questions that carry "should", for example "What type of drift accumulates gradually and should be monitored by sensors running continuously against the codebase, outside the change lifecycle?" It is the only source for F3.
- OpenAI's harness engineering article mostly reports what its team did, for example "we instruct Codex to review its own changes locally, request additional specific agent reviews". It is the only OpenAI text about E1.

## Decision

- A question that prescribes, using "should" or an equivalent, counts as an explicit recommendation.
- A description of what a team did, without saying others should do it, does not count. A sentence in the same document that does say what to do still counts.

## Rationale

A prescriptive question tells the reader where something belongs; it is guidance phrased for the reader to apply, not a feature description. A practice report shows what worked for one team, which the source rules already exclude when a product doc only says "X is supported". Counting reports would let any detailed case study raise tiers.

## Consequences

- SPEC § Source rules states both rules.
- In rubric v0.1, Böckeler counts for F1, F2, and F3, and OpenAI does not count for E1.

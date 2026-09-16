import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importState, nextActivity } from "./core.mjs";

const curriculum = JSON.parse(await readFile(new URL("curriculum.json", import.meta.url), "utf8"));
const legacy = JSON.parse(await readFile(new URL("questions.json", import.meta.url), "utf8"))
  .map((question) => ({ ...question, kind: question.kind === "diagnostic" ? "legacy-diagnostic" : question.kind }));
const learning = curriculum.objectives.flatMap((objective) => objective.questions.map((question) => ({
  ...question,
  domain: objective.domain,
  objective_codes: [objective.code],
  level: 3,
  kind: question.kind === "review" ? "review" : "practice",
  step: question.kind,
})));
const diagnostics = curriculum.objectives.slice(0, 40).map((objective, index) => ({
  ...objective.questions[1],
  id: `TEST-DIAG-${index}-${objective.code}`,
  domain: ["G", "R", "V", "P", "K"][Math.floor(index / 8)],
  objective_codes: [objective.code],
  level: 4,
  kind: "diagnostic",
}));
const questions = [...legacy, ...diagnostics, ...learning];
const source = JSON.parse(await readFile("/Users/casper.spruit@energyzero.nl/Downloads/rekenen-voortgang.json", "utf8"));
const state = importState(source, questions);
const next = nextActivity(state, questions, new Date("2026-09-16T18:00:00+02:00"));

assert.equal(state.diagnosticIndex, diagnostics.length, "oude nulmeting moet als afgerond migreren");
assert.equal(next.phase, "recovery");
assert.equal(next.objective, "K10");
assert.equal(next.question.id, "K10-guided");
assert.equal(curriculum.objectives.length, 58);
assert.equal(learning.length, 174);

const freshLevel4 = { learner: { id: "new", target_level: 4 }, attempts: [], diagnosticIndex: 0, mastery: [] };
assert.equal(nextActivity(freshLevel4, questions).question.id, "TEST-DIAG-0-B1", "niveau 4 start met de niveau-4-nulmeting");

const partialLegacySource = { ...source, attempts: source.attempts.slice(0, 1), diagnosticIndex: 1 };
const partialLegacy = importState(partialLegacySource, questions);
assert.equal(partialLegacy.diagnosticIndex, 1, "gedeeltelijke oude nulmeting mag niet als afgerond migreren");
assert.equal(nextActivity(partialLegacy, questions).phase, "diagnostic");

const app = await readFile(new URL("app.js", import.meta.url), "utf8");
for (const route of ["vandaag", "leren", "voortgang", "begeleider"]) assert(app.includes(route), `route ontbreekt: ${route}`);
for (const feature of ["localStorage", "importFile", "exportJson", "exportCsv"]) assert(app.includes(feature), `functie ontbreekt: ${feature}`);

console.log("integration: echte export hervat bij K10; 58 doelen, routes en opslagfuncties aanwezig");

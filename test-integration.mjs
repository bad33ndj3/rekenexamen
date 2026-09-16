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
// Expliciete 1/9-case (core.mjs:55-57): één oude poging + index 1 is onvoltooid.
const legacyDiagnosticIds = new Set(legacy.filter((question) => question.kind === "legacy-diagnostic").map((question) => question.id));
assert.equal(legacyDiagnosticIds.size, 9, "oude bank moet 9 legacy-diagnostic vragen hebben");
assert.equal(partialLegacySource.attempts.length, 1, "partiële bron heeft 1 van de 9 oude pogingen");
assert(partialLegacySource.attempts.every((attempt) => legacyDiagnosticIds.has(attempt.question_id)), "partiële poging is een oude nulmetingsvraag (1/9)");
assert.equal(partialLegacy.diagnosticIndex, 1, "gedeeltelijke oude nulmeting (1/9) mag niet als afgerond migreren");
assert.equal(nextActivity(partialLegacy, questions).phase, "diagnostic");
assert.equal(nextActivity(partialLegacy, questions).question.kind, "diagnostic", "1/9 hervat bij de nulmeting");

// Target 4 kiest aantoonbaar DIAG4-* (nulmeting) uit *-N4-001-inhoud (app.js:13-26 blueprint + level4ByCode).
const level4 = JSON.parse(await readFile(new URL("level4.json", import.meta.url), "utf8"));
const level4Practice = level4.questions.map((question) => ({
  ...question, domain: question.objective_code[0], objective_codes: [question.objective_code],
  level: 4, kind: "practice", step: "independent",
}));
const diagnosticBlueprint = {
  G: ["B1", "B2", "B4", "B5", "G1", "G2", "G3", "G5"],
  R: ["R1", "R3", "R5", "R6", "R9", "R10", "R11", "R13"],
  V: ["B6", "V1", "V2", "V3", "V4", "V5", "V6", "V7"],
  P: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
  K: ["K1", "K2", "K4", "K5", "K6", "K9", "K10", "K13"],
};
const level4ByCode = new Map(level4Practice.map((question) => [question.objective_codes[0], question]));
const level4Diagnostics = Object.entries(diagnosticBlueprint).flatMap(([domain, codes]) => codes.map((code, index) => ({
  ...level4ByCode.get(code), id: `DIAG4-${domain}-${index + 1}-${code}`, domain, kind: "diagnostic",
})));
assert.equal(level4Diagnostics.length, 40, "niveau-4-nulmeting heeft 40 DIAG4-vragen");
assert(level4Diagnostics.every((question) => question.id.startsWith("DIAG4-")), "niveau-4-nulmeting gebruikt DIAG4-* ids");
assert(level4Practice.every((question) => question.id.endsWith("-N4-001")), "niveau-4-vragen gebruiken *-N4-001 ids");
assert(level4Diagnostics.every((question) => question.prompt === level4ByCode.get(question.objective_codes[0]).prompt), "DIAG4-vraag hergebruikt *-N4-001-inhoud per doel");
const realLevel4Bank = [...legacy, ...level4Diagnostics, ...learning, ...level4Practice];
const freshRealLevel4 = { learner: { id: "new-l4", target_level: 4 }, attempts: [], diagnosticIndex: 0, mastery: [] };
const firstRealLevel4 = nextActivity(freshRealLevel4, realLevel4Bank);
assert.equal(firstRealLevel4.phase, "diagnostic", "niveau 4 start met de nulmeting");
assert.equal(firstRealLevel4.question.id, "DIAG4-G-1-B1", "nulmeting bij target 4 start met DIAG4-G-1-B1");
assert(level4Practice.some((question) => question.id === "B1-N4-001"), "niveau-4-bank bevat B1-N4-001");
assert(level4Practice.some((question) => question.id === "K10-N4-001"), "niveau-4-bank bevat K10-N4-001");

const app = await readFile(new URL("app.js", import.meta.url), "utf8");
for (const route of ["vandaag", "leren", "voortgang", "begeleider"]) assert(app.includes(route), `route ontbreekt: ${route}`);
for (const feature of ["localStorage", "importFile", "exportJson", "exportCsv"]) assert(app.includes(feature), `functie ontbreekt: ${feature}`);

console.log("integration: echte export hervat bij K10; 58 doelen, routes en opslagfuncties aanwezig");

// Echte proefexamenbank (zelfde opbouw als app.js:27-31): A en B elk 30 vragen,
// 6 per domein in G→R→V→P→K, zonder overlap.
import { examQuestionIds } from "./core.mjs";
const examObjectivesReal = { G: ["G1", "G2", "G3", "G4", "G5", "G7"], R: ["R3", "R5", "R6", "R10", "R11", "R13"], V: ["V1", "V2", "V3", "V4", "V5", "V6"], P: ["P1", "P2", "P3", "P4", "P5", "P7"], K: ["K2", "K4", "K6", "K9", "K10", "K13"] };
const examBankReal = ["A", "B"].flatMap((exam) => Object.entries(examObjectivesReal).flatMap(([domain, codes]) => codes.map((code, index) => {
  const source = curriculum.objectives.find((objective) => objective.code === code).questions.find((question) => question.kind === (exam === "A" ? "independent" : "review"));
  return { ...source, id: `EX-${exam}-${domain}-${index + 1}-${code}`, exam, domain, objective_codes: [code], level: 3, kind: "exam" };
})));
const examIdsA = examQuestionIds("A", examBankReal);
const examIdsB = examQuestionIds("B", examBankReal);
assert.equal(examIdsA.length, 30, "proefexamen A heeft 30 vragen");
assert.equal(examIdsB.length, 30, "proefexamen B heeft 30 vragen");
const byIdReal = new Map(examBankReal.map((question) => [question.id, question]));
for (const [label, ids] of [["A", examIdsA], ["B", examIdsB]]) {
  assert.deepEqual(ids.map((id) => byIdReal.get(id).domain), ["G", "G", "G", "G", "G", "G", "R", "R", "R", "R", "R", "R", "V", "V", "V", "V", "V", "V", "P", "P", "P", "P", "P", "P", "K", "K", "K", "K", "K", "K"], `proefexamen ${label} volgt G→R→V→P→K met 6 per domein`);
}
assert.equal(new Set([...examIdsA, ...examIdsB]).size, 60, "A en B overlappen niet");
for (const marker of ["startExam", "submitExam", "exams", "exam-timer", "richttijd", "Bewaar en stop"]) assert(app.includes(marker), `proefexamenfunctie ontbreekt in app.js: ${marker}`);
assert.match(app, /Vraag \$\{index \+ 1\} van \$\{total\}/, "positiebalk toont Vraag i van 30");
console.log("integration: proefexamens A/B elk 30 vragen (6 per domein G→R→V→P→K) zonder overlap");

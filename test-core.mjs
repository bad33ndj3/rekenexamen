import assert from "node:assert/strict";
import { importState, nextActivity, scoreAnswer } from "./core.mjs";

const questions = [
  { id: "B1-N3-001", domain: "B", objective_codes: ["B1"], level: 3, kind: "practice", type: "number", answer: 10, tolerance: 0 },
  { id: "G1-N3-001", domain: "G", objective_codes: ["G1"], level: 3, kind: "diagnostic", type: "choice", answer: "meter" },
  { id: "G3-N3-001", domain: "G", objective_codes: ["G3"], level: 3, kind: "diagnostic", type: "number", answer: 240, tolerance: 0 },
  { id: "R11-N3-001", domain: "R", objective_codes: ["R11"], level: 3, kind: "diagnostic", type: "number", answer: 20, tolerance: 0 },
  { id: "V2-N3-001", domain: "V", objective_codes: ["V2"], level: 3, kind: "diagnostic", type: "number", answer: 450, tolerance: 0 },
  { id: "V3-N3-001", domain: "V", objective_codes: ["V3"], level: 3, kind: "diagnostic", type: "choice", answer: "1000 g voor €5,00" },
  { id: "P2-N3-001", domain: "P", objective_codes: ["P2"], level: 3, kind: "diagnostic", type: "number", answer: 16, tolerance: 0 },
  { id: "P5-N3-001", domain: "P", objective_codes: ["P5"], level: 3, kind: "diagnostic", type: "number", answer: 20, tolerance: 0 },
  { id: "K2-N3-001", domain: "K", objective_codes: ["K2"], level: 3, kind: "diagnostic", type: "number", answer: 45, tolerance: 0 },
  { id: "K10-N3-001", domain: "K", objective_codes: ["K10"], level: 3, kind: "diagnostic", type: "number", answer: 8, tolerance: 0 },
  { id: "K10-N3-002", domain: "K", objective_codes: ["K10"], level: 3, kind: "practice", type: "number", answer: 12, tolerance: 0 },
  { id: "K10-N3-003", domain: "K", objective_codes: ["K10"], level: 3, kind: "review", type: "number", answer: 10, tolerance: 0 },
  { id: "V2-N3-002", domain: "V", objective_codes: ["V2"], level: 3, kind: "practice", type: "number", answer: 6, tolerance: 0 },
  { id: "EX-A-001", domain: "K", objective_codes: ["K10"], level: 3, kind: "exam", type: "number", answer: 9, tolerance: 0 },
];

// Same v1 shape as the provided export, with personal values removed.
const girlfriendExport = {
  schema_version: 1,
  exported_at: "2026-09-16T15:57:21.191Z",
  learner: { id: "learner", target_level: 3 },
  attempts: [
    { question_id: "G1-N3-001", objective: "G1", domain: "G", correct: true, answer: "meter", at: "2026-09-16T15:51:41.100Z", independent: true, hints: [] },
    { question_id: "G3-N3-001", objective: "G3", domain: "G", correct: true, answer: 240, at: "2026-09-16T15:51:51.609Z", independent: true, hints: [] },
    { question_id: "R11-N3-001", objective: "R11", domain: "R", correct: true, answer: 20, at: "2026-09-16T15:52:04.042Z", independent: true, hints: [] },
    { question_id: "V2-N3-001", objective: "V2", domain: "V", correct: true, answer: 450, at: "2026-09-16T15:52:17.324Z", independent: true, hints: [] },
    { question_id: "V3-N3-001", objective: "V3", domain: "V", correct: true, answer: "1000 g voor €5,00", at: "2026-09-16T15:52:28.514Z", independent: true, hints: [] },
    { question_id: "P2-N3-001", objective: "P2", domain: "P", correct: true, answer: 16, at: "2026-09-16T15:52:40.289Z", independent: true, hints: [] },
    { question_id: "P5-N3-001", objective: "P5", domain: "P", correct: true, answer: 20, at: "2026-09-16T15:52:53.244Z", independent: true, hints: [] },
    { question_id: "K2-N3-001", objective: "K2", domain: "K", correct: true, answer: 45, at: "2026-09-16T15:53:15.411Z", independent: true, hints: [] },
    { question_id: "K10-N3-001", objective: "K10", domain: "K", correct: false, answer: 24, at: "2026-09-16T15:54:09.794Z", independent: true, hints: [] },
  ],
  diagnosticIndex: 9,
  selectedAnswer: null,
  feedback: null,
};

const state = importState(girlfriendExport, questions);
assert.equal(state.attempts.at(-1).objective, "K10");
assert.equal(nextActivity(state, questions).phase, "recovery");
assert.equal(nextActivity(state, questions).question.id, "K10-N3-002", "K10-fout moet naar een nieuwe K10-oefenvraag leiden");
const k10Practice = questions.find((question) => question.id === "K10-N3-002");
assert.deepEqual(scoreAnswer(k10Practice, "12"), { value: 12, correct: true });
assert.deepEqual(scoreAnswer(k10Practice, ""), { value: null, correct: false });
assert.throws(() => importState({ ...girlfriendExport, schema_version: 2 }, questions), /Niet ondersteund/);

const withBasis = importState({ ...girlfriendExport, attempts: [...girlfriendExport.attempts, { question_id: "B1-N3-001", objective: "WRONG", domain: "G", correct: true }] }, questions);
assert.equal(withBasis.attempts.at(-1).objective, "B1", "import gebruikt canoniek basisdoel uit de vraagbank");
assert.equal(withBasis.attempts.at(-1).domain, "B", "import gebruikt canoniek domein uit de vraagbank");

const halfway = { ...state, diagnosticIndex: 1 };
assert.equal(nextActivity(halfway, questions).phase, "diagnostic");
assert.equal(nextActivity(halfway, questions).question.id, "G3-N3-001");

const afterRecovery = {
  ...state,
  attempts: [...state.attempts, { question_id: "K10-N3-002", objective: "K10", domain: "K", correct: true }],
};
assert.equal(nextActivity(afterRecovery, questions).question.id, "B1-N3-001", "zonder fout of hertoets komt de volgende nieuwe vaardigheid");

const dueReview = { ...afterRecovery, mastery: [{ objective_code: "K10", next_review_at: "2026-09-16" }] };
assert.equal(nextActivity(dueReview, questions, new Date("2026-09-16T12:00:00Z")).question.id, "K10-N3-003", "achterstallige hertoets gaat voor nieuwe oefening");

const beforeExam = {
  ...dueReview,
  mastery: [
    { objective_code: "B1", state: "beheerst", next_review_at: null },
    { objective_code: "K10", state: "beheerst", next_review_at: null },
    { objective_code: "V2", state: "beheerst", next_review_at: null },
  ],
  attempts: [...afterRecovery.attempts, { question_id: "B1-N3-001", objective: "B1", domain: "B", correct: true }, { question_id: "V2-N3-002", objective: "V2", domain: "V", correct: true }, { question_id: "K10-N3-003", objective: "K10", domain: "K", correct: true }],
};
assert.equal(nextActivity(beforeExam, questions).phase, "exam");
const afterFirstExam = { ...beforeExam, attempts: [...beforeExam.attempts, { question_id: "EX-A-001", objective: "K10", domain: "K", correct: true }] };
assert.equal(nextActivity(afterFirstExam, questions), null, "na het enige test-examenitem ontstaat geen les- of mastery-dead-end");

const retryState = { ...state, attempts: [...state.attempts, { question_id: "K10-N3-002", objective: "K10", domain: "K", correct: false }] };
assert.equal(nextActivity(retryState, questions).question.id, "K10-N3-002", "uitgeputte fout blijft herstel aanbieden");
console.log("core: import, scoring and deterministic activity selection pass");

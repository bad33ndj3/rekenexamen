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

// Expliciete 1/9-case voor de migratie uit core.mjs:55-57: één oude poging is onvoltooid.
const legacyBank = Array.from({ length: 9 }, (_, index) => ({
  id: `OLD-${index + 1}`, domain: "G", objective_codes: ["G1"], level: 3,
  kind: "legacy-diagnostic", type: "number", answer: 1, tolerance: 0,
}));
const freshDiagnostics = Array.from({ length: 40 }, (_, index) => ({
  id: `DIAG-G-${index + 1}-G1`, domain: "G", objective_codes: ["G1"], level: 3,
  kind: "diagnostic", type: "number", answer: 1, tolerance: 0,
}));
const migrationBank = [...legacyBank, ...freshDiagnostics];
const oneOfNineExport = {
  schema_version: 1,
  learner: { id: "partial", target_level: 3 },
  attempts: [{ question_id: "OLD-1", objective: "G1", domain: "G", correct: true, answer: 1, at: "2026-09-16T15:51:41.100Z", independent: true, hints: [] }],
  diagnosticIndex: 1,
};
const oneOfNine = importState(oneOfNineExport, migrationBank);
assert.equal(oneOfNine.attempts.length, 1, "1/9 oude pogingen blijven 1 poging");
assert.equal(oneOfNine.diagnosticIndex, 1, "1/9 oude nulmeting blijft onvoltooid (geen migratie naar 40)");
assert.equal(nextActivity(oneOfNine, migrationBank).phase, "diagnostic", "1/9 oude nulmeting hervat bij de nulmeting");
assert.equal(nextActivity(oneOfNine, migrationBank).question.id, "DIAG-G-2-G1", "1/9 oude nulmeting gaat verder bij de tweede nulmetingsvraag");

// Volledige 9/9-case migreert wel naar afgerond.
const nineOfNineExport = {
  ...oneOfNineExport,
  attempts: legacyBank.map((question) => ({ question_id: question.id, objective: "G1", domain: "G", correct: true, answer: 1, at: "2026-09-16T15:51:41.100Z", independent: true, hints: [] })),
  diagnosticIndex: 9,
};
assert.equal(importState(nineOfNineExport, migrationBank).diagnosticIndex, 40, "9/9 oude nulmeting migreert naar afgerond");
console.log("core: import, scoring and deterministic activity selection pass");

// --- Proefexamen-sessies A/B: start → hervat na reload → inleveren (5/6-grens en gate) ---
import { EXAM_SIZE, examQuestionIds, formatExamClock, startExam, submitExam } from "./core.mjs";
import { examLockReason, isExamQuestionAnswered, recordExamAnswer } from "./core.mjs";

const examCodes = {
  G: ["G1", "G2", "G3", "G4", "G5", "G7"],
  R: ["R3", "R5", "R6", "R10", "R11", "R13"],
  V: ["V1", "V2", "V3", "V4", "V5", "V6"],
  P: ["P1", "P2", "P3", "P4", "P5", "P7"],
  K: ["K2", "K4", "K6", "K9", "K10", "K13"],
};
const examBank = [
  { id: "G1-N3-001", domain: "G", objective_codes: ["G1"], level: 3, kind: "practice", type: "number", answer: 10, tolerance: 0 },
  { id: "R1-N3-001", domain: "R", objective_codes: ["R1"], level: 3, kind: "practice", type: "number", answer: 5, tolerance: 0 },
  { id: "G1-REV-001", domain: "G", objective_codes: ["G1"], level: 3, kind: "review", type: "number", answer: 11, tolerance: 0 },
  ...["A", "B"].flatMap((exam) => Object.entries(examCodes).flatMap(([domain, codes]) => codes.map((code, index) => ({
    id: `EX-${exam}-${domain}-${index + 1}-${code}`, exam, domain, objective_codes: [code], level: 3, kind: "exam",
    type: "number", answer: 100 + index, tolerance: 0,
  })))),
];
const freshExamState = () => ({
  learner: { id: "exam-learner", target_level: 3 }, attempts: [], diagnosticIndex: 0,
  selectedAnswer: null, feedback: null, mastery: [], exams: { A: null, B: null },
});
const masteredExamState = () => ({
  ...freshExamState(),
  attempts: [
    { question_id: "G1-N3-001", objective: "G1", domain: "G", kind: "practice", correct: true, answer: 10, at: "2026-09-16T18:00:00Z", independent: true, hints: [] },
    { question_id: "R1-N3-001", objective: "R1", domain: "R", kind: "practice", correct: true, answer: 5, at: "2026-09-16T18:01:00Z", independent: true, hints: [] },
  ],
  mastery: [
    { objective_code: "G1", state: "toetsklaar", next_review_at: null },
    { objective_code: "R1", state: "beheerst", next_review_at: null },
  ],
});

// Gate: zonder toetsklare oefendoelen geen examenstart, wel oefening.
assert.equal(nextActivity(freshExamState(), examBank).phase, "practice", "gate dicht: eerst oefenen, geen examen");
assert.throws(() => startExam(freshExamState(), examBank, "A"), /toetsklaar of beheerst/, "gate dicht: starten gooit");

// Gate open: A wordt als startbare sessie aangeboden.
const offer = nextActivity(masteredExamState(), examBank);
assert.equal(offer.phase, "exam", "gate open: examenfase");
assert.equal(offer.exam, "A", "eerst examen A");
assert.equal(offer.total, 30, "sessie telt 30 vragen");
assert.equal(offer.index, 0, "sessie start bij vraag 1");
assert.equal(offer.startable, true, "sessie nog niet gestart");

// Start bouwt een vaste G→R→V→P→K-volgorde; B start pas na inleveren A.
const examState = masteredExamState();
const sessionA = startExam(examState, examBank, "A", new Date("2026-09-16T19:00:00+02:00"));
assert.equal(sessionA.question_ids.length, EXAM_SIZE, "sessie A heeft 30 vragen");
assert.deepEqual(sessionA.question_ids.map((id) => id.split("-")[2]), [...Array(6).fill("G"), ...Array(6).fill("R"), ...Array(6).fill("V"), ...Array(6).fill("P"), ...Array(6).fill("K")], "domeinblokken G→R→V→P→K, 6 per domein");
assert.deepEqual(sessionA.question_ids, examQuestionIds("A", examBank), "volgorde is deterministisch");
assert.deepEqual(startExam(masteredExamState(), examBank, "A").question_ids, sessionA.question_ids, "herhaalde start geeft dezelfde volgorde");
assert.throws(() => startExam(examState, examBank, "A"), /al gestart/, "dubbel starten gooit");
assert.throws(() => startExam(examState, examBank, "B"), /na het inleveren van proefexamen A/, "B pas na inleveren A");

// Eén beantwoorde vraag, daarna reload via export/import: hervatten bij vraag 2.
const firstId = sessionA.question_ids[0];
const firstQuestion = examBank.find((question) => question.id === firstId);
sessionA.answers[firstId] = { answer: firstQuestion.answer, at: "2026-09-16T19:01:00+02:00", seconds: 42 };
sessionA.elapsed_seconds = 42;
sessionA.current_index = 1;
const idsBeforeReload = [...sessionA.question_ids];
const reloaded = importState(JSON.parse(JSON.stringify({
  schema_version: 1, learner: examState.learner, attempts: examState.attempts,
  diagnosticIndex: 0, mastery: examState.mastery, exams: examState.exams,
})), examBank);
assert.deepEqual(reloaded.exams.A.question_ids, idsBeforeReload, "vaste volgorde muteert nooit, ook niet na reload");
assert.equal(reloaded.exams.A.elapsed_seconds, 42, "opgetelde tijd overleeft reload");
const resumed = nextActivity(reloaded, examBank);
assert.equal(resumed.phase, "exam", "open sessie krijgt prio");
assert.equal(resumed.exam, "A", "hervat sessie A");
assert.equal(resumed.index, 1, "hervat via current_index bij vraag 2");
assert.equal(resumed.id, sessionA.question_ids[1], "hervat bij de tweede vraag");
assert.equal(resumed.total, 30, "totaal blijft 30");

// Herstel en hertoets wachten zolang de sessie openstaat.
const blockedRecovery = {
  ...reloaded,
  attempts: [...reloaded.attempts, { question_id: "G1-N3-001", objective: "G1", domain: "G", kind: "practice", correct: false, answer: 0, at: "2026-09-16T19:02:00Z", independent: true, hints: [] }],
};
assert.equal(nextActivity(blockedRecovery, examBank).phase, "exam", "open sessie blokkeert herstel");
const blockedReview = {
  ...reloaded,
  mastery: [{ objective_code: "G1", state: "toetsklaar", next_review_at: "2026-09-16" }, { objective_code: "R1", state: "beheerst", next_review_at: null }],
};
assert.equal(nextActivity(blockedReview, examBank, new Date("2026-09-16T12:00:00Z")).phase, "exam", "open sessie blokkeert hertoets");

// Foute examenpogingen tellen niet als herstelsignaal.
const examMiss = {
  ...masteredExamState(),
  attempts: [...masteredExamState().attempts, { question_id: "EX-A-G-1-G1", objective: "G1", domain: "G", kind: "exam", correct: false, answer: 0, at: "2026-09-16T19:03:00Z", independent: true, hints: [] }],
};
const afterMiss = nextActivity(examMiss, examBank);
assert.equal(afterMiss.phase, "exam", "examenfout leidt niet naar herstel");
assert.equal(afterMiss.exam, "A", "examenfout blokkeert de sessiestart niet");

// Inleveren A met 5/6 per domein: 25/30 = 83%, elk domein 83% → gehaald.
for (const [position, id] of sessionA.question_ids.entries()) {
  const question = examBank.find((item) => item.id === id);
  const wrong = position % 6 === 5;
  sessionA.answers[id] = { answer: wrong ? question.answer + 999 : question.answer, at: "2026-09-16T19:05:00+02:00", seconds: 30 };
}
sessionA.elapsed_seconds = 42 + 29 * 30;
sessionA.current_index = 29;
const resultA = submitExam(examState, examBank, "A", new Date("2026-09-16T20:30:00+02:00"));
assert.equal(resultA.total_pct, 83, "25 van 30 is 83%");
assert.deepEqual(resultA.per_domain, { G: 83, R: 83, V: 83, P: 83, K: 83 }, "5 van 6 per domein is 83%");
assert.equal(resultA.passed, true, "80%+ en elk domein 70%+ is gehaald");
assert.equal(typeof resultA.submitted_at, "string", "uitslag draagt een inlevermoment");
assert.throws(() => submitExam(examState, examBank, "A"), /al ingeleverd/, "uitslag is immutabel na inleveren");

// Na inleveren A biedt de flow B aan; B met 4/6 op K zakt op de domeinnorm.
const offerB = nextActivity(examState, examBank);
assert.equal(offerB.phase, "exam", "na A volgt B");
assert.equal(offerB.exam, "B", "tweede sessie is B");
const sessionB = startExam(examState, examBank, "B", new Date("2026-09-17T19:00:00+02:00"));
for (const [position, id] of sessionB.question_ids.entries()) {
  const question = examBank.find((item) => item.id === id);
  const domain = id.split("-")[2];
  const wrong = domain === "K" ? position % 6 >= 4 : position % 6 === 5;
  sessionB.answers[id] = { answer: wrong ? question.answer + 999 : question.answer, at: "2026-09-17T19:05:00+02:00", seconds: 30 };
}
sessionB.current_index = 29;
const resultB = submitExam(examState, examBank, "B", new Date("2026-09-17T20:30:00+02:00"));
assert.equal(resultB.total_pct, 80, "24 van 30 is precies 80%");
assert.equal(resultB.per_domain.K, 67, "4 van 6 is 67% en haalt de 70%-norm niet");
assert.equal(resultB.passed, false, "totaal 80% met één domein onder 70% zakt");

// Importvalidatie: v1 zonder exams migreert, corruptie gooit (geen stille reparatie).
assert.deepEqual(
  importState({ schema_version: 1, learner: { id: "oud", target_level: 3 }, attempts: [], diagnosticIndex: 0, mastery: [] }, examBank).exams,
  { A: null, B: null },
  "v1 zonder exams migreert naar {A:null,B:null}",
);
const roundTrip = importState(JSON.parse(JSON.stringify({
  schema_version: 1, learner: examState.learner, attempts: [], diagnosticIndex: 0, mastery: [], exams: examState.exams,
})), examBank);
assert.equal(roundTrip.exams.A.result.passed, true, "ingeleverde uitslag A overleeft export/import");
assert.equal(roundTrip.exams.B.result.passed, false, "ingeleverde uitslag B overleeft export/import");
const shortSession = structuredClone(sessionA);
delete shortSession.answers[shortSession.question_ids[29]];
assert.throws(
  () => importState({ schema_version: 1, learner: examState.learner, attempts: [], diagnosticIndex: 0, mastery: [], exams: { A: shortSession, B: null } }, examBank),
  /30 antwoorden/,
  "ingeleverde sessie zonder 30 antwoorden is corrupt",
);
const unknownSession = structuredClone({ ...sessionA, submitted_at: null, result: null });
unknownSession.question_ids = [...unknownSession.question_ids.slice(0, 29), "EX-A-XX-onbekend"];
assert.throws(
  () => importState({ schema_version: 1, learner: examState.learner, attempts: [], diagnosticIndex: 0, mastery: [], exams: { A: unknownSession, B: null } }, examBank),
  /Onbekende vraag in import: EX-A-XX-onbekend/,
  "onbekende question_id gooit",
);
const wrongExam = structuredClone({ ...sessionB, submitted_at: null, result: null });
assert.throws(
  () => importState({ schema_version: 1, learner: examState.learner, attempts: [], diagnosticIndex: 0, mastery: [], exams: { A: wrongExam, B: null } }, examBank),
  /verkeerde vragen of volgorde/,
  "A-sessie met B-vragen wordt geweigerd",
);
const forgedResult = structuredClone(sessionA);
forgedResult.result.total_pct = 0;
assert.throws(
  () => importState({ schema_version: 1, learner: examState.learner, attempts: [], diagnosticIndex: 0, mastery: [], exams: { A: forgedResult, B: null } }, examBank),
  /uitslag klopt niet/,
  "opgeslagen uitslag moet overeenkomen met de antwoorden",
);

assert.equal(formatExamClock(0), "0:00", "klok start op 0:00");
assert.equal(formatExamClock(65), "1:05", "klok toont mm:ss");
assert.equal(formatExamClock(5400), "90:00", "richttijd is 90:00");
console.log("exam-sessies: start, hervat, blokkade, inleveren, 5/6-grens, gate en importvalidatie pass");

// Nuance A — zichtbare vergrendelde A/B-kaarten: locked-reden bij dichte gate / B-blokkade vóór A-inleveren.
assert.match(examLockReason(freshExamState(), examBank, "A"), /start pas als alle oefendoelen toetsklaar of beheerst zijn \(nog 2 te gaan\)/, "gate dicht: A vergrendeld met N");
assert.match(examLockReason(freshExamState(), examBank, "B"), /start pas na het inleveren van proefexamen A/, "gate dicht: B geblokkeerd vóór A-inleveren");
assert.equal(examLockReason(masteredExamState(), examBank, "A"), null, "gate open: A startbaar, geen lock");
assert.match(examLockReason(masteredExamState(), examBank, "B"), /start pas na het inleveren van proefexamen A/, "B-blokkade vóór A-inleveren");
assert.equal(examLockReason(reloaded, examBank, "A"), null, "open sessie A is niet vergrendeld");
assert.match(examLockReason(reloaded, examBank, "B"), /start pas na het inleveren van proefexamen A/, "B vergrendeld zolang A openstaat");
const afterAOnly = { ...masteredExamState(), exams: { A: examState.exams.A, B: null } };
assert.equal(examLockReason(afterAOnly, examBank, "B"), null, "na inleveren A is B startbaar, geen lock");
assert.equal(examLockReason(examState, examBank, "A"), null, "ingeleverde A toont resultaat, geen lock");
assert.equal(examLockReason(examState, examBank, "B"), null, "ingeleverde B toont resultaat, geen lock");

// Nuance B — examen-feedback over reload: beantwoord-status uit session.answers, identiek opslaan zonder extra elapsed.
assert.equal(isExamQuestionAnswered(reloaded.exams.A, firstId), true, "reload-hervatting: beantwoorde vraag toont beantwoord-status");
assert.equal(isExamQuestionAnswered(reloaded.exams.A, sessionA.question_ids[1]), false, "open vraag blijft open na reload");
const elapsedBeforeIdentical = reloaded.exams.A.elapsed_seconds;
const identicalResult = recordExamAnswer(reloaded.exams.A, firstId, firstQuestion.answer, 30);
assert.equal(identicalResult.identical, true, "identiek antwoord herkend");
assert.equal(identicalResult.addedSeconds, 0, "identiek antwoord telt 0 seconden bij");
assert.equal(reloaded.exams.A.elapsed_seconds, elapsedBeforeIdentical, "identiek opnieuw opslaan telt geen extra elapsed");
assert.deepEqual(reloaded.exams.A.answers[firstId].answer, firstQuestion.answer, "identiek opslaan verliest geen antwoord");
const changedResult = recordExamAnswer(reloaded.exams.A, firstId, firstQuestion.answer + 999, 30);
assert.equal(changedResult.identical, false, "gewijzigd antwoord herkend als wijziging");
assert.equal(changedResult.addedSeconds, 30, "gewijzigd antwoord telt delta mee");
assert.equal(reloaded.exams.A.elapsed_seconds, elapsedBeforeIdentical + 30, "alleen bij gewijzigd antwoord de nieuwe delta optellen");
console.log("exam-nuances: vergrendelde A/B-redenen en reload-feedback met idempotente elapsed pass");

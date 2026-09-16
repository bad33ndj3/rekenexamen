export const SCHEMA_VERSION = 1;
export const EXAM_DOMAINS = ["G", "R", "V", "P", "K"];
export const EXAM_PER_DOMAIN = 6;
export const EXAM_SIZE = EXAM_DOMAINS.length * EXAM_PER_DOMAIN;
export const EXAM_GUIDELINE_SECONDS = 90 * 60;
export const EXAM_PASS_TOTAL = 80;
export const EXAM_PASS_DOMAIN = 70;
const DOMAINS = new Set(["B", "G", "R", "V", "P", "K"]);

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function copy(value) { return structuredClone(value); }

function objectiveOf(attempt) {
  return attempt.objective ?? attempt.objective_codes?.[0] ?? null;
}

function migrateAttempt(attempt, questionById) {
  if (!isObject(attempt) || typeof attempt.question_id !== "string") throw new TypeError("Ongeldige poging in import.");
  const question = questionById.get(attempt.question_id);
  if (!question) throw new TypeError(`Onbekende vraag in import: ${attempt.question_id}`);
  const objective = question.objective_codes?.[0] ?? objectiveOf(attempt);
  const domain = question.domain;
  if (typeof objective !== "string" || !DOMAINS.has(domain)) throw new TypeError(`Ongeldige poging: ${attempt.question_id}`);
  const correct = typeof attempt.correct === "boolean" ? attempt.correct : Number(attempt.score) >= Number(attempt.max_score ?? 1);
  return {
    ...copy(attempt),
    objective,
    domain,
    kind: question.kind,
    correct,
    hints: Array.isArray(attempt.hints) ? copy(attempt.hints) : [],
    independent: attempt.independent !== false,
  };
}

function migrateMastery(mastery) {
  if (!Array.isArray(mastery)) return [];
  return mastery.map((item) => {
    if (!isObject(item) || typeof item.objective_code !== "string") throw new TypeError("Ongeldige beheersing in import.");
    if (item.next_review_at != null && Number.isNaN(Date.parse(item.next_review_at))) throw new TypeError(`Ongeldige hertoetsdatum: ${item.objective_code}`);
    return copy(item);
  });
}

/**
 * Bouwt de deterministische vraagvolgorde voor proefexamen A of B:
 * domeinblokken G→R→V→P→K, 6 vragen per domein, gesorteerd op id.
 * De volgorde staat vast bij de start en wordt daarna nooit gemuteerd.
 */
export function examQuestionIds(examId, questions) {
  if (!["A", "B"].includes(examId)) throw new TypeError("Onbekend proefexamen.");
  const pool = (questions ?? []).filter((question) =>
    question?.kind === "exam" &&
    (question.exam === examId || (question.exam == null && typeof question.id === "string" && question.id.startsWith(`EX-${examId}-`))));
  const rank = new Map(EXAM_DOMAINS.map((domain, index) => [domain, index]));
  return pool
    .slice()
    .sort((a, b) => ((rank.get(a.domain) ?? 99) - (rank.get(b.domain) ?? 99)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((question) => question.id);
}

/** Geeft de openstaande (niet-ingeleverde) sessie terug, of null. */
export function getActiveExam(state) {
  const exams = state?.exams ?? {};
  for (const examId of ["A", "B"]) {
    const session = exams[examId];
    if (session && !session.submitted_at) return { exam: examId, session };
  }
  return null;
}

function examGate(state, available) {
  const required = new Set(available.filter((question) => question.kind === "practice").flatMap((question) => question.objective_codes ?? []));
  const mastered = new Set((state.mastery ?? []).filter((item) => ["toetsklaar", "beheerst"].includes(item.state)).map((item) => item.objective_code));
  return { ok: [...required].every((objective) => mastered.has(objective)), missing: [...required].filter((objective) => !mastered.has(objective)) };
}

/**
 * Informatieve vergrendelreden per proefexamen voor Vandaag, of null als het
 * examen startbaar, actief of ingeleverd is. A toont de gate-reden met N,
 * B toont zolang A niet is ingeleverd de B-blokkade.
 */
export function examLockReason(state, questions, examId) {
  if (!["A", "B"].includes(examId)) throw new TypeError("Onbekend proefexamen.");
  const session = state?.exams?.[examId];
  if (session?.submitted_at && session?.result) return null;
  if (session && !session.submitted_at) return null;
  if (examId === "B" && !state?.exams?.A?.submitted_at) return "start pas na het inleveren van proefexamen A";
  if (!isObject(state?.learner) || !Array.isArray(questions)) return null;
  const gate = examGate(state, eligible(questions, state));
  if (!gate.ok) return `start pas als alle oefendoelen toetsklaar of beheerst zijn (nog ${gate.missing.length} te gaan)`;
  return null;
}

/** True als voor deze examenvraag al een antwoord in de sessie staat. */
export function isExamQuestionAnswered(session, questionId) {
  if (!isObject(session) || typeof questionId !== "string") return false;
  return Object.hasOwn(session.answers ?? {}, questionId);
}

function examStoredValue(session, questionId) {
  const stored = session?.answers?.[questionId];
  if (stored === undefined) return undefined;
  return isObject(stored) && "answer" in stored ? stored.answer : stored;
}

/**
 * Bewaart een examenantwoord idempotent: bij een IDENTIEK antwoord (zelfde
 * genormaliseerde waarde als opgeslagen) wordt geen extra elapsed_seconds
 * bijgeteld; alleen bij een gewijzigd antwoord telt de nieuwe delta mee.
 * Antwoorden blijven overschrijfbaar zonder dataverlies.
 */
export function recordExamAnswer(session, questionId, answerValue, secondsDelta, now = new Date()) {
  if (!isObject(session)) throw new TypeError("Examensessie ontbreekt.");
  if (typeof questionId !== "string") throw new TypeError("Ongeldige examenvraag.");
  if (!isObject(session.answers)) session.answers = {};
  const prev = examStoredValue(session, questionId);
  const identical = prev !== undefined && String(prev) === String(answerValue);
  const delta = Math.max(0, Math.floor(Number(secondsDelta) || 0));
  if (identical) return { identical: true, addedSeconds: 0 };
  session.answers[questionId] = {
    answer: answerValue,
    at: (now instanceof Date ? now : new Date(now)).toISOString(),
    seconds: delta,
  };
  session.elapsed_seconds = (session.elapsed_seconds ?? 0) + delta;
  return { identical: false, addedSeconds: delta };
}

/**
 * Start proefexamen A of B. Gooit bij een gesloten gate, een vroege B-start
 * of een onvolledige examenbank. De gebouwde volgorde muteert daarna nooit.
 */
export function startExam(state, questions, examId, now = new Date()) {
  if (!isObject(state) || !isObject(state.learner)) throw new TypeError("Kies eerst een niveau voordat het proefexamen start.");
  if (!["A", "B"].includes(examId)) throw new TypeError("Onbekend proefexamen.");
  if (!Array.isArray(questions)) throw new TypeError("Vraagbank ontbreekt.");
  if (state.exams == null) state.exams = { A: null, B: null };
  if (state.exams[examId]) throw new TypeError(`Proefexamen ${examId} is al gestart en houdt een vaste volgorde.`);
  if (examId === "B" && !state.exams.A?.submitted_at) throw new TypeError("Proefexamen B start pas na het inleveren van proefexamen A.");
  const available = eligible(questions, state);
  if (!examGate(state, available).ok) throw new TypeError("Het proefexamen start pas als alle oefendoelen toetsklaar of beheerst zijn.");
  const question_ids = examQuestionIds(examId, available);
  const perDomain = new Map();
  for (const id of question_ids) {
    const domain = available.find((item) => item.id === id)?.domain;
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
  }
  if (question_ids.length !== EXAM_SIZE || EXAM_DOMAINS.some((domain) => perDomain.get(domain) !== EXAM_PER_DOMAIN)) {
    throw new TypeError(`Onvoldoende examenvragen voor proefexamen ${examId}: 30 nodig (6 per domein G/R/V/P/K), ${question_ids.length} gevonden.`);
  }
  const session = {
    question_ids,
    current_index: 0,
    answers: {},
    started_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    elapsed_seconds: 0,
    submitted_at: null,
    result: null,
  };
  state.exams[examId] = session;
  return session;
}

/**
 * Totale en domeinscores voor een sessie. Slagen: totaal >= 80%
 * (minstens 24 van 30) en elk domein >= 70%. Bij 6 vragen per domein
 * betekent 70% praktisch minstens 5 van 6 goed: 4 van 6 is 67% en zakt.
 */
export function gradeExam(question_ids, answers, questions) {
  const byId = new Map((questions ?? []).map((question) => [question?.id, question]));
  const counts = new Map(EXAM_DOMAINS.map((domain) => [domain, { correct: 0, total: 0 }]));
  let correctTotal = 0;
  for (const id of question_ids ?? []) {
    const question = byId.get(id);
    if (!question) throw new TypeError(`Onbekende vraag in import: ${id}`);
    const stored = answers?.[id];
    const raw = isObject(stored) && "answer" in stored ? stored.answer : stored;
    let correct = false;
    try { correct = scoreAnswer(question, raw)?.correct === true; } catch { correct = false; }
    if (!counts.has(question.domain)) counts.set(question.domain, { correct: 0, total: 0 });
    counts.get(question.domain).total += 1;
    if (correct) { correctTotal += 1; counts.get(question.domain).correct += 1; }
  }
  const total = (question_ids ?? []).length;
  const per_domain = {};
  for (const domain of EXAM_DOMAINS) {
    const count = counts.get(domain);
    per_domain[domain] = count.total ? Math.round((count.correct / count.total) * 100) : 0;
  }
  const total_pct = total ? Math.round((correctTotal / total) * 100) : 0;
  return { total_pct, per_domain, passed: total_pct >= EXAM_PASS_TOTAL && EXAM_DOMAINS.every((domain) => per_domain[domain] >= EXAM_PASS_DOMAIN) };
}

/** Levert een volledig beantwoorde sessie in; de uitslag is daarna immutabel. */
export function submitExam(state, questions, examId, now = new Date()) {
  if (!["A", "B"].includes(examId)) throw new TypeError("Onbekend proefexamen.");
  const session = state?.exams?.[examId];
  if (!session) throw new TypeError(`Proefexamen ${examId} is niet gestart.`);
  if (session.submitted_at) throw new TypeError(`Proefexamen ${examId} is al ingeleverd en kan niet meer wijzigen.`);
  const given = isObject(session.answers) ? (session.question_ids ?? []).filter((id) => Object.hasOwn(session.answers, id)) : [];
  if ((session.question_ids ?? []).length !== EXAM_SIZE || given.length !== EXAM_SIZE) {
    throw new TypeError(`Proefexamen ${examId} is ingeleverd zonder 30 antwoorden en is corrupt.`);
  }
  const grade = gradeExam(session.question_ids, session.answers, questions);
  const submitted_at = (now instanceof Date ? now : new Date(now)).toISOString();
  session.submitted_at = submitted_at;
  session.result = { ...grade, submitted_at };
  return session.result;
}

/** Klokweergave mm:ss; minuten lopen door (5400 s toont 90:00). */
export function formatExamClock(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function examsArrayToObject(list) {
  const out = { A: null, B: null };
  for (const item of list) {
    if (!isObject(item)) throw new TypeError("Ongeldige proefexamens in import.");
    const examId = item.exam ?? item.id;
    if (!["A", "B"].includes(examId) || out[examId]) throw new TypeError("Ongeldige proefexamens in import.");
    const { exam, id, ...session } = item;
    out[examId] = session;
  }
  return out;
}

function validateExamSession(examId, session, questionById) {
  if (!isObject(session)) throw new TypeError(`Proefexamen ${examId} in import is ongeldig.`);
  const ids = session.question_ids;
  if (!Array.isArray(ids) || ids.length !== EXAM_SIZE) throw new TypeError(`Proefexamen ${examId} in import is corrupt: 30 vragen verwacht.`);
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== "string" || !questionById.has(id)) throw new TypeError(`Onbekende vraag in import: ${id}`);
    if (seen.has(id)) throw new TypeError(`Proefexamen ${examId} in import is corrupt: dubbele vraag ${id}.`);
    seen.add(id);
  }
  if (!Number.isInteger(session.current_index) || session.current_index < 0 || session.current_index >= EXAM_SIZE) {
    throw new TypeError(`Proefexamen ${examId} in import is corrupt: ongeldige positie.`);
  }
  if (session.answers != null && !isObject(session.answers)) throw new TypeError(`Proefexamen ${examId} in import is corrupt.`);
  const answers = session.answers ?? {};
  for (const key of Object.keys(answers)) {
    if (!seen.has(key)) throw new TypeError(`Onbekende vraag in import: ${key}`);
  }
  if (typeof session.started_at !== "string" || Number.isNaN(Date.parse(session.started_at))) {
    throw new TypeError(`Proefexamen ${examId} in import is corrupt: ongeldige startdatum.`);
  }
  const elapsed = session.elapsed_seconds ?? 0;
  if (typeof elapsed !== "number" || !Number.isFinite(elapsed) || elapsed < 0) {
    throw new TypeError(`Proefexamen ${examId} in import is corrupt: ongeldige tijd.`);
  }
  const submitted = session.submitted_at ?? null;
  if (submitted != null && (typeof submitted !== "string" || Number.isNaN(Date.parse(submitted)))) {
    throw new TypeError(`Proefexamen ${examId} in import is corrupt: ongeldige inleverdatum.`);
  }
  const result = session.result ?? null;
  if (submitted != null) {
    if (Object.keys(answers).length !== EXAM_SIZE) throw new TypeError(`Proefexamen ${examId} is ingeleverd zonder 30 antwoorden en is corrupt.`);
    if (!isObject(result) || typeof result.total_pct !== "number" || !isObject(result.per_domain) || typeof result.passed !== "boolean") {
      throw new TypeError(`Proefexamen ${examId} in import is corrupt: uitslag ontbreekt.`);
    }
  } else if (result != null) {
    throw new TypeError(`Proefexamen ${examId} in import is corrupt: uitslag zonder inlevering.`);
  }
  return { question_ids: [...ids], current_index: session.current_index, answers: copy(answers), started_at: session.started_at, elapsed_seconds: elapsed, submitted_at: submitted, result: result == null ? null : copy(result) };
}

function normalizeExams(raw, questionById) {
  if (raw == null) return { A: null, B: null };
  const source = Array.isArray(raw) ? examsArrayToObject(raw) : raw;
  if (!isObject(source)) throw new TypeError("Ongeldige proefexamens in import.");
  return { A: null, B: null, ...Object.fromEntries(["A", "B"].map((examId) => {
    const session = source[examId] ?? null;
    return [examId, session == null ? null : validateExamSession(examId, session, questionById)];
  })) };
}

/**
 * Validates and normalizes an exported schema-v1 file before callers replace
 * localStorage. Existing app exports use `objective`; newer exports may use
 * `objective_codes`, both normalize to `objective`.
 */
export function importState(payload, questions) {
  let source;
  try { source = typeof payload === "string" ? JSON.parse(payload) : payload; }
  catch { throw new TypeError("Importbestand is geen geldige JSON."); }
  if (!isObject(source) || source.schema_version !== SCHEMA_VERSION) throw new TypeError("Niet ondersteund voortgangsbestand.");
  if (!isObject(source.learner) || typeof source.learner.id !== "string" || ![3, 4].includes(source.learner.target_level)) throw new TypeError("Ongeldige leerling in import.");
  if (!Array.isArray(questions)) throw new TypeError("Vraagbank ontbreekt.");

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const diagnostics = questions.filter((question) => question.kind === "diagnostic" && question.level === source.learner.target_level);
  const legacyDiagnostics = source.attempts?.filter((attempt) => questionById.get(attempt.question_id)?.kind === "legacy-diagnostic") ?? [];
  const diagnosticIndex = legacyDiagnostics.length >= 9 && (source.diagnosticIndex ?? 0) >= 9
    ? diagnostics.length
    : source.diagnosticIndex ?? 0;
  if (!Number.isInteger(diagnosticIndex) || diagnosticIndex < 0 || diagnosticIndex > diagnostics.length) throw new TypeError("Ongeldige positie in nulmeting.");
  if (!Array.isArray(source.attempts)) throw new TypeError("Pogingen ontbreken in import.");

  return {
    learner: copy(source.learner),
    attempts: source.attempts.map((attempt) => migrateAttempt(attempt, questionById)),
    diagnosticIndex,
    selectedAnswer: null,
    feedback: null,
    mastery: migrateMastery(source.mastery),
    exams: normalizeExams(source.exams, questionById),
  };
}

export function scoreAnswer(question, answer) {
  if (!question || !["choice", "number"].includes(question.type)) throw new TypeError("Ongeldige vraag.");
  if (answer == null || String(answer).trim() === "") return { value: null, correct: false };
  if (question.type === "choice") {
    const value = String(answer).trim();
    return { value, correct: value === question.answer };
  }
  const value = Number(String(answer).trim().replace(",", "."));
  const tolerance = question.tolerance ?? 0;
  return { value, correct: Number.isFinite(value) && Math.abs(value - question.answer) <= tolerance };
}

function eligible(questions, state) {
  return questions.filter((question) => question.level <= state.learner.target_level);
}

function unusedQuestion(questions, attempts, objective, kinds) {
  const attempted = new Set(attempts.map((attempt) => attempt.question_id));
  return questions.find((question) =>
    kinds.includes(question.kind) && question.objective_codes?.includes(objective) && !attempted.has(question.id),
  );
}

function dueReview(state, questions, now) {
  const date = now.toISOString().slice(0, 10);
  return state.mastery
    .filter((item) => item.next_review_at && item.next_review_at <= date)
    .sort((a, b) => a.next_review_at.localeCompare(b.next_review_at) || a.objective_code.localeCompare(b.objective_code))
    .map((item) => ({ objective: item.objective_code, question: unusedQuestion(questions, state.attempts, item.objective_code, ["review", "practice"]) }))
    .find((activity) => activity.question);
}

/** Returns the one deterministic activity a learner can do next, or null. */
export function nextActivity(state, questions, now = new Date()) {
  if (!state?.learner || !Array.isArray(state.attempts) || !Array.isArray(questions)) return null;
  const available = eligible(questions, state);
  const diagnostics = questions.filter((question) => question.kind === "diagnostic" && question.level === state.learner.target_level);
  if (state.diagnosticIndex < diagnostics.length) return { phase: "diagnostic", question: diagnostics[state.diagnosticIndex] };

  const active = getActiveExam(state);
  if (active?.session?.question_ids?.length === EXAM_SIZE) {
    const index = Math.min(Math.max(0, active.session.current_index ?? 0), EXAM_SIZE - 1);
    const id = active.session.question_ids[index];
    const question = available.find((item) => item.id === id) ?? questions.find((item) => item.id === id);
    if (question) return { phase: "exam", exam: active.exam, id, index, total: EXAM_SIZE, objective: question.objective_codes[0], question, resume: true };
  }

  const practiceAttempts = state.attempts.filter((attempt) => attempt?.kind !== "exam");
  const latestByObjective = new Map();
  for (const attempt of [...practiceAttempts].reverse()) {
    const objective = objectiveOf(attempt);
    if (objective && !latestByObjective.has(objective)) latestByObjective.set(objective, attempt);
  }
  const failedObjectives = [...latestByObjective.entries()].filter(([, attempt]) => !attempt.correct).map(([objective]) => objective);
  for (const objective of failedObjectives) {
    const question = unusedQuestion(available, state.attempts, objective, ["practice", "recovery"]);
    if (question) return { phase: "recovery", objective, question };
    const retry = available.find((question) => question.kind === "practice" && question.objective_codes?.includes(objective));
    if (retry) return { phase: "recovery", objective, question: retry, retry: true };
  }

  const review = dueReview(state, available, now);
  if (review) return { phase: "review", ...review };

  const attempted = new Set(state.attempts.map((attempt) => attempt.question_id));
  const practice = available.find((question) => question.kind === "practice" && !attempted.has(question.id));
  if (practice) return { phase: "practice", objective: practice.objective_codes[0], question: practice };

  const requiredObjectives = new Set(available.filter((question) => question.kind === "practice").flatMap((question) => question.objective_codes ?? []));
  const masteredObjectives = new Set(state.mastery.filter((item) => ["toetsklaar", "beheerst"].includes(item.state)).map((item) => item.objective_code));
  if ([...requiredObjectives].some((objective) => !masteredObjectives.has(objective))) return null;

  const exams = state.exams ?? { A: null, B: null };
  const order = [];
  if (!exams.A) order.push("A");
  else if (!exams.A.submitted_at) return null;
  else if (!exams.B) order.push("B");
  else if (!exams.B.submitted_at) return null;
  for (const examId of order) {
    const ids = examQuestionIds(examId, available);
    if (ids.length === EXAM_SIZE) {
      const first = available.find((item) => item.id === ids[0]);
      if (first) return { phase: "exam", exam: examId, id: ids[0], index: 0, total: ids.length, objective: first.objective_codes[0], question: first, startable: true };
    }
  }
  if (order.length === 0 && (!exams.A || !exams.B)) return null;

  const exam = available.find((question) => question.kind === "exam" && !attempted.has(question.id));
  return exam ? { phase: "exam", objective: exam.objective_codes[0], question: exam } : null;
}

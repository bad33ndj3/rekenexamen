export const SCHEMA_VERSION = 1;
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

  const latestByObjective = new Map();
  for (const attempt of [...state.attempts].reverse()) {
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

  const exam = available.find((question) => question.kind === "exam" && !attempted.has(question.id));
  return exam ? { phase: "exam", objective: exam.objective_codes[0], question: exam } : null;
}

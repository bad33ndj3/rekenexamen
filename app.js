import { EXAM_GUIDELINE_SECONDS, examLockReason, formatExamClock, importState, isExamQuestionAnswered, nextActivity, recordExamAnswer, scoreAnswer, startExam, submitExam } from "./core.mjs";

const STORAGE_KEY = "rekenen-state-v1";
const domainNames = { B: "Basis", G: "Grootheden en eenheden", R: "2D en 3D", V: "Verhoudingen", P: "Procenten", K: "Grafieken en tabellen" };
const examDomainOrder = ["G", "R", "V", "P", "K"];
const [legacyBank, curriculum, level4] = await Promise.all([fetch("questions.json").then(requireJson), fetch("curriculum.json").then(requireJson), fetch("level4.json").then(requireJson)]);
const objectiveByCode = new Map(curriculum.objectives.map((objective) => [objective.code, objective]));
const legacyQuestions = legacyBank.map((question) => ({ ...question, kind: question.kind === "diagnostic" ? "legacy-diagnostic" : question.kind }));
const learningQuestions = curriculum.objectives.flatMap((objective) => objective.questions.map((question) => ({
  ...question, domain: objective.domain, objective_codes: [objective.code], level: 3,
  kind: question.kind === "review" ? "review" : "practice", step: question.kind,
})));
const level4Questions = level4.questions.map((question) => ({ ...question, domain: question.objective_code[0], objective_codes: [question.objective_code], level: 4, kind: "practice", step: "independent" }));
const diagnosticBlueprint = {
  G: ["B1", "B2", "B4", "B5", "G1", "G2", "G3", "G5"],
  R: ["R1", "R3", "R5", "R6", "R9", "R10", "R11", "R13"],
  V: ["B6", "V1", "V2", "V3", "V4", "V5", "V6", "V7"],
  P: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
  K: ["K1", "K2", "K4", "K5", "K6", "K9", "K10", "K13"],
};
const level3Diagnostics = Object.entries(diagnosticBlueprint).flatMap(([domain, codes]) => codes.map((code, index) => {
  const source = objectiveByCode.get(code).questions.find((question) => question.kind === "independent");
  return { ...source, id: `DIAG-${domain}-${index + 1}-${code}`, domain, objective_codes: [code], level: 3, kind: "diagnostic" };
}));
const level4ByCode = new Map(level4Questions.map((question) => [question.objective_codes[0], question]));
const level4Diagnostics = Object.entries(diagnosticBlueprint).flatMap(([domain, codes]) => codes.map((code, index) => ({ ...level4ByCode.get(code), id: `DIAG4-${domain}-${index + 1}-${code}`, domain, kind: "diagnostic" })));
const diagnosticQuestions = [...level3Diagnostics, ...level4Diagnostics];
const examObjectives = { G: ["G1", "G2", "G3", "G4", "G5", "G7"], R: ["R3", "R5", "R6", "R10", "R11", "R13"], V: ["V1", "V2", "V3", "V4", "V5", "V6"], P: ["P1", "P2", "P3", "P4", "P5", "P7"], K: ["K2", "K4", "K6", "K9", "K10", "K13"] };
const examQuestions = ["A", "B"].flatMap((exam) => Object.entries(examObjectives).flatMap(([domain, codes]) => codes.map((code, index) => {
  const source = objectiveByCode.get(code).questions.find((question) => question.kind === (exam === "A" ? "independent" : "review"));
  return { ...source, id: `EX-${exam}-${domain}-${index + 1}-${code}`, exam, domain, objective_codes: [code], level: 3, kind: "exam" };
})));
const questions = [...legacyQuestions, ...diagnosticQuestions, ...learningQuestions, ...level4Questions, ...examQuestions];
const questionById = new Map(questions.map((question) => [question.id, question]));
const blankState = { learner: null, attempts: [], diagnosticIndex: 0, selectedAnswer: null, feedback: null, mastery: [], drafts: {}, exams: { A: null, B: null } };
let state = loadState();
let examTickStart = 0;
let examTickCarryMs = 0;
let examTickQid = null;
let examTimerId = null;
let calcOpen = false;
let calcTokens = [];
let calcCurrent = "";
let calcError = null;
let calcErrorExpression = "";
let calcEvaluated = false;
let calcHistory = "";

function requireJson(response) { if (!response.ok) throw new Error(`Bestand kon niet worden geladen: ${response.url}`); return response.json(); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function normalizeStored(source) {
  if (!source?.learner) return structuredClone(blankState);
  try { return { ...blankState, ...importState({ schema_version: 1, ...source }, questions), drafts: source.drafts ?? {} }; }
  catch { return structuredClone(blankState); }
}
function loadState() { try { return normalizeStored(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return structuredClone(blankState); } }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function currentRoute() { return location.hash.replace(/^#\//, "") || "vandaag"; }
function diagnosticCount() { return diagnosticQuestions.filter((question) => question.level === state.learner?.target_level).length; }
function activity() {
  if (state.feedback?.questionId) {
    const question = questionById.get(state.feedback.questionId);
    return question ? { phase: state.feedback.phase, exam: state.feedback.exam ?? null, objective: question.objective_codes[0], question } : null;
  }
  return nextActivity(state, questions);
}

function shell(content, current) {
  return `${content}<nav class="bottom-nav" aria-label="Hoofdnavigatie">${navButton("vandaag", "Vandaag", current)}${navButton("voortgang", "Voortgang", current)}${navButton("begeleider", "Begeleider", current)}</nav>`;
}
function navButton(route, label, current) { return `<button data-route="${route}" aria-current="${route === current ? "page" : "false"}">${label}</button>`; }
function render() {
  const app = document.querySelector("#app");
  const route = currentRoute();
  if (!state.learner) app.innerHTML = renderOnboarding();
  else if (route === "leren") app.innerHTML = shell(renderActivity(), "vandaag");
  else if (route === "voortgang") app.innerHTML = shell(renderProgress(), "voortgang");
  else if (route === "begeleider") app.innerHTML = shell(renderCoach(), "begeleider");
  else app.innerHTML = shell(renderToday(), "vandaag");
  bindEvents();
  manageExamTimer();
  syncCalcWithRoute();
}

function renderOnboarding() {
  return `<p class="eyebrow">Rekenen leren</p><h1>We beginnen bij wat je nog weet.</h1><p>De nulmeting bestaat uit vijf delen. Daarna krijg je steeds één korte uitleg en oefening.</p>
    <div class="card"><h2>Welk niveau wil je halen?</h2><div class="stack"><button class="choice" data-level="3" aria-pressed="false">Mbo-rekenniveau 3</button><button class="choice" data-level="4" aria-pressed="false">Mbo-rekenniveau 4</button></div></div>
    <div class="actions"><button id="start" disabled>Start de nulmeting</button><button class="secondary" id="open-import">Herstel opgeslagen voortgang</button></div><input id="import-file" type="file" accept="application/json,.json" hidden>`;
}

function renderToday() {
  const next = nextActivity(state, questions);
  const results = ["A", "B"].map((examId) => examResultCard(examId, state.exams?.[examId])).join("");
  const locked = ["A", "B"].map((examId) => examLockedCard(examId)).join("");
  if (!next) {
    const failed = ["A", "B"].filter((examId) => state.exams?.[examId]?.result?.passed === false);
    if (failed.length) return `${results}${locked}<p class="eyebrow">Vandaag</p><h1>Nog niet klaar</h1><div class="card"><h2>Oefen de zwakke onderdelen opnieuw</h2><p>Proefexamen ${failed.join(" en ")} is nog niet gehaald. De leerdoelen uit de zwakke domeinen staan opnieuw klaar om te oefenen.</p><button data-route="voortgang">Bekijk voortgang</button></div>`;
    const pending = state.mastery.filter((item) => item.next_review_at).sort((a, b) => a.next_review_at.localeCompare(b.next_review_at))[0];
    return pending
      ? `${results}${locked}<p class="eyebrow">Vandaag</p><h1>Goed gewerkt</h1><div class="card"><h2>Volgende hertoets</h2><p>Je volgende korte herhaling staat gepland voor ${new Date(`${pending.next_review_at}T12:00:00`).toLocaleDateString("nl-NL")}.</p><button data-route="voortgang">Bekijk voortgang</button></div>`
      : `${results}${locked}<p class="eyebrow">Vandaag</p><h1>Alle onderdelen zijn afgerond</h1><div class="card"><p>Bekijk je voortgang of exporteer je resultaten bij Begeleider.</p></div>`;
  }
  if (next.phase === "exam" && next.exam) {
    const session = state.exams?.[next.exam];
    const open = session && !session.submitted_at;
    const title = open ? `Ga verder met proefexamen ${next.exam}` : `Start proefexamen ${next.exam}`;
    const status = open
      ? `Vraag ${session.current_index + 1} van ${session.question_ids.length} · ${formatExamClock(session.elapsed_seconds ?? 0)} / richtijd 90:00`
      : "30 vragen · 6 per domein · richtijd 90:00 · geen hints of feedback tijdens het examen";
    return `${results}${locked}<p class="eyebrow">Vandaag</p><h1>${title}</h1><div class="card"><p class="lesson-meta">Proefexamen ${next.exam}</p><h2>${title}</h2><p>${escapeHtml(status)}</p><button data-route="leren">Ga verder</button></div>`;
  }
  const code = next.objective ?? next.question.objective_codes[0];
  const objective = objectiveByCode.get(code);
  const title = next.phase === "diagnostic" ? "Ga verder met de nulmeting" : next.phase === "recovery" ? "Herstel één denkstap" : next.phase === "review" ? "Tijd voor een hertoets" : next.phase === "exam" ? `Proefexamen ${next.exam ?? next.question.exam ?? ""}`.trim() : "Volgende leerdoel";
  return `${results}${locked}<p class="eyebrow">Vandaag</p><h1>${title}</h1><div class="card"><p class="lesson-meta">${escapeHtml(code)} · ${escapeHtml(domainNames[next.question.domain] ?? objective?.domain)}</p><h2>${escapeHtml(objective?.title ?? next.question.prompt)}</h2><p>${escapeHtml(next.phase === "diagnostic" ? `Vraag ${state.diagnosticIndex + 1} van ${diagnosticCount()}` : objective?.plain_explanation ?? "Je volgende vraag staat klaar.")}</p><button data-route="leren">Ga verder</button></div>`;
}

function renderActivity() {
  const next = activity();
  if (!next) return `<p class="eyebrow">Leren</p><h1>Geen openstaande activiteit</h1><div class="actions"><button data-route="voortgang">Bekijk voortgang</button></div>`;
  if (next.phase === "exam" && next.exam) return renderExamActivity(next);
  const { question, phase } = next;
  const objective = objectiveByCode.get(question.objective_codes[0]);
  const isDiagnostic = phase === "diagnostic";
  const done = state.feedback?.questionId === question.id && !state.feedback.empty;
  const emptyError = state.feedback?.questionId === question.id && state.feedback.empty;
  const draft = state.drafts[question.id] ?? "";
  const answer = question.type === "choice"
    ? `<div class="stack">${question.options.map((option) => `<button class="choice answer" data-answer="${escapeHtml(option)}" aria-pressed="${String(draft) === String(option)}">${escapeHtml(option)}</button>`).join("")}</div>`
    : `<div class="field"><label for="answer">Jouw antwoord${question.unit ? ` in ${escapeHtml(question.unit)}` : ""}</label><input id="answer" inputmode="decimal" autocomplete="off" value="${escapeHtml(draft)}"></div>`;
  const lesson = isDiagnostic || phase === "exam" ? "" : `<section class="worked-example"><h2>${escapeHtml(objective?.title)}</h2><p>${escapeHtml(objective?.plain_explanation)}</p><p><strong>Uitgewerkt voorbeeld:</strong> ${escapeHtml(objective?.worked_example)}</p></section>`;
  const feedback = done || emptyError ? `<div class="feedback ${state.feedback.correct === false || emptyError ? "error" : ""}" role="status"><strong>${emptyError ? "Nog niet." : ["diagnostic", "exam"].includes(phase) ? "Opgeslagen." : state.feedback.correct ? "Goed." : "Bekijk deze stap."}</strong> ${escapeHtml(state.feedback.text)}</div>` : "";
  const position = isDiagnostic ? `<p>Vraag ${state.diagnosticIndex + 1} van ${diagnosticCount()}</p><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${diagnosticCount()}" aria-valuenow="${state.diagnosticIndex}"><span style="width:${(state.diagnosticIndex / diagnosticCount()) * 100}%"></span></div>` : "";
  return `<p class="eyebrow">${isDiagnostic ? `Nulmeting · ${domainNames[question.domain]}` : phase === "exam" ? `Proefexamen ${question.exam}` : `${question.objective_codes[0]} · ${domainNames[objective?.domain]}`}</p>${position}${lesson}<section class="exercise"><h1>${escapeHtml(question.prompt)}</h1>${visualFor(question)}${answer}${feedback}</section><div class="actions">${done ? `<button id="next-activity">Volgende</button>` : `<button id="check-answer">${isDiagnostic ? "Sla antwoord op" : "Controleer antwoord"}</button>`}<button class="secondary" id="calc-toggle" aria-expanded="${calcOpen ? "true" : "false"}" aria-controls="calc-panel">Rekenmachine</button><button class="secondary" data-route="vandaag">Bewaar en stop</button></div>`;
}

function renderExamActivity(next) {
  const session = state.exams?.[next.exam];
  if (!session) return examStartScreen(next.exam);
  if (session.submitted_at) return examResultView(next.exam, session);
  return examQuestionView(next, session);
}

function examStartScreen(examId) {
  return `<p class="eyebrow">Proefexamen ${examId}</p><h1>Start proefexamen ${examId}</h1><div class="card"><h2>30 vragen in vaste volgorde</h2><p>6 vragen per domein in de volgorde grootheden, 2D en 3D, verhoudingen, procenten, grafieken en tabellen. Richtijd 90:00; er is geen harde tijdslimiet.</p><p>Geen hints, geen lesblok en geen directe uitslag. Elk antwoord wordt direct bewaard; stoppen en hervatten kan op elk moment. Inleveren kan op vraag 30.</p><div class="actions"><button id="start-exam" data-exam="${examId}">Start proefexamen ${examId}</button><button class="secondary" data-route="vandaag">Bewaar en stop</button></div></div>`;
}

function examStrip(session) {
  const answered = new Set(Object.keys(session.answers ?? {}));
  const byDomain = { G: [], R: [], V: [], P: [], K: [] };
  for (const qid of session.question_ids) {
    const domain = questionById.get(qid)?.domain;
    if (domain && byDomain[domain]) byDomain[domain].push(qid);
  }
  const head = `<thead><tr><th scope="col">Domein</th>${["1", "2", "3", "4", "5", "6"].map((number) => `<th scope="col">${number}</th>`).join("")}</tr></thead>`;
  const body = examDomainOrder.map((domain) => {
    const cells = byDomain[domain].map((qid, index) => {
      const done = answered.has(qid);
      return `<td aria-label="${escapeHtml(domainNames[domain])} vraag ${index + 1}: ${done ? "beantwoord" : "open"}">${done ? "✓" : "·"}</td>`;
    }).join("");
    return `<tr><th scope="row">${domain}</th>${cells}</tr>`;
  }).join("");
  return `<table class="data-table"><caption>Overzicht per domein: ✓ is beantwoord, · is open</caption>${head}<tbody>${body}</tbody></table>`;
}

function examQuestionView(next, session) {
  const total = session.question_ids.length;
  const index = Math.min(Math.max(0, session.current_index ?? 0), total - 1);
  const question = questionById.get(session.question_ids[index]);
  if (!question) return `<p class="eyebrow">Proefexamen ${next.exam}</p><h1>Antwoord kan niet worden getoond</h1><div class="actions"><button data-route="vandaag">Bewaar en stop</button></div>`;
  const answered = Object.keys(session.answers ?? {}).length;
  const feedbackDone = state.feedback?.questionId === question.id && !state.feedback.empty;
  const emptyError = state.feedback?.questionId === question.id && state.feedback.empty;
  const draft = state.drafts[question.id] ?? "";
  const hasStoredAnswer = isExamQuestionAnswered(session, question.id);
  let draftDiffers = false;
  if (hasStoredAnswer && !emptyError && draft !== "" && draft != null) {
    const storedRaw = session.answers[question.id];
    const storedValue = storedRaw != null && typeof storedRaw === "object" && "answer" in storedRaw ? storedRaw.answer : storedRaw;
    try {
      const normalized = scoreAnswer(question, draft);
      draftDiffers = normalized.value === null
        ? String(draft).trim() !== String(storedValue ?? "").trim()
        : String(normalized.value) !== String(storedValue);
    } catch { draftDiffers = String(draft) !== String(storedValue); }
  }
  const storedDone = hasStoredAnswer && !draftDiffers;
  const done = feedbackDone || storedDone;
  const answer = question.type === "choice"
    ? `<div class="stack">${question.options.map((option) => `<button class="choice answer" data-answer="${escapeHtml(option)}" aria-pressed="${String(draft) === String(option)}">${escapeHtml(option)}</button>`).join("")}</div>`
    : `<div class="field"><label for="answer">Jouw antwoord${question.unit ? ` in ${escapeHtml(question.unit)}` : ""}</label><input id="answer" inputmode="decimal" autocomplete="off" value="${escapeHtml(draft)}"></div>`;
  const storedFeedbackText = "Antwoord opgeslagen. De uitslag volgt na het proefexamen.";
  const feedback = done || emptyError ? `<div class="feedback ${emptyError ? "error" : ""}" role="status"><strong>${emptyError ? "Nog niet." : "Opgeslagen."}</strong> ${escapeHtml(emptyError ? state.feedback.text : feedbackDone ? state.feedback.text : storedFeedbackText)}</div>` : "";
  const elapsed = session.elapsed_seconds ?? 0;
  const timerText = elapsed >= EXAM_GUIDELINE_SECONDS ? "richttijd voorbij, maak rustig af" : `${formatExamClock(elapsed)} / richtijd 90:00`;
  const allAnswered = session.question_ids.every((qid) => Object.hasOwn(session.answers ?? {}, qid));
  const actions = done
    ? (allAnswered && index === total - 1
      ? `<button id="submit-exam" data-exam="${next.exam}">Lever proefexamen ${next.exam} in</button>`
      : `<button id="next-activity">Volgende</button>`)
    : `<button id="check-answer">Sla antwoord op</button>`;
  return `<p class="eyebrow">Proefexamen ${next.exam} · ${escapeHtml(domainNames[question.domain])}</p><p id="exam-timer" role="timer">${escapeHtml(timerText)}</p><p>Vraag ${index + 1} van ${total}</p><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${answered}"><span style="width:${(answered / total) * 100}%"></span></div>${examStrip(session)}<section class="exercise"><h1>${escapeHtml(question.prompt)}</h1>${visualFor(question)}${answer}${feedback}</section><div class="actions">${actions}<button class="secondary" id="calc-toggle" aria-expanded="${calcOpen ? "true" : "false"}" aria-controls="calc-panel">Rekenmachine</button><button class="secondary" data-route="vandaag">Bewaar en stop</button></div>`;
}

function examResultTable(session) {
  const result = session.result;
  const rows = examDomainOrder.map((domain) => {
    const pct = result.per_domain[domain] ?? 0;
    return `<tr><th scope="row">${escapeHtml(domainNames[domain])}</th><td>${pct}%</td><td>${pct >= 70 ? "✓" : "·"} norm 70%</td></tr>`;
  }).join("");
  return `<table class="data-table"><caption>Uitslag per domein: ✓ haalt de norm, · niet</caption><thead><tr><th scope="col">Domein</th><th scope="col">Score</th><th scope="col">Norm</th></tr></thead><tbody>${rows}<tr><th scope="row">Totaal</th><td><strong>${result.total_pct}%</strong></td><td>norm 80%</td></tr></tbody></table>`;
}

function examAdvice(examId, session) {
  const result = session.result;
  const weak = examDomainOrder.filter((domain) => (result.per_domain[domain] ?? 0) < 70);
  if (result.passed) return `Gehaald met ${result.total_pct}%: elk domein haalt minimaal 70% (praktisch: minstens 5 van 6 per domein).${examId === "A" ? " Maak daarna proefexamen B." : " Beide proefexamens zijn ingeleverd."}`;
  return `Nog niet gehaald met ${result.total_pct}%: nodig is 80% totaal en minimaal 70% per domein (praktisch: minstens 5 van 6). Herhaal ${weak.map((domain) => domainNames[domain]).join(", ") || "de zwakste domeinen"} en ${examId === "A" ? "maak daarna proefexamen B" : "overleg met je begeleider over een herkansing"}.`;
}

function examResultCard(examId, session) {
  if (!session?.submitted_at || !session?.result) return "";
  const verdict = session.result.passed ? "gehaald" : "nog niet gehaald";
  return `<section class="card"><h2>Proefexamen ${examId}: ${verdict} (${session.result.total_pct}%)</h2>${examResultTable(session)}<p>${escapeHtml(examAdvice(examId, session))}</p></section>`;
}

function examLockedCard(examId) {
  const reason = examLockReason(state, questions, examId);
  if (!reason) return "";
  return `<section class="card"><h2>Proefexamen ${examId}: vergrendeld</h2><p>${escapeHtml(reason)}</p></section>`;
}

function examResultView(examId, session) {
  return `<p class="eyebrow">Proefexamen ${examId}</p><h1>Uitslag proefexamen ${examId}</h1>${examResultCard(examId, session)}<div class="actions"><button data-route="vandaag">Terug naar vandaag</button></div>`;
}

function stopExamTimer() { if (examTimerId) { clearInterval(examTimerId); examTimerId = null; } }

function takeExamElapsed(questionId) {
  if (!examTickStart || examTickQid !== questionId) return 0;
  const seconds = Math.max(0, Math.floor((examTickCarryMs + Date.now() - examTickStart) / 1000));
  examTickQid = null; examTickCarryMs = 0; examTickStart = 0;
  return seconds;
}

function flushExamTimer() {
  const active = getActiveExamState();
  if (!active) return;
  active.session.elapsed_seconds = (active.session.elapsed_seconds ?? 0) + takeExamElapsed(active.questionId);
}

function getActiveExamState() {
  for (const examId of ["A", "B"]) {
    const session = state.exams?.[examId];
    if (session && !session.submitted_at) return { session, questionId: session.question_ids[session.current_index] };
  }
  return null;
}

function startExamTimer(session) {
  stopExamTimer();
  const now = Date.now();
  const qid = session.question_ids[session.current_index];
  if (examTickQid === qid && examTickStart) examTickCarryMs += Math.max(0, now - examTickStart);
  else { examTickQid = qid; examTickCarryMs = 0; }
  examTickStart = now;
  const base = session.elapsed_seconds ?? 0;
  const tick = () => {
    const timer = document.querySelector("#exam-timer");
    if (!timer) { stopExamTimer(); return; }
    const total = base + Math.floor((examTickCarryMs + Date.now() - examTickStart) / 1000);
    timer.textContent = total >= EXAM_GUIDELINE_SECONDS ? "richttijd voorbij, maak rustig af" : `${formatExamClock(total)} / richtijd 90:00`;
  };
  tick();
  examTimerId = setInterval(tick, 1000);
}

function manageExamTimer() {
  const current = state.learner ? activity() : null;
  const session = current?.phase === "exam" && current?.exam ? state.exams?.[current.exam] : null;
  if (!session || session.submitted_at || state.feedback?.questionId || !document.querySelector("#exam-timer")) { stopExamTimer(); return; }
  const qid = session.question_ids[session.current_index];
  if (qid != null && isExamQuestionAnswered(session, qid)) {
    const draft = state.drafts[qid] ?? "";
    if (draft === "" || draft == null) { stopExamTimer(); return; }
    const question = questionById.get(qid);
    if (question) {
      try {
        const storedRaw = session.answers[qid];
        const storedValue = storedRaw != null && typeof storedRaw === "object" && "answer" in storedRaw ? storedRaw.answer : storedRaw;
        const normalized = scoreAnswer(question, draft);
        const differs = normalized.value === null
          ? String(draft).trim() !== String(storedValue ?? "").trim()
          : String(normalized.value) !== String(storedValue);
        if (!differs) { stopExamTimer(); return; }
      } catch { stopExamTimer(); return; }
    } else { stopExamTimer(); return; }
  }
  startExamTimer(session);
}

function visualFor(question) {
  if (question.visual) {
    const generic = visualFromDescriptor(question.visual);
    if (generic) return generic;
  }
  const code = question.objective_codes[0];
  if (question.id === "K2-guided") return `<table class="data-table"><caption>Verkochte boeken</caption><thead><tr><th>Maand</th><th>Boeken</th></tr></thead><tbody><tr><td>Januari</td><td>12</td></tr><tr><td>Februari</td><td>18</td></tr><tr><td>Maart</td><td>15</td></tr></tbody></table>`;
  if (question.id === "K2-independent") return `<table class="data-table"><caption>Reizigers per bus</caption><thead><tr><th>Bus</th><th>Reizigers</th></tr></thead><tbody><tr><td>A</td><td>24</td></tr><tr><td>B</td><td>31</td></tr></tbody></table>`;
  if (question.id === "K2-review") return `<table class="data-table"><caption>Omzet per dag</caption><thead><tr><th>Dag</th><th>Omzet</th></tr></thead><tbody><tr><td>Maandag</td><td>€14</td></tr><tr><td>Dinsdag</td><td>€19</td></tr><tr><td>Woensdag</td><td>€17</td></tr></tbody></table>`;
  if (code === "K3") return `<table class="data-table"><caption>Frequenties</caption><thead><tr><th>Groep</th><th>Aantal</th></tr></thead><tbody><tr><td>Rood</td><td>4</td></tr><tr><td>Blauw</td><td>7</td></tr><tr><td>Groen</td><td>3</td></tr></tbody></table>`;
  if (question.id === "K6-guided") return visualBarChart({ title: "Waarde aflezen", labels: ["balk"], values: [40], y_label: "waarde" });
  if (question.id === "K6-independent") return visualLineChart({ title: "Punt tussen schaalstappen", labels: ["30", "punt", "40"], values: [30, 35, 40], y_label: "waarde" });
  if (question.id === "K6-review") return visualLineChart({ title: "Waarde per maand", labels: ["januari", "februari"], values: [18, 26], y_label: "waarde" });
  if (code === "K13") return `<figure><svg class="question-figure" viewBox="0 0 320 180" role="img" aria-label="Misleidende staafgrafiek waarvan de verticale as pas bij tachtig begint"><path d="M50 20V145H295" fill="none" stroke="#17212b" stroke-width="2"/><g fill="#56616b" font-size="12"><text x="18" y="149">80</text><text x="18" y="94">90</text><text x="12" y="29">100</text></g><rect x="90" y="90" width="65" height="55" fill="#176b68"/><rect x="195" y="35" width="65" height="110" fill="#b86b16"/></svg><figcaption>De as begint bij 80, niet bij 0.</figcaption></figure>`;
  if (question.id === "R5-independent") return visualNet({ solid: "driehoekig prisma", faces: ["driehoek", "driehoek", "rechthoek", "rechthoek", "rechthoek"] });
  if (code === "R5") return `<figure><svg class="question-figure" viewBox="0 0 320 210" role="img" aria-label="Uitslag van een kubus met zes vierkante vlakken"><g fill="#e9f3f1" stroke="#176b68" stroke-width="3"><rect x="110" y="10" width="50" height="50"/><rect x="60" y="60" width="50" height="50"/><rect x="110" y="60" width="50" height="50"/><rect x="160" y="60" width="50" height="50"/><rect x="210" y="60" width="50" height="50"/><rect x="110" y="110" width="50" height="50"/></g></svg><figcaption>Een uitslag vouw je langs de randen tot een ruimtelijke vorm.</figcaption></figure>`;
  if (question.id === "R6-review") return visualBlockHeights({ grid: [[1, 3, 2]], view: "front" });
  if (["R6", "R9", "R10"].includes(code)) return `<figure><svg class="question-figure" viewBox="0 0 320 190" role="img" aria-label="Balk met lengte acht, breedte drie en hoogte vijf"><path d="M65 70L200 70L255 35L120 35Z M65 70V145L200 145V70 M200 145L255 110V35" fill="#e9f3f1" fill-opacity=".7" stroke="#176b68" stroke-width="3"/><g fill="#17212b" font-size="14"><text x="125" y="165">8 cm</text><text x="225" y="135">3 cm</text><text x="38" y="112">5 cm</text></g></svg><figcaption>Let op welk aanzicht of welke schaal de vraag gebruikt.</figcaption></figure>`;
  if (question.id === "R7-independent") return visualCrossSection({ solid: "kubus", plane: "verticaal en diagonaal door het midden" });
  if (code === "R7") return `<figure><svg class="question-figure" viewBox="0 0 320 180" role="img" aria-label="Cilinder die horizontaal wordt doorgesneden, met een cirkel als doorsnede"><ellipse cx="115" cy="35" rx="55" ry="18" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M60 35V135M170 35V135" stroke="#176b68" stroke-width="3"/><ellipse cx="115" cy="135" rx="55" ry="18" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M50 85H180" stroke="#b86b16" stroke-width="4" stroke-dasharray="7 5"/></svg><figcaption>De stippellijn geeft het snijvlak aan.</figcaption></figure>`;
  return "";
}

function visualFromDescriptor(visual) {
  if (!visual?.kind) return "";
  if (visual.kind === "table") return tableHtmlFor(visual);
  if (visual.kind === "bar-chart") return visualBarChart(visual);
  if (visual.kind === "line-chart") return visualLineChart(visual);
  if (visual.kind === "combined") return visualCombined(visual);
  if (visual.kind === "net") return visualNet(visual);
  if (visual.kind === "block-heights") return visualBlockHeights(visual);
  if (visual.kind === "cross-section") return visualCrossSection(visual);
  if (visual.kind === "rotation") return visualRotation(visual);
  if (visual.kind === "map-scale") return visualMapScale(visual);
  if (visual.kind === "scale-drawing") return visualScaleDrawing(visual);
  if (visual.kind === "composite-shape") return visualCompositeShape(visual);
  if (visual.kind === "open-box") return visualOpenBox(visual);
  if (visual.kind === "cylinder") return visualCylinder(visual);
  if (visual.kind === "packing") return visualPacking(visual);
  return "";
}

function fmtNum(value) {
  if (value === null || value === undefined || value === "") return "?";
  if (typeof value === "number") return value.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  return escapeHtml(value);
}
function fmtComma(value) {
  if (typeof value === "number") return value.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  return escapeHtml(value);
}
function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  const raw = value * 1.12;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / power;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * power;
}
function niceStep(range) {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const raw = range / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / power;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * power;
}
function yDomainFor(values, given) {
  if (given && Number.isFinite(given.min) && Number.isFinite(given.max)) return { min: given.min, max: given.max, step: given.step ?? niceStep(given.max - given.min) };
  const max = Math.max(0, ...values.filter((value) => typeof value === "number"));
  const maxNice = niceCeil(max);
  return { min: 0, max: maxNice, step: niceStep(maxNice) };
}

function tableHtmlFor(descriptor) {
  const columns = descriptor.columns ?? [];
  const rows = descriptor.rows ?? [];
  const unitNote = descriptor.unit ? ` (bedragen in ${escapeHtml(descriptor.unit)})` : "";
  const head = `<thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell === null || cell === undefined ? "?" : typeof cell === "number" ? fmtNum(cell) : escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  let foot = "";
  if (descriptor.total !== undefined && columns.length > 1) {
    const cells = columns.map((_, index) => {
      if (index === 0) return `<td><strong>Totaal</strong></td>`;
      if (index === columns.length - 1) return `<td><strong>${fmtNum(descriptor.total)}</strong></td>`;
      return `<td></td>`;
    }).join("");
    foot = `<tfoot><tr>${cells}</tr></tfoot>`;
  }
  return `<table class="data-table"><caption>Gegevens bij de vraag${unitNote}</caption>${head}${body}${foot}</table>`;
}

function barSvgFor(descriptor) {
  const series = descriptor.series ?? [];
  const values = series.map((item) => item.value).filter((value) => typeof value === "number");
  const { min, max, step } = yDomainFor(values, descriptor.y_axis);
  const left = 46, right = 12, top = 16, bottom = 36, width = 320, height = 196;
  const plotW = width - left - right, plotH = height - top - bottom;
  const yPos = (value) => top + plotH - ((value - min) / (max - min || 1)) * plotH;
  let grid = "";
  for (let value = min; value <= max + 1e-9; value += step) {
    const y = Math.round(yPos(value) * 10) / 10;
    grid += `<path d="M${left} ${y}H${width - right}" stroke="#d9ded8" stroke-width="1"/><text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#56616b">${fmtNum(Math.round(value * 100) / 100)}</text>`;
  }
  const slot = plotW / Math.max(1, series.length);
  const barW = Math.min(64, slot * 0.52);
  let bars = "";
  series.forEach((item, index) => {
    const center = left + slot * index + slot / 2;
    const x = Math.round((center - barW / 2) * 10) / 10;
    const y = Math.round(yPos(item.value) * 10) / 10;
    const base = top + plotH;
    const fill = index % 2 === 0 ? "#176b68" : "#b86b16";
    bars += `<rect x="${x}" y="${y}" width="${Math.round(barW * 10) / 10}" height="${Math.max(2, Math.round((base - y) * 10) / 10)}" fill="${fill}" rx="3"/><text x="${Math.round(center * 10) / 10}" y="${Math.round((y - 6) * 10) / 10}" text-anchor="middle" font-size="12" font-weight="700" fill="#17212b">${fmtNum(item.value)}</text><text x="${Math.round(center * 10) / 10}" y="${top + plotH + 20}" text-anchor="middle" font-size="12" fill="#56616b">${escapeHtml(item.label)}</text>`;
  });
  const summary = series.map((item) => `${item.label}: ${fmtComma(item.value)}`).join(", ");
  return { svg: `<svg class="question-figure" viewBox="0 0 ${width} ${height}" role="img" aria-label="Staafdiagram van ${escapeHtml(descriptor.y_label ?? "waarde")} per ${escapeHtml(descriptor.x_label ?? "categorie")}: ${escapeHtml(summary)}. As van ${fmtNum(min)} tot ${fmtNum(max)}."><path d="M${left} ${top}V${top + plotH}H${width - right}" fill="none" stroke="#17212b" stroke-width="2"/>${grid}${bars}</svg>`, min, max };
}

function visualBarChart(descriptor) {
  const { svg, min, max } = barSvgFor(descriptor);
  const shortAxis = min !== 0 ? " De as begint niet bij nul, waardoor een klein verschil groot lijkt." : "";
  return `<figure>${svg}<figcaption>Staafdiagram van ${escapeHtml(descriptor.y_label ?? "de waarde")} per ${escapeHtml(descriptor.x_label ?? "categorie")}. De as loopt van ${fmtNum(min)} tot ${fmtNum(max)}.${shortAxis}</figcaption></figure>`;
}

function lineSvgFor(descriptor) {
  const series = descriptor.series ?? [];
  const allValues = series.flatMap((line) => (line.points ?? []).map((point) => point[1])).filter((value) => typeof value === "number");
  const { min, max, step } = yDomainFor(allValues, descriptor.y_axis);
  const labels = [];
  series.forEach((line) => (line.points ?? []).forEach((point) => { const key = String(point[0]); if (!labels.includes(key)) labels.push(key); }));
  const left = 46, right = 12, top = 30, bottom = 36, width = 320, height = 208;
  const plotW = width - left - right, plotH = height - top - bottom;
  const xPos = (index) => labels.length === 1 ? left + plotW / 2 : left + (index / (labels.length - 1)) * plotW;
  const yPos = (value) => top + plotH - ((value - min) / (max - min || 1)) * plotH;
  const colors = ["#176b68", "#b86b16", "#17212b"];
  let grid = "";
  for (let value = min; value <= max + 1e-9; value += step) {
    const y = Math.round(yPos(Math.round(value * 100) / 100) * 10) / 10;
    grid += `<path d="M${left} ${y}H${width - right}" stroke="#d9ded8" stroke-width="1"/><text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#56616b">${fmtNum(Math.round(value * 100) / 100)}</text>`;
  }
  let dots = "";
  dots += labels.map((label, index) => `<text x="${Math.round(xPos(index) * 10) / 10}" y="${top + plotH + 20}" text-anchor="middle" font-size="11" fill="#56616b">${escapeHtml(label)}</text>`).join("");
  let lines = "";
  series.forEach((line, lineIndex) => {
    const color = colors[lineIndex % colors.length];
    const coords = (line.points ?? []).map((point) => {
      const index = labels.indexOf(String(point[0]));
      return [xPos(index), yPos(point[1]), point[0], point[1]];
    });
    const path = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${Math.round(coord[0] * 10) / 10} ${Math.round(coord[1] * 10) / 10}`).join("");
    lines += `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    coords.forEach((coord) => { lines += `<circle cx="${Math.round(coord[0] * 10) / 10}" cy="${Math.round(coord[1] * 10) / 10}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="2"/>`; });
  });
  const legend = series.map((line, index) => {
    const x = left + index * 118;
    const color = colors[index % colors.length];
    return `<circle cx="${x}" cy="14" r="5" fill="${color}"/><text x="${x + 10}" y="18" font-size="12" fill="#17212b">${escapeHtml(line.label)}</text>`;
  }).join("");
  const summary = series.map((line) => `${line.label}: ${(line.points ?? []).map((point) => `${point[0]} ${fmtComma(point[1])}`).join(", ")}`).join("; ");
  return { svg: `<svg class="question-figure" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lijngrafiek van ${escapeHtml(descriptor.y_label ?? "waarde")} per ${escapeHtml(descriptor.x_label ?? "tijd")}: ${escapeHtml(summary)}."><path d="M${left} ${top}V${top + plotH}H${width - right}" fill="none" stroke="#17212b" stroke-width="2"/>${grid}${dots}${lines}${legend}</svg>`, min, max };
}

function visualLineChart(descriptor) {
  const { svg } = lineSvgFor(descriptor);
  const note = descriptor.note ? ` Let op: ${escapeHtml(descriptor.note)}.` : "";
  return `<figure>${svg}<figcaption>Lijngrafiek van ${escapeHtml(descriptor.y_label ?? "de waarde")} per ${escapeHtml(descriptor.x_label ?? "tijd")}. Lees de punten van links naar rechts.${note}</figcaption></figure>`;
}

function visualCombined(descriptor) {
  const table = descriptor.table ? tableHtmlFor(descriptor.table) : "";
  const bar = descriptor.bar_chart ? barSvgFor(descriptor.bar_chart).svg : "";
  return `<figure>${table}${bar}<figcaption>Combineer beide bronnen: lees eerst de tabel en daarna de staafgrafiek. Vermenigvuldig het verbruik met het tarief.</figcaption></figure>`;
}

function visualNet(visual) {
  const triangles = visual.faces?.triangles ?? 2;
  const rectangles = visual.faces?.rectangles ?? 3;
  return `<figure><svg class="question-figure" viewBox="0 0 320 190" role="img" aria-label="Uitslag van een ${escapeHtml(visual.shape ?? "prisma")} met ${triangles} driehoeken en ${rectangles} rechthoeken"><g fill="#e9f3f1" stroke="#176b68" stroke-width="3" stroke-linejoin="round"><rect x="76" y="70" width="56" height="44"/><rect x="132" y="70" width="56" height="44"/><rect x="188" y="70" width="56" height="44"/><path d="M132 70H188L160 32Z"/><path d="M132 114H188L160 152Z"/></g><g font-size="11" fill="#56616b" text-anchor="middle"><text x="160" y="24">driehoek</text><text x="160" y="170">driehoek</text><text x="160" y="96">rechthoek</text></g></svg><figcaption>Uitslag met ${triangles} driehoeken en ${rectangles} rechthoeken. Vouw langs de randen tot een ${escapeHtml(visual.shape ?? "prisma")}.</figcaption></figure>`;
}

function visualBlockHeights(visual) {
  const heights = visual.heights ?? [];
  const labels = visual.labels ?? heights.map((_, index) => `vak ${index + 1}`);
  const count = Math.max(1, heights.length);
  const gap = 12, margin = 24, size = Math.min(76, (320 - margin * 2 - (count - 1) * gap) / count);
  const totalW = count * size + (count - 1) * gap;
  const startX = (320 - totalW) / 2;
  let cells = "";
  heights.forEach((height, index) => {
    const x = startX + index * (size + gap);
    const center = x + size / 2;
    cells += `<rect x="${Math.round(x * 10) / 10}" y="18" width="${Math.round(size * 10) / 10}" height="${Math.round(size * 10) / 10}" fill="#e9f3f1" stroke="#176b68" stroke-width="3" rx="4"/><text x="${Math.round(center * 10) / 10}" y="${18 + size / 2 + 10}" text-anchor="middle" font-size="28" font-weight="800" fill="#17212b">${fmtNum(height)}</text><text x="${Math.round(center * 10) / 10}" y="${18 + size + 20}" text-anchor="middle" font-size="12" fill="#56616b">${escapeHtml(labels[index] ?? "")}</text>`;
  });
  const summary = heights.map((height, index) => `${labels[index] ?? ""} ${height}`).join(", ");
  return `<figure><svg class="question-figure" viewBox="0 0 320 150" role="img" aria-label="Bovenaanzicht met hoogtes: ${escapeHtml(summary)} blokken">${cells}</svg><figcaption>Bovenaanzicht met het aantal blokken per vak (${escapeHtml(summary)}). Tel de vakken bij elkaar op.</figcaption></figure>`;
}

function visualCrossSection(visual) {
  return `<figure><svg class="question-figure" viewBox="0 0 320 180" role="img" aria-label="Een ${escapeHtml(visual.solid ?? "kubus")} met een verticale stippellijn als snijvlak"><rect x="100" y="28" width="120" height="120" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M160 28V148" stroke="#b86b16" stroke-width="4" stroke-dasharray="7 5"/><text x="170" y="92" font-size="12" fill="#b86b16">snijvlak</text></svg><figcaption>De ${escapeHtml(visual.solid ?? "kubus")} wordt gesneden ${escapeHtml(visual.plane ?? "door het midden")}. De stippellijn is het snijvlak.</figcaption></figure>`;
}

function visualRotation(visual) {
  const degrees = visual.degrees_clockwise ?? 0;
  return `<figure><svg class="question-figure" viewBox="0 0 320 180" role="img" aria-label="Pijl die omhoog wijst en ${degrees} graden met de klok mee draait"><circle cx="160" cy="95" r="52" fill="none" stroke="#d9ded8" stroke-width="2"/><path d="M160 43 A52 52 0 1 1 108 95" fill="none" stroke="#b86b16" stroke-width="3" stroke-dasharray="6 4"/><path d="M160 95V43" stroke="#56616b" stroke-width="3"/><path d="M160 33L153 45H167Z" fill="#56616b"/><path d="M160 95H108" stroke="#176b68" stroke-width="4"/><path d="M98 95L110 88V102Z" fill="#176b68"/><text x="160" y="28" text-anchor="middle" font-size="12" fill="#56616b">start: ${escapeHtml(visual.start ?? "omhoog")}</text><text x="160" y="172" text-anchor="middle" font-size="12" fill="#56616b">${fmtNum(degrees)}° met de klok mee</text></svg><figcaption>De pijl wijst eerst ${escapeHtml(visual.start ?? "omhoog")} en draait ${fmtNum(degrees)}° met de klok mee. Dat zijn drie kwartslagen.</figcaption></figure>`;
}

function visualMapScale(visual) {
  const route = fmtNum(visual.route_cm ?? 0);
  const scale = escapeHtml(visual.scale ?? "");
  const label = escapeHtml(visual.labels?.distance ?? "route");
  return `<figure><svg class="question-figure" viewBox="0 0 320 160" role="img" aria-label="Kaart met ${label} van ${route} centimeter bij schaal ${scale}"><rect x="12" y="12" width="296" height="136" rx="10" fill="#f7f8f4" stroke="#d9ded8" stroke-width="1"/><path d="M40 112 C80 92 100 122 140 96 S220 58 280 70" fill="none" stroke="#b86b16" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="112" r="6" fill="#176b68"/><circle cx="280" cy="70" r="6" fill="#176b68"/><text x="40" y="132" font-size="11" fill="#56616b">start</text><text x="280" y="90" text-anchor="end" font-size="11" fill="#56616b">einde</text><text x="160" y="42" text-anchor="middle" font-size="12" fill="#17212b">${label}: ${route} cm op de kaart</text><text x="160" y="60" text-anchor="middle" font-size="12" fill="#56616b">schaal ${scale}</text></svg><figcaption>Op de kaart is de ${label} ${route} cm. De schaal is ${scale}; reken de centimeters om naar kilometers.</figcaption></figure>`;
}

function visualScaleDrawing(visual) {
  const real = fmtNum(visual.real_width_m ?? 0);
  const scale = escapeHtml(visual.scale ?? "");
  return `<figure><svg class="question-figure" viewBox="0 0 320 140" role="img" aria-label="Wand van ${real} meter in werkelijkheid op schaal ${scale}"><text x="160" y="22" text-anchor="middle" font-size="12" fill="#17212b">${real} m in werkelijkheid</text><path d="M40 36V44M280 36V44M40 40H280" stroke="#17212b" stroke-width="2"/><rect x="40" y="56" width="240" height="28" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><text x="160" y="118" text-anchor="middle" font-size="12" fill="#56616b">schaal ${scale}</text></svg><figcaption>De wand is ${real} m breed in werkelijkheid en staat op schaal ${scale} op papier. Reken eerst om naar centimeters.</figcaption></figure>`;
}

function visualCompositeShape(visual) {
  const outerW = visual.outer?.width_m ?? 8;
  const outerH = visual.outer?.height_m ?? 5;
  const cutW = visual.cutout?.width_m ?? 3;
  const cutH = visual.cutout?.height_m ?? 2;
  return `<figure><svg class="question-figure" viewBox="0 0 320 190" role="img" aria-label="L-vorm van ${fmtNum(outerW)} bij ${fmtNum(outerH)} meter zonder hoek van ${fmtNum(cutW)} bij ${fmtNum(cutH)} meter"><text x="160" y="18" text-anchor="middle" font-size="12" fill="#17212b">${fmtNum(outerW)} m</text><text x="40" y="92" text-anchor="middle" font-size="12" fill="#17212b">${fmtNum(outerH)} m</text><path d="M64 26H184V74H256V146H64Z" fill="#e9f3f1" stroke="#176b68" stroke-width="3" stroke-linejoin="round"/><rect x="184" y="26" width="72" height="48" fill="none" stroke="#b86b16" stroke-width="3" stroke-dasharray="6 4"/><text x="220" y="52" text-anchor="middle" font-size="11" fill="#b86b16">${fmtNum(cutW)} × ${fmtNum(cutH)} weg</text></svg><figcaption>L-vorm van ${fmtNum(outerW)} bij ${fmtNum(outerH)} m met een hoek van ${fmtNum(cutW)} bij ${fmtNum(cutH)} m eruit. Trek het kleine stuk van het grote stuk af.</figcaption></figure>`;
}

function visualOpenBox(visual) {
  const length = visual.length_cm ?? 60;
  const width = visual.width_cm ?? 40;
  const height = visual.height_cm ?? 30;
  const lidText = visual.lid ? "met deksel" : "zonder deksel";
  return `<figure><svg class="question-figure" viewBox="0 0 320 248" role="img" aria-label="Uitslag van een open bak van ${length} bij ${width} bij ${height} centimeter"><g fill="#e9f3f1" stroke="#176b68" stroke-width="3" stroke-linejoin="round"><rect x="100" y="30" width="120" height="60"/><rect x="40" y="90" width="60" height="80"/><rect x="100" y="90" width="120" height="80"/><rect x="220" y="90" width="60" height="80"/><rect x="100" y="170" width="120" height="60"/></g><g font-size="11" fill="#17212b" text-anchor="middle"><text x="160" y="65">${fmtNum(length)} × ${fmtNum(height)}</text><text x="70" y="134">${fmtNum(width)} × ${fmtNum(height)}</text><text x="160" y="134">bodem ${fmtNum(length)} × ${fmtNum(width)}</text><text x="250" y="134">${fmtNum(width)} × ${fmtNum(height)}</text><text x="160" y="204">${fmtNum(length)} × ${fmtNum(height)}</text></g></svg><figcaption>Open bak ${lidText} van ${fmtNum(length)} × ${fmtNum(width)} × ${fmtNum(height)} cm. Tel de bodem plus de vier zijden op.</figcaption></figure>`;
}

function visualCylinder(visual) {
  const radius = fmtNum(visual.radius_m ?? 0);
  const height = fmtNum(visual.height_m ?? 0);
  const pi = fmtNum(visual.pi ?? 3.14);
  return `<figure><svg class="question-figure" viewBox="0 0 320 190" role="img" aria-label="Cilinder met straal ${radius} meter en hoogte ${height} meter"><ellipse cx="150" cy="46" rx="60" ry="18" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M90 46V144M210 46V144" stroke="#176b68" stroke-width="3"/><ellipse cx="150" cy="144" rx="60" ry="18" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M150 46H210" stroke="#b86b16" stroke-width="3"/><text x="180" y="36" text-anchor="middle" font-size="12" fill="#b86b16">straal ${radius} m</text><text x="232" y="100" font-size="12" fill="#17212b">${height} m</text></svg><figcaption>Cilinder met straal ${radius} m en hoogte ${height} m. Reken met π = ${pi} en reken daarna om naar liters.</figcaption></figure>`;
}

function visualPacking(visual) {
  const box = visual.box_cm ?? [];
  const space = visual.space_m ?? [];
  const spaceCm = space.map((value) => Math.round(value * 100));
  const fits = box.map((edge, index) => edge ? Math.floor((spaceCm[index] ?? 0) / edge) : 0);
  const fitsText = fits.join(" × ");
  return `<figure><svg class="question-figure" viewBox="0 0 320 172" role="img" aria-label="Opslagvak met ${fitsText} dozen per richting"><rect x="70" y="30" width="180" height="105" fill="#e9f3f1" stroke="#176b68" stroke-width="3" rx="4"/><path d="M160 30V135M70 82H250" stroke="#176b68" stroke-width="2" stroke-dasharray="6 4"/><text x="160" y="20" text-anchor="middle" font-size="12" fill="#17212b">vak ${fmtNum(space[0])} m, doos ${fmtNum(box[0])} cm</text><text x="160" y="152" text-anchor="middle" font-size="12" fill="#56616b">${fitsText} per richting</text></svg><figcaption>Het vak is ${space.map(fmtNum).join(" × ")} m en de doos is ${box.map(fmtNum).join(" × ")} cm. Per richting passen ${fitsText} dozen; vermenigvuldig die aantallen.</figcaption></figure>`;
}

function masteryFor(code) { return state.mastery.find((item) => item.objective_code === code) ?? { state: "niet_gestart" }; }
function renderProgress() {
  const examCards = ["A", "B"].map((examId) => examResultCard(examId, state.exams?.[examId])).join("");
  const grouped = Object.entries(domainNames).map(([domain, name]) => {
    const objectives = curriculum.objectives.filter((objective) => objective.domain === domain);
    const mastered = objectives.filter((objective) => ["toetsklaar", "beheerst"].includes(masteryFor(objective.code).state)).length;
    return `<section class="card"><h2>${name}</h2><p>${mastered} van ${objectives.length} klaar voor het proefexamen</p>${objectives.map((objective) => `<div class="domain"><span>${objective.code} · ${escapeHtml(objective.title)}</span><strong>${masteryFor(objective.code).state.replaceAll("_", " ")}</strong></div>`).join("")}</section>`;
  }).join("");
  return `<p class="eyebrow">Voortgang</p><h1>Alle 58 leerdoelen</h1>${examCards}${grouped}`;
}

function renderCoach() {
  const attempts = state.attempts.slice(-10).reverse();
  return `<p class="eyebrow">Begeleider</p><h1>Voortgang beheren</h1><div class="card"><p><strong>${state.attempts.length}</strong> pogingen opgeslagen op dit apparaat.</p><div class="actions two"><button id="export-json">Exporteer JSON</button><button class="secondary" id="export-csv">Exporteer CSV</button><button class="secondary" id="save-copy">Bewaar kopie</button><button class="secondary" id="share-coach">Stuur naar begeleider</button></div><p><small>De kopie komt in Bestanden/Downloads terecht; de app bewaart ook automatisch in dit apparaat.</small></p><p id="share-status" role="status"></p></div>
    <div class="card"><h2>Voortgang herstellen</h2><p>Importeren vervangt de huidige voortgang pas nadat het hele bestand geldig is.</p><button id="open-import">Zet terug</button><input id="import-file" type="file" accept="application/json,.json" hidden><p id="import-status" role="status"></p></div><h2>Laatste pogingen</h2>${attempts.length ? attempts.map((attempt) => `<article class="attempt-card"><strong>${escapeHtml(attempt.objective)}</strong> · ${attempt.correct ? "goed" : "nog oefenen"}<br><small>${new Date(attempt.at).toLocaleString("nl-NL")}</small></article>`).join("") : "<p>Nog geen pogingen.</p>"}<button class="secondary" id="reset">Begin opnieuw</button>`;
}

function bindEvents() {
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { flushExamTimer(); saveState(); location.hash = `#/${button.dataset.route}`; }));
  document.querySelectorAll("[data-level]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-level]").forEach((item) => item.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", "true"); const start = document.querySelector("#start"); start.disabled = false; start.dataset.level = button.dataset.level;
  }));
  document.querySelector("#start")?.addEventListener("click", (event) => { state = { ...structuredClone(blankState), learner: { id: "partner", target_level: Number(event.currentTarget.dataset.level) } }; saveState(); location.hash = "#/leren"; });
  document.querySelectorAll(".answer").forEach((button) => button.addEventListener("click", () => saveDraft(activity().question.id, button.dataset.answer, true)));
  document.querySelector("#answer")?.addEventListener("input", (event) => saveDraft(activity().question.id, event.target.value, false));
  document.querySelector("#answer")?.addEventListener("keydown", (event) => { if (event.key === "Enter") checkCurrentAnswer(); });
  document.querySelector("#check-answer")?.addEventListener("click", checkCurrentAnswer);
  document.querySelector("#next-activity")?.addEventListener("click", () => {
    const fromFeedback = state.feedback?.phase === "exam" ? state.feedback?.exam : null;
    const fallback = fromFeedback ? null : activity();
    const examId = fromFeedback ?? (fallback?.phase === "exam" ? fallback?.exam : null);
    const session = examId ? state.exams?.[examId] : null;
    if (session && !session.submitted_at && session.current_index < session.question_ids.length - 1) session.current_index += 1;
    state.feedback = null; saveState(); render();
  });
  document.querySelector("#start-exam")?.addEventListener("click", (event) => {
    const examId = event.currentTarget.dataset.exam;
    try { startExam(state, questions, examId); saveState(); location.hash = "#/leren"; render(); }
    catch (error) { alert(error.message); }
  });
  document.querySelector("#submit-exam")?.addEventListener("click", (event) => {
    const examId = event.currentTarget.dataset.exam;
    if (!confirm(`Proefexamen ${examId} inleveren? Je hebt 30 antwoorden opgeslagen. Daarna zie je de uitslag en kun je niets meer wijzigen.`)) return;
    try { const result = submitExam(state, questions, examId); if (!result.passed) reopenWeakDomains(result); state.feedback = null; saveState(); location.hash = "#/vandaag"; render(); }
    catch (error) { alert(error.message); }
  });
  document.querySelector("#open-import")?.addEventListener("click", () => document.querySelector("#import-file").click());
  document.querySelector("#calc-toggle")?.addEventListener("click", toggleCalc);
  document.querySelector("#import-file")?.addEventListener("change", importFile);
  document.querySelector("#export-json")?.addEventListener("click", exportJson);
  document.querySelector("#export-csv")?.addEventListener("click", exportCsv);
  document.querySelector("#save-copy")?.addEventListener("click", saveCopy);
  document.querySelector("#share-coach")?.addEventListener("click", shareToCoach);
  document.querySelector("#reset")?.addEventListener("click", () => { if (confirm("Alle lokale voortgang wissen en opnieuw beginnen?")) { localStorage.removeItem(STORAGE_KEY); state = structuredClone(blankState); location.hash = "#/"; render(); } });
}

function calcParseEntry(value) {
  if (value === "" || value === "-" || value === ",") return NaN;
  return Number(String(value).replace(",", "."));
}

function calcFormatNumber(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1e10) / 1e10;
  const fixed = Object.is(rounded, -0) ? 0 : rounded;
  if (fixed !== 0 && (Math.abs(fixed) >= 1e12 || Math.abs(fixed) < 1e-9)) {
    return String(fixed.toExponential(6)).replace(".", ",");
  }
  return String(fixed).replace(".", ",");
}

function calcEvaluateList(list) {
  if (!list.length) return { empty: true };
  if (typeof list[list.length - 1] === "string") return { incomplete: true };
  const first = [list[0]];
  for (let index = 1; index < list.length; index += 2) {
    const operator = list[index];
    const next = list[index + 1];
    if (operator === "×" || operator === "÷") {
      const left = first.pop();
      if (operator === "÷" && next === 0) return { divZero: true };
      first.push(operator === "×" ? left * next : left / next);
    } else {
      first.push(operator, next);
    }
  }
  let result = first[0];
  for (let index = 1; index < first.length; index += 2) {
    result = first[index] === "+" ? result + first[index + 1] : result - first[index + 1];
  }
  if (!Number.isFinite(result)) return { divZero: true };
  return { value: Math.round(result * 1e10) / 1e10 };
}

function calcLiveParts() {
  const parts = calcTokens.map((token) => (typeof token === "number" ? calcFormatNumber(token) : token));
  if (calcCurrent !== "") parts.push(calcCurrent);
  return parts;
}

function updateCalcDisplay() {
  const expression = document.querySelector("#calc-expression");
  const display = document.querySelector("#calc-display");
  if (!expression || !display) return;
  if (calcError) {
    expression.textContent = calcErrorExpression;
    display.textContent = calcError;
    return;
  }
  if (calcEvaluated) {
    expression.textContent = calcHistory || "Voer een berekening in";
    display.textContent = calcCurrent === "" ? "0" : calcCurrent;
    return;
  }
  const parts = calcLiveParts();
  expression.textContent = parts.length ? parts.join(" ") : "Voer een berekening in";
  if (calcCurrent !== "") display.textContent = calcCurrent;
  else if (calcTokens.length >= 2 && typeof calcTokens[calcTokens.length - 2] === "number") display.textContent = calcFormatNumber(calcTokens[calcTokens.length - 2]);
  else if (calcTokens.length === 1 && typeof calcTokens[0] === "number") display.textContent = calcFormatNumber(calcTokens[0]);
  else display.textContent = "0";
}

function calcResetEntry() {
  calcTokens = [];
  calcCurrent = "";
  calcError = null;
  calcErrorExpression = "";
  calcEvaluated = false;
  calcHistory = "";
}

function calcInputDigit(digit) {
  if (calcError) calcResetEntry();
  if (calcEvaluated) {
    calcTokens = [];
    calcCurrent = "";
    calcHistory = "";
    calcEvaluated = false;
  }
  const digits = calcCurrent.replace(/[^0-9]/g, "").length;
  if (digits >= 12) return;
  if (calcCurrent === "0") calcCurrent = digit;
  else if (calcCurrent === "-0") calcCurrent = `-${digit}`;
  else calcCurrent += digit;
  updateCalcDisplay();
}

function calcInputComma() {
  if (calcError) calcResetEntry();
  if (calcEvaluated) {
    calcTokens = [];
    calcCurrent = "";
    calcHistory = "";
    calcEvaluated = false;
  }
  if (calcCurrent.includes(",")) return;
  if (calcCurrent === "" || calcCurrent === "-") calcCurrent += "0,";
  else calcCurrent += ",";
  updateCalcDisplay();
}

function calcPushCurrent() {
  if (calcCurrent === "" || calcCurrent === "-") return false;
  const value = calcParseEntry(calcCurrent);
  if (!Number.isFinite(value)) return false;
  calcTokens.push(value);
  calcCurrent = "";
  return true;
}

function calcInputOperator(operator) {
  if (calcError) return;
  if (!["+", "−", "×", "÷"].includes(operator)) return;
  if (calcEvaluated) {
    calcEvaluated = false;
    calcHistory = "";
  }
  if (calcCurrent !== "" && calcCurrent !== "-") calcPushCurrent();
  if (!calcTokens.length) return;
  if (typeof calcTokens[calcTokens.length - 1] === "string") calcTokens[calcTokens.length - 1] = operator;
  else calcTokens.push(operator);
  updateCalcDisplay();
}

function calcToggleSign() {
  if (calcError) return;
  if (calcEvaluated) calcEvaluated = false;
  if (calcCurrent !== "") {
    calcCurrent = calcCurrent.startsWith("-") ? calcCurrent.slice(1) : `-${calcCurrent}`;
    if (calcCurrent === "-") calcCurrent = "";
  } else calcCurrent = "-";
  updateCalcDisplay();
}

function calcPercent() {
  if (calcError) return;
  if (calcEvaluated) calcEvaluated = false;
  if (calcCurrent === "" || calcCurrent === "-") return;
  const value = calcParseEntry(calcCurrent);
  if (!Number.isFinite(value)) return;
  const formatted = calcFormatNumber(value / 100);
  if (formatted === null) return;
  calcCurrent = formatted;
  updateCalcDisplay();
}

function calcClear() {
  calcResetEntry();
  updateCalcDisplay();
}

function calcBackspace() {
  if (calcError) {
    calcResetEntry();
    updateCalcDisplay();
    return;
  }
  if (calcEvaluated) calcEvaluated = false;
  if (calcCurrent !== "") {
    calcCurrent = calcCurrent.slice(0, -1);
    if (calcCurrent === "-") calcCurrent = "";
  } else if (calcTokens.length && typeof calcTokens[calcTokens.length - 1] === "string") {
    calcTokens.pop();
  }
  updateCalcDisplay();
}

function calcEquals() {
  if (calcError) return;
  if (calcEvaluated) return;
  const parts = calcLiveParts();
  const list = [...calcTokens];
  if (calcCurrent !== "" && calcCurrent !== "-") {
    const value = calcParseEntry(calcCurrent);
    if (!Number.isFinite(value)) return;
    list.push(value);
  }
  const outcome = calcEvaluateList(list);
  if (outcome?.empty || outcome?.incomplete) return;
  if (outcome?.divZero) {
    calcErrorExpression = parts.join(" ");
    calcError = "Delen door nul kan niet";
    updateCalcDisplay();
    return;
  }
  const formatted = calcFormatNumber(outcome.value);
  if (formatted === null) {
    calcErrorExpression = parts.join(" ");
    calcError = "Delen door nul kan niet";
    updateCalcDisplay();
    return;
  }
  calcHistory = `${parts.join(" ")} =`;
  calcTokens = [];
  calcCurrent = formatted;
  calcEvaluated = true;
  updateCalcDisplay();
}

function handleCalcButton(action, value) {
  if (action === "digit") calcInputDigit(value);
  else if (action === "comma") calcInputComma();
  else if (action === "op") calcInputOperator(value);
  else if (action === "equals") calcEquals();
  else if (action === "clear") calcClear();
  else if (action === "back") calcBackspace();
  else if (action === "sign") calcToggleSign();
  else if (action === "percent") calcPercent();
}

function handleCalcKey(event) {
  const key = event.key;
  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    calcInputDigit(key);
  } else if (key === "," || key === ".") {
    event.preventDefault();
    calcInputComma();
  } else if (key === "+" || key === "-" || key === "*" || key === "/" || key === "x" || key === "X") {
    event.preventDefault();
    calcInputOperator(key === "+" ? "+" : key === "-" ? "−" : key === "/" ? "÷" : "×");
  } else if (key === "%") {
    event.preventDefault();
    calcPercent();
  } else if (key === "Enter" || key === "=") {
    event.preventDefault();
    calcEquals();
  } else if (key === "Backspace") {
    event.preventDefault();
    calcBackspace();
  } else if (key === "Escape") {
    event.preventDefault();
    closeCalc(true);
  } else if (key === "c" || key === "C" || key === "Delete") {
    event.preventDefault();
    calcClear();
  }
}

function ensureCalcPanel() {
  if (document.querySelector("#calc-panel")) return;
  const panel = document.createElement("section");
  panel.id = "calc-panel";
  panel.className = "calc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Rekenmachine");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-hidden", "true");
  panel.hidden = true;
  panel.innerHTML = `<div class="calc-head"><h2>Rekenmachine</h2><button id="calc-close" class="secondary calc-close" aria-label="Rekenmachine sluiten">×</button></div><p class="calc-sub">Eerst × en ÷, daarna + en −. Komma als decimaalteken.</p><div class="calc-screen"><div id="calc-expression" class="calc-expression" aria-hidden="true">Voer een berekening in</div><div id="calc-display" class="calc-display" role="status" aria-live="polite">0</div></div><div class="calc-grid" role="group" aria-label="Rekenmachinetoetsen"><button data-calc="clear" aria-label="Alles wissen">C</button><button data-calc="back" aria-label="Laatste cijfer wissen">⌫</button><button data-calc="percent" aria-label="Procent">%</button><button data-calc="op" data-value="÷" aria-label="Delen door">÷</button><button data-calc="digit" data-value="7">7</button><button data-calc="digit" data-value="8">8</button><button data-calc="digit" data-value="9">9</button><button data-calc="op" data-value="×" aria-label="Keer">×</button><button data-calc="digit" data-value="4">4</button><button data-calc="digit" data-value="5">5</button><button data-calc="digit" data-value="6">6</button><button data-calc="op" data-value="−" aria-label="Min">−</button><button data-calc="digit" data-value="1">1</button><button data-calc="digit" data-value="2">2</button><button data-calc="digit" data-value="3">3</button><button data-calc="op" data-value="+" aria-label="Plus">+</button><button data-calc="sign" aria-label="Van teken wisselen">±</button><button data-calc="digit" data-value="0">0</button><button data-calc="comma" aria-label="Komma">,</button><button data-calc="equals" class="calc-equals" aria-label="Is gelijk aan">=</button></div><p class="calc-note"><small>Gebruik wordt niet bewaard als poging.</small></p>`;
  document.body.appendChild(panel);
  panel.addEventListener("click", (event) => {
    if (event.target.closest("#calc-close")) {
      closeCalc(true);
      return;
    }
    const button = event.target.closest("[data-calc]");
    if (button) handleCalcButton(button.dataset.calc, button.dataset.value);
  });
  panel.addEventListener("keydown", handleCalcKey);
  if (!document.body.dataset.calcEscapeBound) {
    document.body.dataset.calcEscapeBound = "true";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && calcOpen) {
        event.preventDefault();
        closeCalc(true);
      }
    });
  }
}

function openCalc() {
  ensureCalcPanel();
  const panel = document.querySelector("#calc-panel");
  if (!panel) return;
  calcOpen = true;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("is-open");
  updateCalcDisplay();
  document.querySelector("#calc-toggle")?.setAttribute("aria-expanded", "true");
  document.querySelector("#calc-close")?.focus();
}

function closeCalc(returnFocus = true) {
  const panel = document.querySelector("#calc-panel");
  calcOpen = false;
  if (panel) {
    panel.classList.remove("is-open");
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }
  const toggle = document.querySelector("#calc-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (returnFocus && toggle) toggle.focus();
}

function toggleCalc() {
  if (calcOpen) closeCalc(true);
  else openCalc();
}

/* Paneel mag in alle vraagweergaven blijven staan; alleen op niet-vraagroutes (zonder #calc-toggle) wordt het verborgen. Paneel leeft buiten #app en overleeft render(). */
function syncCalcWithRoute() {
  ensureCalcPanel();
  const toggle = document.querySelector("#calc-toggle");
  const panel = document.querySelector("#calc-panel");
  if (!panel) return;
  if (!toggle) {
    if (calcOpen) {
      calcOpen = false;
      panel.classList.remove("is-open");
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    }
    return;
  }
  toggle.setAttribute("aria-expanded", calcOpen ? "true" : "false");
  if (calcOpen) {
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("is-open");
    updateCalcDisplay();
  } else {
    panel.classList.remove("is-open");
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }
}

function saveDraft(questionId, value, rerender) { state.drafts[questionId] = value; state.feedback = null; saveState(); if (rerender) render(); }
function checkCurrentAnswer() {
  const current = activity(); if (!current) return;
  const { question, phase } = current; const result = scoreAnswer(question, state.drafts[question.id]);
  if (result.value === null) { state.feedback = { questionId: question.id, phase, exam: current.exam ?? null, correct: false, text: "Vul eerst een antwoord in.", empty: true }; render(); return; }
  state.attempts.push({ question_id: question.id, objective: question.objective_codes[0], objective_codes: question.objective_codes, domain: question.domain, kind: question.kind, correct: result.correct, answer: result.value, at: new Date().toISOString(), independent: question.step !== "guided", hints: [] });
  if (phase === "diagnostic") state.diagnosticIndex += 1;
  else if (phase !== "exam") updateMastery(question, result.correct);
  const examSession = phase === "exam" && current.exam ? state.exams?.[current.exam] : null;
  if (examSession && !examSession.submitted_at) {
    const seconds = takeExamElapsed(question.id);
    recordExamAnswer(examSession, question.id, result.value, seconds);
  }
  const hiddenResult = ["diagnostic", "exam"].includes(phase);
  const incorrectCount = state.attempts.filter((attempt) => attempt.objective === question.objective_codes[0] && !attempt.correct).length;
  state.feedback = {
    questionId: question.id,
    phase,
    exam: current.exam ?? null,
    correct: hiddenResult ? null : result.correct,
    text: hiddenResult
      ? phase === "exam" ? "Antwoord opgeslagen. De uitslag volgt na het proefexamen." : "Je krijgt de uitslag na de laatste nulmetingsvraag."
      : result.correct ? question.explanation : incorrectCount === 1 ? "Kijk opnieuw naar wat je weet, wat je zoekt en welke bewerking daarbij past. Je krijgt hierna een nieuwe poging." : `Bekijk het uitgewerkte voorbeeld nog eens. ${question.explanation}`,
  };
  delete state.drafts[question.id]; saveState(); render();
}
function updateMastery(question, correct) {
  const code = question.objective_codes[0]; let item = state.mastery.find((entry) => entry.objective_code === code);
  if (!item) { item = { objective_code: code, state: "in_opbouw", next_review_at: null }; state.mastery.push(item); }
  if (!correct) { item.state = "in_opbouw"; return; }
  if (question.kind === "review") {
    item.review_passes = (item.review_passes ?? 0) + 1;
    if (item.review_passes >= 2) { item.state = "toetsklaar"; item.next_review_at = null; return; }
    item.state = "hertoets_nodig"; const date = new Date(); date.setDate(date.getDate() + 14); item.next_review_at = date.toISOString().slice(0, 10); return;
  }
  if (state.attempts.some((attempt) => attempt.objective === code && attempt.correct && attempt.independent)) {
    item.state = "hertoets_nodig"; const date = new Date(); date.setDate(date.getDate() + 3); item.next_review_at = date.toISOString().slice(0, 10);
  }
}
function reopenWeakDomains(result) {
  const today = new Date().toISOString().slice(0, 10);
  for (const domain of examDomainOrder.filter((code) => (result.per_domain[code] ?? 0) < 70)) {
    for (const objective of curriculum.objectives.filter((item) => item.domain === domain)) {
      let mastery = state.mastery.find((item) => item.objective_code === objective.code);
      if (!mastery) { mastery = { objective_code: objective.code }; state.mastery.push(mastery); }
      Object.assign(mastery, { state: "hertoets_nodig", next_review_at: today, review_passes: 0 });
    }
  }
}
async function importFile(event) {
  const status = document.querySelector("#import-status");
  try { const source = JSON.parse(await event.target.files[0].text()); state = { ...blankState, ...importState(source, questions), drafts: {} }; saveState(); location.hash = "#/vandaag"; render(); }
  catch (error) { if (status) status.textContent = `Niet geïmporteerd: ${error.message}`; event.target.value = ""; }
}
function progressJsonText() { return JSON.stringify({ schema_version: 1, exported_at: new Date().toISOString(), ...state }, null, 2); }
function exportJson() { download("rekenen-voortgang.json", progressJsonText(), "application/json"); }
function datedBackupName() { return `rekenen-voortgang-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.json`; }
function saveCopy() { download(datedBackupName(), progressJsonText(), "application/json"); }
async function shareToCoach() {
  const status = document.querySelector("#share-status");
  const showStatus = (message) => { if (status) status.textContent = message; };
  let text = "";
  let filename = "rekenen-voortgang.json";
  try {
    text = progressJsonText();
    filename = datedBackupName();
  } catch { return; }
  const fallbackToClipboard = async () => {
    try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text); } catch { /* klembord mislukt: toon toch de instructie */ }
    showStatus("Delen kan hier niet — gebruik Bewaar kopie en stuur het bestand door");
  };
  try {
    if (navigator.share && navigator.canShare) {
      let shared = false;
      try {
        const jsonFile = new File([text], filename, { type: "application/json" });
        if (navigator.canShare({ files: [jsonFile] })) {
          await navigator.share({ files: [jsonFile], title: "Voortgang rekenen", text: "Voortgang van de rekenapp" });
          shared = true;
        }
      } catch (error) { if (error?.name === "AbortError") return; }
      if (!shared) {
        try {
          const txtFile = new File([text], filename.replace(/\.json$/, ".txt"), { type: "text/plain" });
          if (navigator.canShare({ files: [txtFile] })) {
            await navigator.share({ files: [txtFile], title: "Voortgang rekenen", text: "Voortgang van de rekenapp" });
            shared = true;
          }
        } catch (error) { if (error?.name === "AbortError") return; }
      }
      if (!shared) await fallbackToClipboard();
      return;
    }
    await fallbackToClipboard();
  } catch (error) {
    if (error?.name === "AbortError") return;
    await fallbackToClipboard();
  }
}
function exportCsv() {
  const header = "question_id,objective,domain,kind,correct,answer,at,independent";
  const rows = state.attempts.map((attempt) => [attempt.question_id, attempt.objective, attempt.domain, attempt.kind ?? "", attempt.correct, JSON.stringify(attempt.answer), attempt.at, attempt.independent].map(csvCell).join(","));
  download("rekenen-pogingen.csv", [header, ...rows].join("\n"), "text/csv");
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function download(filename, body, type) { const url = URL.createObjectURL(new Blob([body], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }

function requestPersistentStorage() {
  try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch { /* best-effort tegen wissen op iOS; resultaat negeren */ }
}
requestPersistentStorage();

addEventListener("hashchange", render);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushExamTimer();
    try { saveState(); } catch { /* opslag vol of onbeschikbaar: antwoord blijft in het geheugen */ }
  } else render();
});
addEventListener("pagehide", () => { flushExamTimer(); try { saveState(); } catch { /* best effort */ } });
render();

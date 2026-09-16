import { importState, nextActivity, scoreAnswer } from "./core.mjs";

const STORAGE_KEY = "rekenen-state-v1";
const domainNames = { B: "Basis", G: "Grootheden en eenheden", R: "2D en 3D", V: "Verhoudingen", P: "Procenten", K: "Grafieken en tabellen" };
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
const blankState = { learner: null, attempts: [], diagnosticIndex: 0, selectedAnswer: null, feedback: null, mastery: [], drafts: {} };
let state = loadState();

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
    return question ? { phase: state.feedback.phase, objective: question.objective_codes[0], question } : null;
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
}

function renderOnboarding() {
  return `<p class="eyebrow">Rekenen leren</p><h1>We beginnen bij wat je nog weet.</h1><p>De nulmeting bestaat uit vijf delen. Daarna krijg je steeds één korte uitleg en oefening.</p>
    <div class="card"><h2>Welk niveau wil je halen?</h2><div class="stack"><button class="choice" data-level="3" aria-pressed="false">Mbo-rekenniveau 3</button><button class="choice" data-level="4" aria-pressed="false">Mbo-rekenniveau 4</button></div></div>
    <div class="actions"><button id="start" disabled>Start de nulmeting</button><button class="secondary" id="open-import">Herstel opgeslagen voortgang</button></div><input id="import-file" type="file" accept="application/json,.json" hidden>`;
}

function renderToday() {
  const next = nextActivity(state, questions);
  if (!next) {
    const pending = state.mastery.filter((item) => item.next_review_at).sort((a, b) => a.next_review_at.localeCompare(b.next_review_at))[0];
    return pending
      ? `<p class="eyebrow">Vandaag</p><h1>Goed gewerkt</h1><div class="card"><h2>Volgende hertoets</h2><p>Je volgende korte herhaling staat gepland voor ${new Date(`${pending.next_review_at}T12:00:00`).toLocaleDateString("nl-NL")}.</p><button data-route="voortgang">Bekijk voortgang</button></div>`
      : `<p class="eyebrow">Vandaag</p><h1>Alle onderdelen zijn afgerond</h1><div class="card"><p>Bekijk je voortgang of exporteer je resultaten bij Begeleider.</p></div>`;
  }
  const code = next.objective ?? next.question.objective_codes[0];
  const objective = objectiveByCode.get(code);
  const title = next.phase === "diagnostic" ? "Ga verder met de nulmeting" : next.phase === "recovery" ? "Herstel één denkstap" : next.phase === "review" ? "Tijd voor een hertoets" : next.phase === "exam" ? `Proefexamen ${next.question.exam}` : "Volgende leerdoel";
  return `<p class="eyebrow">Vandaag</p><h1>${title}</h1><div class="card"><p class="lesson-meta">${escapeHtml(code)} · ${escapeHtml(domainNames[next.question.domain] ?? objective?.domain)}</p><h2>${escapeHtml(objective?.title ?? next.question.prompt)}</h2><p>${escapeHtml(next.phase === "diagnostic" ? `Vraag ${state.diagnosticIndex + 1} van ${diagnosticCount()}` : objective?.plain_explanation ?? "Je volgende vraag staat klaar.")}</p><button data-route="leren">Ga verder</button></div>`;
}

function renderActivity() {
  const next = activity();
  if (!next) return `<p class="eyebrow">Leren</p><h1>Geen openstaande activiteit</h1><div class="actions"><button data-route="voortgang">Bekijk voortgang</button></div>`;
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
  return `<p class="eyebrow">${isDiagnostic ? `Nulmeting · ${domainNames[question.domain]}` : phase === "exam" ? `Proefexamen ${question.exam}` : `${question.objective_codes[0]} · ${domainNames[objective?.domain]}`}</p>${position}${lesson}<section class="exercise"><h1>${escapeHtml(question.prompt)}</h1>${visualFor(question)}${answer}${feedback}</section><div class="actions">${done ? `<button id="next-activity">Volgende</button>` : `<button id="check-answer">${isDiagnostic ? "Sla antwoord op" : "Controleer antwoord"}</button>`}<button class="secondary" data-route="vandaag">Bewaar en stop</button></div>`;
}

function visualFor(question) {
  const code = question.objective_codes[0];
  if (code === "K2") return `<table class="data-table"><caption>Gegevens</caption><thead><tr><th>Categorie</th><th>Waarde</th></tr></thead><tbody><tr><td>Januari / A / maandag</td><td>12 / 24 / €14</td></tr><tr><td>Februari / B / dinsdag</td><td>18 / 31 / €19</td></tr><tr><td>Maart / woensdag</td><td>15 / €17</td></tr></tbody></table>`;
  if (code === "K3") return `<table class="data-table"><caption>Frequenties</caption><thead><tr><th>Groep</th><th>Aantal</th></tr></thead><tbody><tr><td>Rood</td><td>4</td></tr><tr><td>Blauw</td><td>7</td></tr><tr><td>Groen</td><td>3</td></tr></tbody></table>`;
  if (code === "K6") return `<figure><svg class="question-figure" viewBox="0 0 320 190" role="img" aria-label="Grafiek met assen van nul tot veertig en een balk tot veertig"><path d="M45 20V160H300" fill="none" stroke="#17212b" stroke-width="2"/><g stroke="#d9ded8"><path d="M45 125H300M45 90H300M45 55H300M45 20H300"/></g><g fill="#56616b" font-size="12"><text x="18" y="164">0</text><text x="12" y="129">10</text><text x="12" y="94">20</text><text x="12" y="59">30</text><text x="12" y="24">40</text></g><rect x="105" y="20" width="70" height="140" fill="#176b68"/><path d="M205 97L270 69" fill="none" stroke="#b86b16" stroke-width="4"/><circle cx="205" cy="97" r="5" fill="#b86b16"/><circle cx="270" cy="69" r="5" fill="#b86b16"/></svg><figcaption>Lees altijd eerst de schaal van de verticale as.</figcaption></figure>`;
  if (code === "K13") return `<figure><svg class="question-figure" viewBox="0 0 320 180" role="img" aria-label="Misleidende staafgrafiek waarvan de verticale as pas bij tachtig begint"><path d="M50 20V145H295" fill="none" stroke="#17212b" stroke-width="2"/><g fill="#56616b" font-size="12"><text x="18" y="149">80</text><text x="18" y="94">90</text><text x="12" y="29">100</text></g><rect x="90" y="90" width="65" height="55" fill="#176b68"/><rect x="195" y="35" width="65" height="110" fill="#b86b16"/></svg><figcaption>De as begint bij 80, niet bij 0.</figcaption></figure>`;
  if (code === "R5") return `<figure><svg class="question-figure" viewBox="0 0 320 210" role="img" aria-label="Uitslag van een kubus met zes vierkante vlakken"><g fill="#e9f3f1" stroke="#176b68" stroke-width="3"><rect x="110" y="10" width="50" height="50"/><rect x="60" y="60" width="50" height="50"/><rect x="110" y="60" width="50" height="50"/><rect x="160" y="60" width="50" height="50"/><rect x="210" y="60" width="50" height="50"/><rect x="110" y="110" width="50" height="50"/></g></svg><figcaption>Een uitslag vouw je langs de randen tot een ruimtelijke vorm.</figcaption></figure>`;
  if (["R6", "R9", "R10"].includes(code)) return `<figure><svg class="question-figure" viewBox="0 0 320 190" role="img" aria-label="Balk met lengte acht, breedte drie en hoogte vijf"><path d="M65 70L200 70L255 35L120 35Z M65 70V145L200 145V70 M200 145L255 110V35" fill="#e9f3f1" fill-opacity=".7" stroke="#176b68" stroke-width="3"/><g fill="#17212b" font-size="14"><text x="125" y="165">8 cm</text><text x="225" y="135">3 cm</text><text x="38" y="112">5 cm</text></g></svg><figcaption>Let op welk aanzicht of welke schaal de vraag gebruikt.</figcaption></figure>`;
  if (code === "R7") return `<figure><svg class="question-figure" viewBox="0 0 320 180" role="img" aria-label="Cilinder die horizontaal wordt doorgesneden, met een cirkel als doorsnede"><ellipse cx="115" cy="35" rx="55" ry="18" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M60 35V135M170 35V135" stroke="#176b68" stroke-width="3"/><ellipse cx="115" cy="135" rx="55" ry="18" fill="#e9f3f1" stroke="#176b68" stroke-width="3"/><path d="M50 85H180" stroke="#b86b16" stroke-width="4" stroke-dasharray="7 5"/></svg><figcaption>De stippellijn geeft het snijvlak aan.</figcaption></figure>`;
  return "";
}

function masteryFor(code) { return state.mastery.find((item) => item.objective_code === code) ?? { state: "niet_gestart" }; }
function renderProgress() {
  const grouped = Object.entries(domainNames).map(([domain, name]) => {
    const objectives = curriculum.objectives.filter((objective) => objective.domain === domain);
    const mastered = objectives.filter((objective) => ["toetsklaar", "beheerst"].includes(masteryFor(objective.code).state)).length;
    return `<section class="card"><h2>${name}</h2><p>${mastered} van ${objectives.length} klaar voor het proefexamen</p>${objectives.map((objective) => `<div class="domain"><span>${objective.code} · ${escapeHtml(objective.title)}</span><strong>${masteryFor(objective.code).state.replaceAll("_", " ")}</strong></div>`).join("")}</section>`;
  }).join("");
  return `<p class="eyebrow">Voortgang</p><h1>Alle 58 leerdoelen</h1>${grouped}`;
}

function renderCoach() {
  const attempts = state.attempts.slice(-10).reverse();
  return `<p class="eyebrow">Begeleider</p><h1>Voortgang beheren</h1><div class="card"><p><strong>${state.attempts.length}</strong> pogingen opgeslagen op dit apparaat.</p><div class="actions two"><button id="export-json">Exporteer JSON</button><button class="secondary" id="export-csv">Exporteer CSV</button></div></div>
    <div class="card"><h2>Voortgang herstellen</h2><p>Importeren vervangt de huidige voortgang pas nadat het hele bestand geldig is.</p><button id="open-import">Importeer JSON</button><input id="import-file" type="file" accept="application/json,.json" hidden><p id="import-status" role="status"></p></div><h2>Laatste pogingen</h2>${attempts.length ? attempts.map((attempt) => `<article class="attempt-card"><strong>${escapeHtml(attempt.objective)}</strong> · ${attempt.correct ? "goed" : "nog oefenen"}<br><small>${new Date(attempt.at).toLocaleString("nl-NL")}</small></article>`).join("") : "<p>Nog geen pogingen.</p>"}<button class="secondary" id="reset">Begin opnieuw</button>`;
}

function bindEvents() {
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { location.hash = `#/${button.dataset.route}`; }));
  document.querySelectorAll("[data-level]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-level]").forEach((item) => item.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", "true"); const start = document.querySelector("#start"); start.disabled = false; start.dataset.level = button.dataset.level;
  }));
  document.querySelector("#start")?.addEventListener("click", (event) => { state = { ...structuredClone(blankState), learner: { id: "partner", target_level: Number(event.currentTarget.dataset.level) } }; saveState(); location.hash = "#/leren"; });
  document.querySelectorAll(".answer").forEach((button) => button.addEventListener("click", () => saveDraft(activity().question.id, button.dataset.answer, true)));
  document.querySelector("#answer")?.addEventListener("input", (event) => saveDraft(activity().question.id, event.target.value, false));
  document.querySelector("#answer")?.addEventListener("keydown", (event) => { if (event.key === "Enter") checkCurrentAnswer(); });
  document.querySelector("#check-answer")?.addEventListener("click", checkCurrentAnswer);
  document.querySelector("#next-activity")?.addEventListener("click", () => { state.feedback = null; saveState(); render(); });
  document.querySelector("#open-import")?.addEventListener("click", () => document.querySelector("#import-file").click());
  document.querySelector("#import-file")?.addEventListener("change", importFile);
  document.querySelector("#export-json")?.addEventListener("click", exportJson);
  document.querySelector("#export-csv")?.addEventListener("click", exportCsv);
  document.querySelector("#reset")?.addEventListener("click", () => { if (confirm("Alle lokale voortgang wissen en opnieuw beginnen?")) { localStorage.removeItem(STORAGE_KEY); state = structuredClone(blankState); location.hash = "#/"; render(); } });
}

function saveDraft(questionId, value, rerender) { state.drafts[questionId] = value; state.feedback = null; saveState(); if (rerender) render(); }
function checkCurrentAnswer() {
  const current = activity(); if (!current) return;
  const { question, phase } = current; const result = scoreAnswer(question, state.drafts[question.id]);
  if (result.value === null) { state.feedback = { questionId: question.id, phase, correct: false, text: "Vul eerst een antwoord in.", empty: true }; render(); return; }
  state.attempts.push({ question_id: question.id, objective: question.objective_codes[0], objective_codes: question.objective_codes, domain: question.domain, kind: question.kind, correct: result.correct, answer: result.value, at: new Date().toISOString(), independent: question.step !== "guided", hints: [] });
  if (phase === "diagnostic") state.diagnosticIndex += 1;
  else if (phase !== "exam") updateMastery(question, result.correct);
  const hiddenResult = ["diagnostic", "exam"].includes(phase);
  const incorrectCount = state.attempts.filter((attempt) => attempt.objective === question.objective_codes[0] && !attempt.correct).length;
  state.feedback = {
    questionId: question.id,
    phase,
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
  if (question.kind === "review") { item.state = "toetsklaar"; item.next_review_at = null; return; }
  if (state.attempts.some((attempt) => attempt.objective === code && attempt.correct && attempt.independent)) {
    item.state = "hertoets_nodig"; const date = new Date(); date.setDate(date.getDate() + 3); item.next_review_at = date.toISOString().slice(0, 10);
  }
}
async function importFile(event) {
  const status = document.querySelector("#import-status");
  try { const source = JSON.parse(await event.target.files[0].text()); state = { ...blankState, ...importState(source, questions), drafts: {} }; saveState(); location.hash = "#/vandaag"; render(); }
  catch (error) { if (status) status.textContent = `Niet geïmporteerd: ${error.message}`; event.target.value = ""; }
}
function exportJson() { download("rekenen-voortgang.json", JSON.stringify({ schema_version: 1, exported_at: new Date().toISOString(), ...state }, null, 2), "application/json"); }
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

addEventListener("hashchange", render);
render();

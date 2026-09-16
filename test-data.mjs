import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const questions = JSON.parse(await readFile(new URL("questions.json", import.meta.url), "utf8"));
const curriculum = JSON.parse(await readFile(new URL("curriculum.json", import.meta.url), "utf8"));
const level4 = JSON.parse(await readFile(new URL("level4.json", import.meta.url), "utf8"));
const ids = new Set();

for (const question of questions) {
  assert(question.id && !ids.has(question.id), `Ongeldig of dubbel id: ${question.id}`);
  ids.add(question.id);
  assert(["G", "R", "V", "P", "K"].includes(question.domain), `${question.id}: ongeldig domein`);
  assert([3, 4].includes(question.level), `${question.id}: ongeldig niveau`);
  assert(Array.isArray(question.objective_codes) && question.objective_codes.length > 0, `${question.id}: leerdoel ontbreekt`);
  assert(["choice", "number"].includes(question.type), `${question.id}: ongeldig vraagtype`);
  assert(question.prompt && question.explanation, `${question.id}: tekst ontbreekt`);
  assert(Object.hasOwn(question, "answer"), `${question.id}: antwoord ontbreekt`);
  if (question.type === "choice") assert(question.options.includes(question.answer), `${question.id}: antwoord staat niet tussen opties`);
}

assert.equal(new Set(questions.map((question) => question.domain)).size, 5, "Niet alle domeinen zijn vertegenwoordigd");
const expectedCodes = [
  ...Array.from({ length: 6 }, (_, index) => `B${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `G${index + 1}`),
  ...Array.from({ length: 15 }, (_, index) => `R${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `V${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `P${index + 1}`),
  ...Array.from({ length: 15 }, (_, index) => `K${index + 1}`),
];
assert.deepEqual(curriculum.objectives.map((objective) => objective.code), expectedCodes, "De 58 doelen zijn niet compleet of staan verkeerd");
assert(curriculum.objectives.every((objective) => objective.questions.length === 3), "Elk doel moet drie basisvragen hebben");
assert.deepEqual(level4.questions.map((question) => question.objective_code), expectedCodes, "Niveau 4 dekt niet alle doelen");
assert.equal(new Set(level4.questions.map((question) => question.id)).size, 58, "Dubbele niveau-4-id");
assert(level4.questions.every((question) => question.id === `${question.objective_code}-N4-001`), "Elke niveau-4-vraag moet *-N4-001 heten (code + -N4-001)");
assert(level4.questions.every((question) => question.id.endsWith("-N4-001")), "Niveau-4-ids moeten op -N4-001 eindigen");
console.log(`${questions.length} oude vragen, 58 doelen, 174 basisvragen en 58 niveau-4-vragen gecontroleerd.`);

import { config } from "./config.js";
import { TimelineGame, formatDate } from "./game.js";
async function loadMemories() {
  const response = await fetch("./generated/memories.json");
  if (!response.ok) throw new Error("Spominov ni mogoče naložiti. Zaženi uvoz fotografij in odpri igro prek lokalnega strežnika.");
  return response.json();
}

const $ = (id) => document.getElementById(id);
const screens = { welcome: $("welcome-screen"), game: $("game-screen"), end: $("end-screen"), error: $("error-screen") };
let game;
let starting = false;
let celebrationTimer;

function show(name) {
  Object.entries(screens).forEach(([key, element]) => { element.hidden = key !== name; });
}

function renderCards(revealed = false) {
  $("cards").innerHTML = [game.anchor, game.comparison].map((memory, index) => `
    <article class="photo-card ${index === 1 && revealed ? "revealed" : ""}" data-position="${index === 0 ? "anchor" : "comparison"}">
      <button class="photo-frame photo-choice" type="button" data-answer="${index === 0 ? "earlier" : "later"}" aria-label="${index === 0 ? "Leva" : "Desna"} slika je mlajša" ${game.revealing || game.animating || game.gameOver || game.completed ? "disabled" : ""}><img src="${escapeHtml(memory.photo)}" alt="${escapeHtml(memory.alt)}" /></button>
      <p class="card-role">${index === 0 ? "Izhodiščni spomin" : "Naslednji trenutek"}</p>
      ${memory.caption ? `<p class="caption">${escapeHtml(memory.caption)}</p>` : ""}
      <p class="date ${revealed ? "" : "hidden"}">${formatDate(memory.date, memory.time)}</p>
    </article>`).join("");
  $("cards").querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => {
      image.closest(".photo-card").classList.add("image-error");
      image.alt = "Fotografije tega spomina ni mogoče naložiti";
    });
  });
}

function updateStats() {
  $("score").textContent = game.score;
  $("streak").textContent = game.streak;
  $("best-streak").textContent = game.bestStreak;
  $("lives").textContent = game.lives;
  const visibleMemories = game.memories.length - game.unused.length;
  $("progress-text").textContent = `${visibleMemories} / ${game.memories.length} fotografij`;
  $("progress-bar").style.width = `${Math.min(100, (visibleMemories / game.memories.length) * 100)}%`;
  $("heart-count").textContent = `${game.heartFill} / ${game.heartTarget}`;
  $("heart-fill").style.height = `${game.heartFill / game.heartTarget * 100}%`;
  $("heart-meter").setAttribute("aria-valuenow", game.heartFill);
  $("heart-meter").classList.toggle("is-full", game.heartFill === game.heartTarget);
}

function setButtons(disabled) { document.querySelectorAll("#answer-buttons button, #cards button").forEach((button) => { button.disabled = disabled; }); }

function celebrateHeart() {
  window.clearTimeout(celebrationTimer);
  $("heart-celebration").hidden = false;
  celebrationTimer = window.setTimeout(() => { $("heart-celebration").hidden = true; }, 2200);
}

function handleAnswer(guess) {
  const result = game.answer(guess);
  if (!result) return;
  setButtons(true);
  renderCards(true);
  const feedback = $("feedback");
  feedback.className = `feedback ${result.correct ? "success" : "mistake"}`;
  feedback.textContent = result.correct
    ? `Pravilno! ${result.correctAnswer === "earlier" ? "Leva" : "Desna"} slika je mlajša.`
    : `Skoraj! ${result.correctAnswer === "earlier" ? "Leva" : "Desna"} slika je mlajša.${result.lives > 0 ? " Poskusi znova." : ""}`;
  updateStats();
  if (result.heartCompleted) celebrateHeart();
  if (!result.correct && result.lives > 0) {
    window.setTimeout(() => { game.revealing = false; renderCards(false); feedback.textContent = "Ko želiš, poskusi znova."; setButtons(false); }, 1300);
    return;
  }
  $("cards").classList.toggle("transitioning", result.correct);
  window.setTimeout(() => {
    const transition = game.completeTransition();
    if (transition.gameOver || transition.completed) showEnd(transition.completed);
    else { $("cards").classList.remove("transitioning"); renderCards(false); updateStats(); feedback.textContent = ""; setButtons(false); }
  }, result.correct ? 650 : 700);
}

function showEnd(completed) {
  $("end-kicker").textContent = completed ? "Konec tega poglavja" : "Majhen preobrat";
  $("end-title").textContent = completed ? "Kako lepa zgodba." : "Zgodba se nadaljuje.";
  $("end-message").textContent = completed ? config.finalAnniversaryMessage : "Nič hudega – vsaka velika ljubezenska zgodba si zasluži še eno priložnost. Poskusiva znova.";
  $("final-score").textContent = game.score;
  $("final-best").textContent = game.bestStreak;
  $("memory-selection").innerHTML = game.memories.slice(0, Math.min(3, game.memories.length)).map((memory) => `<span>${escapeHtml(memory.caption || formatDate(memory.date, memory.time))}</span>`).join("");
  show("end");
}

async function start() {
  if (starting) return;
  starting = true;
  try {
    const memories = await loadMemories();
    game = new TimelineGame(memories, { lives: config.startingLives, points: config.pointsPerCorrectGuess });
    window.clearTimeout(celebrationTimer);
    $("heart-celebration").hidden = true;
    $("welcome-title").textContent = config.title;
    $("welcome-subtitle").textContent = config.subtitle;
    $("game-title").textContent = config.title;
    $("cards").classList.remove("transitioning");
    setButtons(false);
    renderCards(false);
    updateStats();
    $("feedback").textContent = "";
    show("game");
  } catch (error) {
    $("error-message").textContent = error.message;
    show("error");
  } finally {
    starting = false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

$("start-button").addEventListener("click", start);
$("play-again-button").addEventListener("click", start);
$("answer-buttons").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-answer]");
  if (button) handleAnswer(button.dataset.answer);
});
$("cards").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-answer]");
  if (button && !button.disabled) handleAnswer(button.dataset.answer);
});
$("welcome-title").textContent = config.title;
$("welcome-subtitle").textContent = config.subtitle;

document.title = config.title;

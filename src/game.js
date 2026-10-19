const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CAPTURE_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function captureKey(memory) {
  return `${memory.date}T${memory.time || ""}`;
}

export function validateMemories(input) {
  if (!Array.isArray(input) || input.length < 2) throw new Error("Pred začetkom dodaj vsaj dva spomina.");
  const ids = new Set();
  const dates = new Map();
  const valid = input.map((memory) => {
    if (!memory || typeof memory !== "object") throw new Error("Vsak spomin mora biti podatkovni objekt.");
    if (!memory.id || ids.has(memory.id)) throw new Error(`Oznake spominov morajo biti enolične (težava pri "${memory.id || "brez imena"}").`);
    if (!memory.photo) throw new Error(`Spominu »${memory.id}« manjka pot do fotografije.`);
    if (!ISO_DATE.test(memory.date)) throw new Error(`Spomin »${memory.id}« potrebuje datum v obliki YYYY-MM-DD.`);
    const [year, month, day] = memory.date.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Spomin »${memory.id}« ima neveljaven datum.`);
    }
    if (memory.time != null && !CAPTURE_TIME.test(memory.time)) throw new Error(`Spomin »${memory.id}« potrebuje veljavno uro v obliki HH:MM:SS.`);
    const times = dates.get(memory.date) || new Set();
    if (times.size && (!memory.time || times.has(null))) throw new Error(`Za fotografije z dne ${memory.date} dodaj ure posnetkov.`);
    if (times.has(memory.time || null)) throw new Error(`Dva spomina imata isti datum in uro: ${memory.date} ${memory.time || ""}. Popravi podatke o času posnetka.`);
    ids.add(memory.id);
    times.add(memory.time || null);
    dates.set(memory.date, times);
    return { ...memory, caption: memory.caption || "", alt: memory.alt || memory.caption || "Osebni spomin" };
  });
  return valid.sort((a, b) => captureKey(a).localeCompare(captureKey(b)));
}

export function formatDate(isoDate, time = null) {
  const date = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
  return time ? `${date} ob ${time}` : date;
}

export class TimelineGame {
  constructor(input, { lives, points }) {
    this.memories = validateMemories(input);
    this.startingLives = lives;
    this.points = points;
    this.reset();
  }

  reset() {
    this.anchor = this.memories[0];
    this.comparison = this.memories[1];
    this.unused = this.memories.slice(2);
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.heartFill = 0;
    this.heartTarget = 20;
    this.lives = this.startingLives;
    this.revealing = false;
    this.animating = false;
    this.gameOver = false;
    this.completed = false;
  }

  answer(guess) {
    if (this.revealing || this.animating || this.gameOver) return null;
    this.revealing = true;
    const correctAnswer = captureKey(this.comparison) < captureKey(this.anchor) ? "earlier" : "later";
    const correct = guess === correctAnswer;
    const previousFill = this.heartFill;
    if (correct) {
      this.score += this.points;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.heartFill = Math.min(this.heartTarget, this.heartFill + 1);
    } else {
      this.lives -= 1;
      this.streak = 0;
      this.heartFill = Math.max(0, this.heartFill - 2);
    }
    return { correct, correctAnswer, anchor: this.anchor, comparison: this.comparison, lives: this.lives,
      heartCompleted: previousFill < this.heartTarget && this.heartFill === this.heartTarget };
  }

  completeTransition() {
    if (!this.revealing) return { complete: false };
    if (this.lives <= 0) {
      this.gameOver = true;
      return { complete: true, gameOver: true };
    }
    if (this.comparison && this.unused.length === 0) {
      this.completed = true;
      return { complete: true, completed: true };
    }
    this.anchor = this.comparison;
    this.comparison = this.unused.splice(Math.floor(Math.random() * this.unused.length), 1)[0];
    this.revealing = false;
    return { complete: true, next: true };
  }
}

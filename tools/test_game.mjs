import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

// Load this browser ES module without changing the project's package setup.
const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
const { TimelineGame, validateMemories, formatDate } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const memory = (id, date, time) => ({ id, date, time, photo: './photo.jpg' });

test('same-day photos sort by time and compare in both directions', () => {
  const input = [memory('evening', '2024-05-12', '18:00:01'), memory('morning', '2024-05-12', '10:00:00'), memory('noon', '2024-05-12', '12:30:00')];
  const game = new TimelineGame(input, { lives: 3, points: 1 });
  assert.equal(game.anchor.id, 'morning');
  assert.equal(game.comparison.id, 'noon');
  assert.equal(game.answer('later').correct, true);
  assert.equal(game.answer('later'), null);
  game.completeTransition();
  assert.equal(game.anchor.id, 'noon');
  assert.equal(game.comparison.id, 'evening');
  assert.equal(game.answer('later').correct, true);
  assert.equal(game.completeTransition().completed, true);
  game.reset();
  game.anchor = game.memories[2];
  game.comparison = game.memories[0];
  assert.equal(game.answer('earlier').correct, true);
  assert.equal(input[0].id, 'evening');
});

test('calendar date takes priority; date-only photos still work across days', () => {
  const game = new TimelineGame([memory('today', '2024-05-12', '23:59:59'), memory('tomorrow', '2024-05-13', '00:00:00')], { lives: 3, points: 1 });
  assert.equal(game.answer('later').correct, true);
  assert.equal(validateMemories([memory('a', '2024-01-01'), memory('b', '2024-01-02')]).length, 2);
});

test('ambiguous, identical, and invalid capture times are rejected', () => {
  const timed = memory('a', '2024-05-12', '10:00:00');
  for (const time of ['10:00:00', undefined, '24:00:00', '12:60:00', '10:00']) {
    assert.throws(() => validateMemories([timed, memory('b', timed.date, time)]));
  }
  assert.throws(() => validateMemories([memory('b', timed.date), timed]));
});

test('revealed labels include capture time', () => {
  assert.match(formatDate('2024-05-12', '18:00:01'), /ob 18:00:01$/);
  assert.doesNotMatch(formatDate('2024-05-12'), /ob/);
});

test('heart fills at 20, loses two per mistake, and resets for a new game', () => {
  const input = Array.from({ length: 30 }, (_, index) => memory(String(index), '2024-05-12', `12:00:${String(index).padStart(2, '0')}`));
  const game = new TimelineGame(input, { lives: 10, points: 1 });
  const correctGuess = () => game.comparison.time < game.anchor.time ? 'earlier' : 'later';
  const advance = () => {
    const result = game.answer(correctGuess());
    game.completeTransition();
    return result;
  };
  for (let index = 0; index < 19; index++) {
    assert.equal(advance().heartCompleted, false);
  }
  assert.equal(game.heartFill, 19);
  assert.equal(advance().heartCompleted, true);
  assert.equal(game.heartFill, 20);
  assert.equal(advance().heartCompleted, false);
  const wrong = correctGuess() === 'earlier' ? 'later' : 'earlier';
  game.answer(wrong);
  assert.equal(game.heartFill, 18);
  assert.equal(game.streak, 0);
  assert.equal(game.answer(wrong), null);
  assert.equal(game.heartFill, 18);
  game.revealing = false;
  assert.equal(advance().heartCompleted, false);
  assert.equal(advance().heartCompleted, true);
  game.reset();
  assert.equal(game.heartFill, 0);
  game.answer('earlier');
  assert.equal(game.heartFill, 0);
});

test('photo clicks and bottom buttons choose the younger picture and ignore duplicate input', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, textContent: '', innerHTML: '', style: {}, listeners: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      querySelectorAll() { return []; },
      setAttribute() {},
    });
    return elements.get(id);
  };
  const timers = [];
  const input = [memory('morning', '2024-05-12', '10:00:00'), memory('noon', '2024-05-12', '12:00:00'), memory('evening', '2024-05-12', '18:00:00')];
  const context = createContext({
    TimelineGame, formatDate,
    config: { title: 'Test', subtitle: '', startingLives: 3, pointsPerCorrectGuess: 1 },
    document: { getElementById: element, querySelectorAll() { return []; } },
    fetch: async () => ({ ok: true, json: async () => input }),
    window: { setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {} },
  });
  const main = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  runInContext(main, context);
  await element('start-button').listeners.click();
  const click = (id, answer) => element(id).listeners.click({ target: { closest: () => ({ dataset: { answer }, disabled: false }) } });
  const state = () => runInContext('game', context);
  assert.match(element('cards').innerHTML, /photo-choice/);
  click('cards', 'earlier'); // The left (morning) photograph is older.
  assert.equal(state().lives, 2);
  assert.match(element('cards').innerHTML, /disabled/);
  click('cards', 'later');
  assert.equal(state().score, 0);
  timers.find(timer => timer.delay === 1300).fn();
  click('cards', 'later');
  assert.equal(state().score, 1);
  assert.equal(state().heartFill, 1);
  timers.find(timer => timer.delay === 650).fn();
  assert.equal(state().anchor.id, 'noon');
  click('answer-buttons', 'later');
  assert.equal(state().score, 2);
  await element('play-again-button').listeners.click();
  assert.equal(state().heartFill, 0);
  assert.equal(state().lives, 3);
});

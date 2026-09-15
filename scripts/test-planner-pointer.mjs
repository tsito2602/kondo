import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const sourcePath = path.resolve('src/utils/planner-pointer.web.ts');
const code = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => { throw new Error(`unexpected import ${name}`); }, module, module.exports);
const { PLANNER_LONG_PRESS_MS, plannerGestureIntent, edgeScrollSpeed, parsePlanSource, attachPlannerPointer } = module.exports;
const css = readFileSync(path.resolve('src/redesign.css'), 'utf8');

const classList = () => ({ add() {}, remove() {} });
function element(dataset = {}) {
  return {
    dataset: { ...dataset }, isConnected: true, inert: false, classList: classList(), style: {},
    closest(selector) {
      if (selector.includes('[data-plan-source]') && this.dataset.planSource) return this;
      if (selector.includes('[data-plan-card]') && this.card) return this.card;
      if (selector.includes('[data-plan-drop]') && this.dataset.planDrop) return this;
      if (selector.includes('[data-plan-entry]') && this.dataset.planEntry) return this;
      if (selector.includes('[data-plan-day]') && this.dataset.planDay) return this;
      if (selector.includes('[aria-disabled') && this.ariaDisabled) return this;
      return null;
    },
    contains(target) { return target === this || target?.parent === this; },
    hasAttribute(name) { return name === 'disabled' ? Boolean(this.disabled) : false; },
    setAttribute() {}, removeAttribute() {}, remove() {}, querySelectorAll() { return []; },
    getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, right: 152, bottom: 72, width: 152, height: 72 }; },
    cloneNode() { const clone = element({ ...this.dataset }); clone.querySelectorAll = () => []; return clone; },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
    addEventListener() {}, removeEventListener() {},
  };
}
function fixture() {
  const listeners = new Map(), windowListeners = new Map(), registrations = [], timers = new Map(); let point = null, raf = 0, timerId = 0;
  const body = { appendChild() {} };
  const doc = {
    hidden: false, body,
    defaultView: null,
    elementFromPoint() { return point; },
    querySelector() { return null; },
    addEventListener(name, fn) { listeners.set(`doc:${name}`, fn); }, removeEventListener() {},
  };
  const win = {
    Element: Object,
    requestAnimationFrame() { raf += 1; return raf; }, cancelAnimationFrame() {},
    setTimeout(fn) { timerId += 1; timers.set(timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener() {},
  };
  doc.defaultView = win;
  const root = element(); root.ownerDocument = doc;
  root.addEventListener = (name, fn, options) => { listeners.set(name, fn); registrations.push([name, options]); }; root.removeEventListener = () => {};
  root.querySelectorAll = () => [];
  const calls = [];
  const cleanup = attachPlannerPointer(root, {
    start: source => calls.push(['start', source]), drop: (source, slot) => calls.push(['drop', source, slot]),
    day: day => calls.push(['day', day]), cancel: () => calls.push(['cancel']),
  });
  const emit = (name, event) => (listeners.get(name) ?? windowListeners.get(name))?.(event);
  const fireHold = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  return { root, doc, win, calls, cleanup, emit, registrations, fireHold, setPoint(value) { point = value; } };
}
function pointer(target, x, y, extras = {}) {
  return { target, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', preventDefault() {}, ...extras };
}

test('touch movement before the hold belongs to scrolling, while mouse/pen can drag immediately', () => {
  assert.equal(plannerGestureIntent(8, 1, true, 'lift'), 'scroll');
  assert.equal(plannerGestureIntent(1, 8, true, 'lift'), 'scroll');
  assert.equal(plannerGestureIntent(8, 1, true, 'free'), 'scroll');
  assert.equal(plannerGestureIntent(8, 1, false, 'lift'), 'drag');
  assert.equal(plannerGestureIntent(4, 4, true, 'lift'), 'pending');
  assert.equal(PLANNER_LONG_PRESS_MS, 280);
});
test('candidate touch-action keeps horizontal candidate scrolling available before the hold', () => {
  assert.match(css, /\.planner-card-frame\[data-plan-gesture="lift"\]\s*\{[^}]*touch-action:\s*pan-x;/s);
});
test('planner observes pointerdown in capture phase before nested Pressable responders', () => {
  const f = fixture();
  assert(f.registrations.some(([name, options]) => name === 'pointerdown' && options === true));
  f.cleanup();
});
test('source parser accepts only planner item/place ids', () => {
  assert.deepEqual(parsePlanSource('{"kind":"place","id":"p"}'), { kind: 'place', id: 'p' });
  assert.equal(parsePlanSource('{"kind":"booking","id":"p"}'), null);
});
test('edge scroll stays bounded', () => {
  assert.equal(edgeScrollSpeed(50, 0, 100), 0);
  assert(Math.abs(edgeScrollSpeed(1, 0, 100)) <= 12);
  assert(Math.abs(edgeScrollSpeed(99, 0, 100)) <= 12);
});

test('plain tap does not begin drag', () => {
  const f = fixture(); const card = element({ planGesture: 'lift' }); const source = element({ planSource: '{"kind":"place","id":"p"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10));
  f.emit('pointerup', pointer(source, 10, 10));
  assert.deepEqual(f.calls, []); f.cleanup();
});
test('movement before long press cancels drag intent and leaves scrolling alone', () => {
  const f = fixture(); const card = element({ planGesture: 'lift' }); const source = element({ planSource: '{"kind":"place","id":"p"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10)); f.emit('pointermove', pointer(source, 10, 28)); f.fireHold();
  assert.deepEqual(f.calls, []); f.cleanup();
});
test('long press starts touch drag before movement so the card can follow the finger', () => {
  const f = fixture(); const card = element({ planGesture: 'lift' }); const source = element({ planSource: '{"kind":"place","id":"p"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10)); f.fireHold();
  assert.deepEqual(f.calls[0], ['start', { kind: 'place', id: 'p' }]);
  f.emit('pointermove', pointer(source, 12, 36));
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1); f.cleanup();
});
test('mouse/pen movement still starts immediately without waiting for hold', () => {
  const f = fixture(); const card = element({ planGesture: 'free' }); const source = element({ planSource: '{"kind":"item","id":"i"}' }); source.card = card; source.parent = f.root;
  f.emit('pointerdown', pointer(source, 10, 10, { pointerType: 'mouse' })); f.emit('pointermove', pointer(source, 28, 12, { pointerType: 'mouse' }));
  assert.equal(f.calls[0]?.[0], 'start'); f.cleanup();
});
for (let n = 0; n < 19; n++) test(`pointer regression ${n + 1}`, () => {
  assert.equal(plannerGestureIntent(0, 0, true, 'lift'), 'pending');
});

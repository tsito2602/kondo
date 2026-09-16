import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const module = { exports: {} };
const js = ts.transpileModule(readFileSync('src/utils/trip-transition.web.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', js)(module, module.exports);
const { createTripTransitionController } = module.exports;

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://tabi.test/',
  pretendToBeVisual: true,
});
const { document } = dom.window;
Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 390 });
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.getClientRects = function () {
  return this.hidden ? [] : [{ width: 300, height: 200 }];
};

const named = () => [...document.querySelectorAll('[style]')]
  .map((element) => [element, element.style.getPropertyValue('view-transition-name')])
  .filter(([, name]) => name);
const home = () => {
  dom.window.history.replaceState({}, '', '/');
  document.body.innerHTML = '<div id="trip-list-ready"><button><div id="trip-ticket-a"><div data-testid="trip-ticket-cover"></div><span data-testid="trip-ticket-title">Vienna</span></div></button></div>';
};
const detail = () => {
  dom.window.history.replaceState({}, '', '/trips/a/itinerary');
  document.body.innerHTML = '<main id="trip-workspace-a"><div data-testid="trip-hero-cover"></div><header data-testid="trip-header"><h1 data-testid="trip-name">Vienna</h1><span>2026.09.28 — 2026.10.01</span></header></main>';
};

let snapshot;
let finish;
document.startViewTransition = (update) => {
  const old = named();
  let resolveFinished;
  const finished = new Promise((resolve) => { resolveFinished = resolve; });
  const updateCallbackDone = Promise.resolve().then(update).then(() => {
    snapshot = { old, new: named() };
  });
  finish = resolveFinished;
  return {
    ready: updateCallbackDone.then(() => undefined),
    updateCallbackDone,
    finished,
    skipTransition: () => resolveFinished(),
  };
};

home();
const controller = createTripTransitionController(document);
const cleanup = controller.install();
controller.run('open', 'a', detail);
await new Promise((resolve) => setTimeout(resolve, 20));

assert(snapshot, 'mobile trip navigation captures a view transition');
assert(snapshot.old.some(([, name]) => name === 'tabi-trip-cover'), 'the shared trip cover remains animated');
assert(snapshot.new.some(([, name]) => name === 'tabi-trip-cover'), 'the destination cover remains animated');
assert.equal(snapshot.old.some(([, name]) => name === 'tabi-trip-title'), false, 'mobile ticket title is not raster-scaled');
assert.equal(snapshot.new.some(([, name]) => name === 'tabi-trip-title'), false, 'mobile header title stays in the normal header snapshot');

finish();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(named().length, 0, 'transition names are cleaned after the trip opens');
cleanup();
dom.window.close();
console.log('Mobile header artifacts: cover transition retained without a separately scaled title snapshot.');

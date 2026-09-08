// functional-check.mjs — evaluates lib/client.js in a mocked browser/module
// environment and exercises apply(): slot registrations, the /history
// input-trigger source (own panel, no official popupSelect shell), and the
// full-log history loader.
//
//   node scripts/functional-check.mjs

import assert from "node:assert/strict";

// ---- minimal React stub (hooks are never invoked; only referenced at render) ----
const reactStub = new Proxy({}, {
  get(_t, prop) {
    if (prop === "createElement") {
      return (type, props, ...children) => ({ type, props, children });
    }
    if (prop === "useMemo") return (fn) => fn();
    if (prop === "useSyncExternalStore") return (subscribe, get) => get();
    if (prop === "useRef") return () => ({ current: null });
    if (prop === "useEffect") return () => {};
    if (prop === "useLayoutEffect") return () => {};
    if (prop === "useState") return (init) => [typeof init === "function" ? init() : init, () => {}];
    return () => undefined;
  },
});

// ---- tiny async helper ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock browser globals ----
const insertedStyles = [];
const createdEls = [];
const docState = { cardEl: null };
globalThis.document = {
  documentElement: { lang: "zh-CN" },
  createElement(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      setAttribute() {},
      remove() {},
      appendChild() {},
      querySelector(sel) { return (sel === "[data-composer-card]" && docState.cardEl) || null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      contains() { return false; },
      focus() {},
    };
    createdEls.push(el);
    return el;
  },
  head: { appendChild(el) { insertedStyles.push(el); } },
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  innerHeight: 900,
  getSelection: () => null,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.Element = class Element {
  constructor() { this.attributes = {}; }
  closest() { return null; }
  contains() { return false; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
};
globalThis.Node = class Node {};
globalThis.Range = class Range { compareBoundaryPoints() { return 0; } };
globalThis.AbortController = class AbortController {
  constructor() { this.signal = { aborted: false }; }
  abort() {}
};

// ---- capture the module factory via a fake module loader ----
let loaded = null;
globalThis.window.__ModuleLoader__ = {
  load(def) { loaded = def; },
};

await import("../lib/client.js");
assert.ok(loaded, "module loader must receive the module definition");
assert.equal(loaded.id, "@loommii/dsh-input-history", "module id must match the package");

// Enable the client's guarded test hook BEFORE the factory body runs (the hook
// assignment lives in the factory, not in apply()).
globalThis.__DSH_IH_TEST__ = true;
const exportsObj = loaded.factory((name) => {
  if (name === "react") return reactStub;
  throw new Error("unexpected require: " + name);
});
assert.equal(typeof exportsObj.apply, "function", "client must export apply");
const ihTest = globalThis.__DSH_IH_TEST__;
assert.ok(ihTest && typeof ihTest.loadFullHistory === "function", "test hook must expose loadFullHistory");
assert.ok(ihTest.HistoryLoad instanceof Map, "test hook must expose the per-session loader Map");
globalThis.__DSH_IH_TEST__ = undefined;

// ---- mocks for the services the plugin touches ----
const registeredComponents = new Map();
const slotInjects = [];
const registeredSources = [];
const effects = [];
const shellDraftWrites = [];
const slashPickWrites = [];

const slotsService = {
  inject(key, callback) {
    slotInjects.push(key);
    const disposer = callback();
    if (disposer && typeof disposer === "function") disposer();
    else if (disposer && typeof disposer[Symbol.iterator] === "function") for (const d of disposer) d && d();
    return () => {};
  },
  register(options, component) {
    registeredComponents.set(options.id, component);
    return () => {};
  },
};

const ctx = {
  slots: slotsService,
  get(name) {
    if (name === "slots") return slotsService;
    if (name === "inputTriggers") {
      return {
        registerSource(src) {
          registeredSources.push(src);
          return () => {};
        },
      };
    }
    if (name === "commandUi") {
      return {
        register() { throw new Error("commandUi.register must NOT be called (no official popupSelect)"); },
      };
    }
    if (name === "remote.session") {
      // Mock the host session-log pager: follow() yields an opening snapshot
      // with the durable cursor + newest page; page() serves older cuts.
      const all = [
        // [seq, type, sourceKind, text, time]
        [1, "user/message", "user", "最早的一条输入(加载更早背后)", 500],
        [2, "user/message", "user", "第一句话", 1000],
        [3, "assistant/message", "assistant", null, 1500],
        [4, "user/message", "user", "第二句话", 2000],
        [5, "steering/message", "steering", null, 3000],
        [6, "user/message", "user", "第一句话", 4000], // non-consecutive dupe
      ];
      const perSession = {
        "sess-B": [
          [1, "user/message", "user", "B-自己的输入", 600],
          [2, "user/message", "user", "B-第二句", 700]
        ]
      };
      const pickLog = (sid) => (sid && perSession[sid]) || all;
      const toRecords = (rows) => rows.map(([seq, type, sourceKind, text, time]) => ({
        type: "event",
        event: {
          type,
          seq,
          time,
          data: sourceKind === "assistant" || sourceKind === "steering"
            ? { source: { kind: sourceKind } }
            : { source: { kind: sourceKind }, content: [{ type: "text", text }] },
        },
      }));
      return {
        async *follow(request) {
          // Fail fast for the error-path test session (RPC failure).
          const sid = request.address && request.address.sessionId;
          if (sid === "fail-session") {
            throw new Error("boom: follow failed (test)");
          }
          const data = pickLog(sid);
          const max = request.maxMessages ?? 50;
          const begin = Math.max(0, data.length - max);
          yield {
            type: "snapshot",
            cursor: data.at(-1)[0],
            records: toRecords(data.slice(begin)),
            hasMore: begin > 0,
          };
        },
        async page(request) {
          if (request.beforeSeq === undefined) return { ok: false, error: new Error("page requires an open cursor") };
          const data = pickLog(request.address && request.address.sessionId);
          const idx = data.findIndex(([seq]) => seq === request.beforeSeq);
          if (idx <= 0) return { ok: true, value: { records: [], hasMore: false } };
          const max = request.maxMessages ?? 50;
          const begin = Math.max(0, idx - max);
          return {
            ok: true,
            value: {
              records: toRecords(data.slice(begin, idx)),
              hasMore: begin > 0,
            },
          };
        },
      };
    }
    if (name === "conversation") {
      return {
        input: {
          shell(id) {
            return {
              actions: {
                setDraft(text) { shellDraftWrites.push({ sessionId: id, text }); },
              },
            };
          },
        },
      };
    }
    return undefined;
  },
  effect(fn) {
    const disposer = fn();
    effects.push(disposer);
    return disposer;
  },
  inject(_deps, fn) {
    fn({
      get(name) { return ctx.get(name); },
      effect(fn2) { const d = fn2(); effects.push(d); return d ?? (() => {}); },
    });
  },
};

exportsObj.apply(ctx);

assert.ok(slotInjects.includes("conversation.input.overlay"), "must inject the overlay slot");
assert.ok(registeredComponents.has("input-history-panel"), "overlay component must be registered");
assert.ok(insertedStyles.length === 1, "must install one stylesheet");

// ---- /history is provided by OUR input-trigger source, NOT commandUi popupSelect ----
assert.equal(registeredSources.length, 1, "must register exactly one input-trigger source");
const source = registeredSources[0];
assert.equal(source.trigger, "/", "source must be a '/' trigger");
assert.equal(source.name, "input-history", "source name must be the plugin-owned unique id");
assert.equal(typeof source.candidates, "function", "source must provide menu candidates");
assert.equal(typeof source.matchEnter, "function", "source must answer bare-enter");

const candidates = await source.candidates({ sessionId: "s1" }, { query: "hist" });
assert.equal(candidates.length, 1, "candidates must include one history row");
assert.equal(candidates[0].name, "history", "candidate name must be history");
assert.ok(!String(exportsObj).includes("popupSelect"), "no popupSelect registration path may exist");

// Bare-enter "/history" opens our own panel (handled, not a command claim).
const enterOutcome = await source.matchEnter({ sessionId: "s1" }, "/history", new AbortController().signal, { images: 0 });
assert.equal(enterOutcome, "handled", "bare /history enter must be handled by our source");

// ---- REGRESSION: clicking ANY history row must recall THAT row (var-loop trap) ----
// lib/client.js's row renderer used `var item` inside the loop; every row's
// onMouseDown closed over the SAME function-scoped binding, so any click applied
// the LAST filtered row. The fix binds `const item` per iteration.
{
  const Panel = registeredComponents.get("input-history-panel");
  assert.ok(typeof Panel === "function", "overlay component must be a function");
  const store = ihTest.HistoryStore;
  // Put the panel into ready state with three rows (newest first).
  store.set({
    open: true, index: 0, savedDraft: "", mode: "replace",
    prefix: "", suffix: "", sessionId: "s-click", phase: "ready",
    rows: [
      { id: "r0", label: "msg-newest", detail: undefined },
      { id: "r1", label: "msg-middle", detail: undefined },
      { id: "r2", label: "msg-oldest", detail: undefined }
    ]
  });
  // The conversation mock records setDraft calls into shellDraftWrites.
  // Render with useInput returning a draft for parity.
  const tree = Panel({ sessionId: "s-click", useInput: () => ({ draft: "" }) });
  const foundRows = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const p = node.props;
    if (p && typeof p.onMouseDown === "function" && p.className && String(p.className).includes("dsh-ih-row")) {
      foundRows.push(node);
    }
    walk(node.children);
  })(tree);
  assert.equal(foundRows.length, 3, "must render one row per history item");
  const shellWritesBefore = shellDraftWrites.length;
  // Row 0 = newest, row 1 = middle, row 2 = oldest. Simulate mouse click.
  const ev = { preventDefault() {}, stopPropagation() {} };
  foundRows[0].props.onMouseDown(ev);
  foundRows[1].props.onMouseDown(ev);
  foundRows[2].props.onMouseDown(ev);
  const writes = shellDraftWrites.slice(shellWritesBefore);
  assert.equal(writes.length, 3, "three clicks must produce three draft writes");
  assert.equal(writes[0].text, "msg-newest", "click row 0 must recall row 0, not the last row");
  assert.equal(writes[1].text, "msg-middle", "click row 1 must recall row 1, not the last row");
  assert.equal(writes[2].text, "msg-oldest", "click row 2 must recall row 2");
  // Close the panel again to leave a clean store for later asserts.
  store.set({ open: false });
}

// ---- REGRESSION: a load for session B must NOT strand session A's callbacks ----
// Old loader kept ONE global {sessionId,inflight,cbs}; starting session B while A
// was in flight OVERWROTE A's waiter list, and A's finish() then bailed because
// sessionId no longer matched — the arrow walk for A stayed waiting forever.
// New loader keeps a per-session Map so A's callbacks still fire.
{
  const loader = ihTest.loadFullHistory;
  const loadMap = ihTest.HistoryLoad;
  assert.ok(loadMap instanceof Map, "loader state must be a per-session Map");
  // The bare-enter test above already started an async load for its session;
  // wait for it to finish so this block starts from a clean map.
  for (let tries = 0; tries < 100 && loadMap.size > 0; tries++) await sleep(10);
  assert.equal(loadMap.size, 0, "loader map must start empty after prior load settles");
  // The pager mock resolves on microtasks, so both loader() calls below run in
  // the SAME synchronous turn: session A is still in flight when session B
  // starts (that is exactly the interleaving that used to strand A's waiters).
  const sA = "session-A";
  const sB = "session-B";
  const outA = [];
  const outB = [];
  let resolveA, resolveB;
  const doneA = new Promise((res) => { resolveA = res; });
  const doneB = new Promise((res) => { resolveB = res; });
  loader(sA, (rows) => { outA.push(rows); resolveA(); });
  loader(sB, (rows) => { outB.push(rows); resolveB(); });
  // Fail loudly (not hang) if a callback is stranded — the old bug never fired it.
  const timeout = sleep(2000).then(() => { throw new Error("loader stranded a waiter callback (old single-flight race)"); });
  await Promise.race([Promise.all([doneA, doneB]), timeout]);
  assert.equal(outA.length, 1, "session A callback must fire exactly once");
  assert.equal(outB.length, 1, "session B callback must fire exactly once");
  assert.ok(Array.isArray(outA[0]), "session A must receive rows");
  assert.ok(Array.isArray(outB[0]), "session B must receive rows");
  assert.equal(loadMap.size, 0, "loader map must be empty after both loads finish");
}

// ---- REGRESSION: a load failure must NOT masquerade as empty history ----
// Old loaders caught every page/follow error and resolved with [] — the panel
// then showed "暂无历史记录" for a session whose history merely failed to load.
// Now failures surface as an error to callers (and an error phase in the UI).
{
  const loader = ihTest.loadFullHistory;
  const loadMap = ihTest.HistoryLoad;
  // Fail-session's follow() throws; the loader must report (rows=[], err) and
  // still release its Map entry so later loads are not blocked.
  let errOut = null;
  let rowsOut = null;
  let settled = false;
  const p = new Promise((res) => {
    loader("fail-session", (rows, err) => { rowsOut = rows; errOut = err; settled = true; res(); });
  });
  const timeout = sleep(2000).then(() => { throw new Error("error-path loader never settled"); });
  await Promise.race([p, timeout]);
  assert.equal(settled, true, "loader callback must run on failure");
  assert.ok(errOut instanceof Error, "failure must pass an Error as second callback arg");
  assert.deepEqual(rowsOut, [], "failure must not fabricate rows");
  assert.equal(loadMap.size, 0, "failed load must release its per-session entry");
}

// ---- REGRESSION: panel renders an error phase distinctly from empty ----
{
  const Panel = registeredComponents.get("input-history-panel");
  const store = ihTest.HistoryStore;
  store.set({ open: true, index: 0, sessionId: "s-err", phase: "error", rows: [], savedDraft: "", mode: "replace", prefix: "", suffix: "" });
  const tree = Panel({ sessionId: "s-err", useInput: () => ({ draft: "" }) });
  let statusText = null;
  (function findStatus(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(findStatus); return; }
    const p = node.props;
    if (p && p.className === "dsh-ih-status") { statusText = (node.children && node.children[0]) || null; return; }
    findStatus(node.children);
  })(tree);
  assert.ok(statusText !== null, "error phase must render a status line");
  assert.ok(String(statusText).length > 0, "error status must not be blank");
  assert.notEqual(String(statusText), "暂无历史记录", "error must NOT read as empty history");
  assert.notEqual(String(statusText), "No history yet", "error must NOT read as empty history");
  store.set({ open: false });
}

// ---- REGRESSION: ↑/↓ walk must not leak session A's history into session B ----
// startArrowWalk used to set HistoryCache.sessionId without clearing stale rows,
// so after A's history was cached, walking in B recalled A's messages into B's
// composer. Cross-session start must invalidate the cache; same-session keeps it.
{
  const { HistoryCache, ArrowWalk, startArrowWalk, loadFullHistory } = ihTest;
  // Clean slate.
  HistoryCache.sessionId = null;
  HistoryCache.rows = null;
  ArrowWalk.active = false;
  ArrowWalk.sessionId = null;
  ArrowWalk.rows = [];
  ArrowWalk.waiting = false;
  // Simulate walk preheating (startArrowWalk sets HistoryCache.sessionId
  // before walkHistory loads), then let sess-A's rows land in the cache.
  HistoryCache.sessionId = "sess-A";
  await new Promise((res) => loadFullHistory("sess-A", (rows, err) => { assert.ifError(err); assert.ok(rows.length > 0, "sess-A must have rows"); res(); }));
  assert.equal(HistoryCache.sessionId, "sess-A", "cache must be warm for sess-A");
  const aRows = HistoryCache.rows;
  assert.ok(aRows && aRows.length > 0, "cache must hold sess-A rows");
  // Now simulate: user is in sess-B, presses ↑ (keydown guard clears ArrowWalk,
  // then startArrowWalk(B) must NOT reuse sess-A's cached rows).
  if (ArrowWalk.active && ArrowWalk.sessionId !== "sess-B") {
    ArrowWalk.active = false; ArrowWalk.sessionId = null; ArrowWalk.rows = []; ArrowWalk.waiting = false;
  }
  startArrowWalk("sess-B");
  // After start, the walk for B must be loading B's own data, never A's.
  assert.equal(ArrowWalk.sessionId, "sess-B", "walk must belong to sess-B");
  assert.notEqual(HistoryCache.sessionId, "sess-A", "cache session must move to sess-B");
  // Let the async B load settle, then confirm rows are B's.
  for (let tries = 0; tries < 100 && ArrowWalk.rows.length === 0 && ArrowWalk.waiting; tries++) await sleep(5);
  assert.equal(HistoryCache.sessionId, "sess-B", "cache must be sess-B after settle");
  assert.ok(HistoryCache.rows && HistoryCache.rows.length > 0, "cache must hold sess-B rows after settle");
  assert.notDeepEqual(HistoryCache.rows, aRows, "sess-B rows must differ from sess-A rows (no cross-session leak)");
  // Cleanup: leave no active walk.
  ArrowWalk.active = false; ArrowWalk.sessionId = null; ArrowWalk.rows = []; ArrowWalk.waiting = false;
  HistoryCache.sessionId = null; HistoryCache.rows = null;
}

console.log("OK: own-panel source + click recall + per-session loader + error-path + cross-session walk regressions.");

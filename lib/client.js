window.__ModuleLoader__.load({
	id: "@loommii/dsh-input-history",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		// Arrow-key input history for the DeepSeek Harness Web GUI composer.
		//
		// Two recall surfaces:
		//
		// 1. Arrow-key recall (TERMINAL-STYLE, the composer's main path):
		//    When the caret sits at the very START of the draft and the user
		//    presses ↑ (or the draft is empty and ↑/↓ is pressed), the current
		//    draft is immediately REPLACED by the newest previously-sent message.
		//    Further ↑ walks OLDER messages; ↓ walks NEWER ones and finally
		//    returns to the exact draft the walk began with (so nothing typed
		//    before the first ↑ is lost). Esc restores that original draft;
		//    typing or mouse use exits the walk and keeps the shown text. This
		//    mirrors a shell's command history — no popup list appears.
		//
		// 2. The /history command (slash menu pick and bare "/history" Enter)
		//    opens our own copy of the official popupSelect shell: a floating,
		//    searchable list you can browse with the mouse or ↑/↓ and accept
		//    with Enter/click. Picking from the MENU path INSERTS the recalled
		//    text at the /history token's position (surrounding content stays);
		//    the bare-Enter path opens the same panel with whole-draft replace
		//    semantics. We cannot edit official files, but we CAN ship our own
		//    copy of that shell inside this plugin — identical
		//    classes/styles/anchor logic, with the keyboard fixed so ↑/↓ move
		//    the SAME highlight the mouse hovers (single model). The /history
		//    command is provided by our own input-trigger '/' source, which
		//    opens this panel instead of the official one — so the official
		//    file is never loaded for /history and never modified.
		//
		// Data: history is read from the COMPLETE host session log through the
		// optional remote.session handle (includes messages behind "加载更早")
		// and written via the per-session conversation input shell. Both host
		// handles live in an independent inject fiber.

		var PKG_NAME = "@loommii/dsh-input-history";

		// ---- Official popupSelect shell CSS (copied verbatim, prefixed). ----
		// The official bundle declares these under .mufS8W_*; we declare our own
		// prefixed copies so the two never fight when both are mounted.
		var CSS = "\n.dsh-ih-menu{z-index:100;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);min-width:min(220px,100%);max-width:100%;max-height:320px;box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:20px;outline:none;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 4px);left:0;overflow:hidden}\n.dsh-ih-viewport{flex-direction:column;min-height:0;display:flex;overflow-y:auto}\n.dsh-ih-row{cursor:pointer;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:8px;padding:6px 8px;font-size:13px;display:flex}\n.dsh-ih-rowActive{background:var(--dsw-alias-interactive-bg-hover)}\n.dsh-ih-label{white-space:nowrap;text-overflow:ellipsis;flex:auto;min-width:0;overflow:hidden}\n.dsh-ih-detail{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;font-size:12px;overflow:hidden}\n.dsh-ih-status{color:var(--dsw-alias-label-tertiary);padding:8px 10px;font-size:13px}\n.dsh-ih-search{border:.5px solid var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-primary);background:0 0;border-radius:8px;outline:none;margin:2px 2px 4px;padding:6px 8px;font-size:13px}\n.dsh-ih-walkstatus{position:absolute;right:6px;bottom:calc(100% + 2px);z-index:95;pointer-events:none;color:var(--dsw-alias-label-tertiary);background:color-mix(in srgb,var(--dsw-specific-menu) 85%,transparent);border-radius:8px;padding:3px 8px;font-size:12px;line-height:16px;opacity:.9}\n";

		// Locale detection. Prefer navigator.language: the dsh web shell hard-codes
		// <html lang="en"> in its index.html, so documentElement.lang can NEVER tell
		// a Chinese UI apart from an English one. navigator.language reflects the
		// user's browser language (zh-CN for Chinese users); fall back to the html
		// attribute only when the browser API is unavailable (e.g. tests).
		var LANG = (typeof navigator !== "undefined" && navigator.language ? navigator.language : (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
		var STR = {
			zh: {
				empty: "暂无历史记录", loading: "正在加载…", error: "加载失败,请稍后重试",
				cmdName: "history", cmdDesc: "浏览本会话发送过的消息并选回输入框",
				searchPh: "搜索…", panelAria: "输入历史列表"
			},
			en: {
				empty: "No history yet", loading: "Loading…", error: "Failed to load. Please try again.",
				cmdName: "history", cmdDesc: "Browse messages sent in this session and recall one into the composer",
				searchPh: "Search…", panelAria: "Input history list"
			}
		};
		function S(k) { var d = STR[LANG] || STR.en; return d[k] != null ? d[k] : STR.en[k]; }

		/** Optional host handles, resolved lazily in their own fiber. */
		var HostServices = { remoteSession: null, conversation: null };

		/** Concatenate plain-text blocks of a host session-log event's content. */
		function textOfBlocks(blocks) {
			if (!Array.isArray(blocks)) return "";
			var out = "";
			for (var i = 0; i < blocks.length; i++) {
				var b = blocks[i];
				if (b && b.type === "text" && typeof b.text === "string") out += b.text;
			}
			return out;
		}

		/**
		 * Read the FULL set of user-sent messages of one session from the host
		 * session event log, walking every page backwards (newest first) until
		 * hasMore is false. The host log is the complete, durable conversation
		 * record (the browser chat window only covers what "加载更早" loaded).
		 *
		 * Error policy: a real RPC failure (follow/page throws or returns a
		 * failed result) REJECTS so callers can surface a distinct error phase;
		 * an aborted request (signal fired) resolves with what was collected so
		 * far — cancellation is not an error. Hitting the 300-page guard while
		 * history still reports more pages also rejects (data would be partial).
		 */
		async function pageAllUserMessages(remoteSession, sessionId, signal) {
			var bySeq = [];
			var seenSeq = new Set();
			var throughSeq = -1;
			var beforeSeq;
			var firstPage = true;
			var guard = 0;
			for (guard = 1; guard <= 300; guard++) {
				if (signal && signal.aborted) return dedupeReverse(bySeq);
				var records;
				var hasMore = false;
				if (firstPage) {
					firstPage = false;
					var opened = false;
					var openedError = null;
					try {
						var stream = remoteSession.follow({
							address: { kind: "session", sessionId: sessionId },
							maxMessages: 200
						}, signal);
						for await (var frame of stream) {
							if (frame && frame.type === "snapshot") {
								if (typeof frame.cursor === "number") throughSeq = frame.cursor;
								records = frame.records || [];
								hasMore = frame.hasMore === true;
								opened = true;
								break;
							}
						}
					} catch (e) {
						if (signal && signal.aborted) return dedupeReverse(bySeq);
						openedError = e;
					}
					if (!opened) {
						if (openedError) throw openedError;
						break; // stream ended without a snapshot: treat as end of history
					}
				} else {
					var req = {
						address: { kind: "session", sessionId: sessionId },
						throughSeq: throughSeq,
						maxMessages: 200
					};
					if (beforeSeq !== void 0) req.beforeSeq = beforeSeq;
					var result;
					try {
						result = await remoteSession.page(req, signal);
					} catch (e) {
						if (signal && signal.aborted) return dedupeReverse(bySeq);
						throw e;
					}
					if (!result || result.ok !== true || !result.value) {
						throw new Error("session-log page failed: " + (result && result.error ? (result.error.message || String(result.error)) : "no result"));
					}
					records = result.value.records || [];
					hasMore = result.value.hasMore === true;
				}
				var pageMinSeq = -1;
				for (var i = 0; i < records.length; i++) {
					var rec = records[i];
					if (!rec || rec.type !== "event") continue;
					var ev = rec.event;
					if (!ev || typeof ev.seq !== "number") continue;
					if (pageMinSeq < 0 || ev.seq < pageMinSeq) pageMinSeq = ev.seq;
					if (ev.type !== "user/message") continue;
					var data = ev.data;
					if (!data || !data.source || data.source.kind !== "user") continue;
					var text = textOfBlocks(data.content);
					if (text.trim().length === 0) continue;
					if (seenSeq.has(ev.seq)) continue;
					seenSeq.add(ev.seq);
					bySeq.push({ seq: ev.seq, text: text, time: typeof ev.time === "number" ? ev.time : 0 });
				}
				if (!hasMore) break;
				if (pageMinSeq < 0) break;
				if (guard >= 300) {
					throw new Error("session-log walk exceeded the 300-page guard (history still reporting more pages)");
				}
				beforeSeq = pageMinSeq;
			}
			return dedupeReverse(bySeq);
		}
		/** Sort newest-last by seq, drop consecutive-duplicate texts, newest-first. */
		function dedupeReverse(bySeq) {
			bySeq.sort(function (a, b) { return a.seq - b.seq; });
			var out = [];
			var lastText = "";
			for (var k = 0; k < bySeq.length; k++) {
				var row = bySeq[k];
				var t = row.text.trim();
				if (t === lastText) continue;
				lastText = t;
				out.push(row);
			}
			out.reverse();
			return out;
		}

		function pad2(n) { return n < 10 ? "0" + n : "" + n; }
		function timeLabel(t) { var d = new Date(t); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }

		/** Case-insensitive substring over label + detail; blank query keeps all rows. */
		function filterRows(options, search) {
			var query = (search || "").trim().toLowerCase();
			if (query === "") return options;
			return options.filter(function (o) {
				return (o.label || "").toLowerCase().indexOf(query) >= 0 || ((o.detail || "").toLowerCase().indexOf(query) >= 0);
			});
		}

		/** The shared open-panel store. `index` is THE highlight index. */
		var HistoryStore = (function () {
			var state = {
				open: false,
				index: 0,
				savedDraft: "",
				mode: "replace", // "replace" (bare /history) | "insert" (/history menu pick)
				prefix: "",
				suffix: "",
				sessionId: null,
				phase: "idle",
				rows: []
			};
			var subs = [];
			function subscribe(fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
			function emit() { for (var i = 0; i < subs.length; i++) subs[i](); }
			return { subscribe: subscribe, get: function () { return state; }, set: function (patch) { state = Object.assign({}, state, patch); emit(); } };
		})();

		/** Cached full history rows (newest first) shared by the panel and the
		 *  terminal-style arrow walk. `rows` is an array of {id,label,detail};
		 *  null means "not loaded / no history". */
		var HistoryCache = { sessionId: null, rows: null, loading: false };

		/** Single-flight full-history loader state, keyed per session. A session
		 *  that is already loading shares ONE fetch; a DIFFERENT session starting
		 *  its own load gets its own entry and can never clobber (and strand) the
		 *  in-flight session's waiters — losing them would leave an active arrow
		 *  walk stuck at waiting=true with all ↑/↓ dead. */
		var HistoryLoad = new Map(); // sessionId -> { cbs: Array<fn> } while fetching

		/** Terminal-style arrow history state. Lives outside React so the capture
		 *  keydown handler can read/write it between renders without re-renders:
		 *  cursor -1 = the user's original draft; 0..n = history rows (newest 0). */
		var ArrowWalk = {
			active: false,
			sessionId: null,
			rows: [],
			cursor: -1,
			origin: "",
			waiting: false
		};

		/** Map raw pager items ({seq,text,time}) to display rows ({id,label,detail}). */
		function toDisplayRows(items) {
			var out = [];
			for (var i = 0; i < items.length; i++) {
				var it = items[i];
				out.push({
					id: "ih-" + i,
					label: it.text,
					detail: it.time ? timeLabel(it.time) : undefined
				});
			}
			return out;
		}

		/** Write text into the session composer via the conversation shell. */
		function setComposerDraft(sessionId, text) {
			var conv = HostServices.conversation;
			if (!sessionId || !conv || !conv.input || typeof conv.input.shell !== "function") return false;
			try {
				var shell = conv.input.shell(sessionId);
				if (shell && shell.actions && typeof shell.actions.setDraft === "function") {
					shell.actions.setDraft(text);
					return true;
				}
			} catch (e) { /* shell not ready for this session */ }
			return false;
		}

		/** Load the full log for a session into the store (insert-mode panel path).
		 *  Failures are NOT conflated with "no history": a real RPC error sets
		 *  phase "error" so the UI can say so, and logs a warning for triage. */
		function loadSessionRows(sessionId) {
			HistoryStore.set({ sessionId: sessionId, phase: "loading", rows: [] });
			var rs = HostServices.remoteSession;
			if (!sessionId || !rs || typeof rs.follow !== "function" || typeof rs.page !== "function") {
				console.warn("[input-history] host session-log service unavailable");
				HistoryStore.set({ phase: "error", rows: [] });
				return;
			}
			pageAllUserMessages(rs, sessionId).then(function (items) {
				if (HistoryStore.get().sessionId !== sessionId) return;
				if (items.length === 0) {
					HistoryStore.set({ phase: "empty", rows: [] });
					return;
				}
				HistoryStore.set({ phase: "ready", rows: toDisplayRows(items), index: 0 });
			}, function (err) {
				if (HistoryStore.get().sessionId !== sessionId) return;
				console.warn("[input-history] failed to load session rows", err);
				HistoryStore.set({ phase: "error", rows: [] });
			});
		}

		/** Single-flight full history load for one session. Multiple callers
		 *  (the slash panel and the arrow walk) share one fetch; every waiter
		 *  receives the prepared row list (never null — empty array = no rows).
		 *
		 *  Waiters are tracked PER SESSION: a load that starts for another
		 *  session while this one is in flight gets its own entry instead of
		 *  overwriting this session's waiter list. Overwriting used to strand
		 *  the earlier session's callbacks — an arrow walk whose rows never
		 *  arrived stayed stuck at waiting=true and every later ↑/↓ was dead.
		 *
		 *  Callback contract: cb(rows) on success; cb([], err) on failure (err is
		 *  an Error). Failures are logged once here so walk/panel callers can
		 *  surface an error state instead of a misleading "no history". */
		function loadFullHistory(sessionId, cb) {
			if (!sessionId) { cb([]); return; }
			var rs = HostServices.remoteSession;
			if (!rs || typeof rs.follow !== "function" || typeof rs.page !== "function") {
				var svcErr = new Error("host session-log service unavailable");
				console.warn("[input-history] load failed", svcErr);
				cb([], svcErr);
				return;
			}
			var entry = HistoryLoad.get(sessionId);
			if (entry) {
				entry.cbs.push(cb); // same session still loading: join its fetch
				return;
			}
			entry = { cbs: [cb] };
			HistoryLoad.set(sessionId, entry);
			pageAllUserMessages(rs, sessionId).then(function (items) {
				finish(sessionId, entry, toDisplayRows(items));
			}, function (err) {
				console.warn("[input-history] load failed for " + sessionId, err);
				finish(sessionId, entry, [], err);
			});
		}
		function finish(sid, entry, rows, err) {
			if (HistoryLoad.get(sid) !== entry) return; // superseded (defensive; not expected)
			HistoryLoad.delete(sid);
			if (!err && HistoryCache.sessionId === sid) HistoryCache.rows = rows;
			var cbs = entry.cbs;
			for (var j = 0; j < cbs.length; j++) cbs[j](rows, err);
		}

		/** Synchronous rows snapshot for one session (uses the cache when warm). */
		function cachedHistoryRows(sessionId) {
			if (HistoryCache.sessionId === sessionId && HistoryCache.rows) return HistoryCache.rows;
			return null;
		}

		/** Test-only escape hatch (active only when __DSH_IH_TEST__ is set, so
		 *  production bundles never expose it). Gives the functional-check a
		 *  direct handle on the closure-private loader + store. */
		if (typeof globalThis !== "undefined" && globalThis.__DSH_IH_TEST__) {
			globalThis.__DSH_IH_TEST__ = {
				loadFullHistory: loadFullHistory,
				cachedHistoryRows: cachedHistoryRows,
				HistoryStore: HistoryStore,
				HistoryLoad: HistoryLoad,
				HistoryCache: HistoryCache,
				ArrowWalk: ArrowWalk,
				startArrowWalk: startArrowWalk
			};
		}

		/** Open the panel (menu pick / bare enter). Arrow walks never open it. */
		function openHistoryPanel(sessionId, opts) {
			if (!sessionId) return;
			opts = opts || {};
			var clearComposer = !!opts.clearComposer;
			var savedDraft = opts.savedDraft || "";
			var mode = opts.mode || "replace";
			var prefix = opts.prefix || "";
			var suffix = opts.suffix || "";
			// /history menu-pick open (keep savedDraft)
			if (mode === "insert") {
				lastKeyMoveAt = Date.now();
				HistoryStore.set({
					open: true,
					index: 0,
					savedDraft: savedDraft,
					mode: mode,
					prefix: prefix,
					suffix: suffix,
					sessionId: sessionId,
					phase: "loading",
					rows: []
				});
				loadSessionRows(sessionId);
				return;
			}
			// All other opens: clear composer + load fresh rows via the shared loader.
			lastKeyMoveAt = Date.now();
			HistoryStore.set({
				open: true,
				index: 0,
				savedDraft: savedDraft,
				mode: mode,
				prefix: prefix,
				suffix: suffix,
				sessionId: sessionId,
				phase: "loading",
				rows: []
			});
			HistoryCache.sessionId = sessionId;
			HistoryCache.rows = null; // invalidate; panel reads its own fresh rows
			if (clearComposer) setComposerDraft(sessionId, "");
			loadFullHistory(sessionId, function (rows, err) {
				if (HistoryStore.get().sessionId !== sessionId || HistoryStore.get().open !== true) return;
				if (err) { HistoryStore.set({ phase: "error", rows: [] }); return; }
				HistoryStore.set(rows.length === 0 ? { phase: "empty", rows: [] } : { phase: "ready", rows: rows, index: 0 });
			});
		}

		/** Close and return focus to the composer. Esc restores the saved draft. */
		function closePanel(restoreSaved) {
			var snapshot = HistoryStore.get();
			if (restoreSaved && snapshot.savedDraft && snapshot.sessionId) {
				setComposerDraft(snapshot.sessionId, snapshot.savedDraft);
			}
			HistoryStore.set({ open: false, index: 0, savedDraft: "", mode: "replace", prefix: "", suffix: "", sessionId: null, phase: "idle", rows: [] });
			var cardEl = typeof document !== "undefined" && document.querySelector ? document.querySelector("[data-composer-card]") : null;
			if (cardEl) {
				var inputEl = cardEl.querySelector("[data-composer-input]");
				if (inputEl && typeof inputEl.focus === "function") inputEl.focus({ preventScroll: true });
			}
		}

		/** Current open-panel root (module mirror, kept fresh by the component). */
		var PanelRoot = null;

		/** The composer's live draft mirror (arrow-walk origin + menu split). */
		var RuntimeDraft = { value: "" };

		/** The live draft minus a single command-token span (menu-pick path).
		 *  prefix = draft before the token, suffix = draft after the token;
		 *  restoring prefix+suffix returns the draft WITHOUT the /history text,
		 *  and inserting a recall between them keeps surrounding content intact. */
		function splitAtToken(draft, span) {
			if (!draft) return { prefix: "", suffix: "" };
			var s = span && typeof span.start === "number" ? span.start : draft.length;
			var e = span && typeof span.end === "number" ? span.end : draft.length;
			if (s < 0) s = 0;
			if (e < s) e = s;
			if (e > draft.length) e = draft.length;
			if (s > draft.length) s = draft.length;
			return { prefix: draft.slice(0, s), suffix: draft.slice(e) };
		}

		/** The live draft minus the trailing "/history" command line. The trigger
		 *  entry paths (menu pick / bare enter) clear the composer to remove the
		 *  command text; this keeps whatever the user had typed BEFORE the
		 *  command so Esc can restore it instead of losing it forever. */
		function commandlessDraft(draft) {
			var cmd = "/" + S("cmdName");
			if (!draft) return "";
			var lines = draft.split("\n");
			for (var i = lines.length - 1; i >= 0; i--) {
				if (lines[i].trim() === cmd) {
					lines.splice(i, 1);
					return lines.join("\n");
				}
			}
			return draft; // command text already gone (e.g. menu outcome removed it)
		}

		/**
		 * Hover/keyboard arbitration. The official shell highlights a row on ANY
		 * mouseenter; when ↑/↓ hit the top/bottom the viewport auto-scrolls and
		 * rows that slide under a STATIONARY cursor fire mouseenter without any
		 * real pointer move — that is exactly the official "highlight jumps to
		 * the mouse" bug we are here to fix. The mouse may drive the highlight
		 * only after a genuine pointer move that happened AFTER the latest
		 * keyboard move; scroll-/layout-induced enters carry no mousemove and
		 * are ignored.
		 */
		var lastKeyMoveAt = 0;
		var lastPointerMoveAt = 0;

		/** Official useAnchoredMaxHeight: cap at MAX, leave 12px below the viewport. */
		function anchoredMaxHeight(menuEl) {
			if (!menuEl) return 320;
			var top = menuEl.getBoundingClientRect().top;
			var available = (typeof window !== "undefined" ? window.innerHeight : 0) - top - 12;
			return Math.max(0, Math.min(320, available));
		}

		/** True when another overlay (trigger menu / official shell) is open above us. */
		function externalOverlayOpen(card) {
			if (!card) return false;
			var anchor = card.querySelector('[data-slot="conversation.input.overlay"]');
			if (!anchor) return false;
			for (var i = 0; i < anchor.children.length; i++) {
				var child = anchor.children[i];
				// Our own menu (child may BE the root, or contain it).
				if (child === PanelRoot || (child.classList && child.classList.contains("dsh-ih-menu")) || child.querySelector(".dsh-ih-menu")) continue;
				if (child.querySelector('[role="listbox"], [role="dialog"], input')) return true;
			}
			return false;
		}

		/** Terminal-style arrow walk. `dir` -1 = older, 1 = newer. While rows are
		 *  still loading further presses are ignored (one pending step applied on
		 *  arrival). Rows are newest-first; cursor -1 = the user's original draft,
		 *  0 = newest sent message, length-1 = oldest. */
		function walkHistory(dir) {
			var sid = ArrowWalk.sessionId;
			if (!sid || ArrowWalk.waiting) return;
			var rows = ArrowWalk.rows.length > 0 ? ArrowWalk.rows : cachedHistoryRows(sid);
			if (rows && rows.length === 0) {
				// Session has no history yet: no-op and leave walk mode so the
				// composer stays a normal editor.
				exitArrowWalk();
				return;
			}
			if (rows) { stepHistory(dir, rows); return; }
			ArrowWalk.waiting = true;
			HistoryStore.set({ statusText: S("loading") });
			loadFullHistory(sid, function (loaded, err) {
				if (ArrowWalk.sessionId !== sid) return;
				if (err) {
					// Load failed: leave walk mode with the draft untouched (the
					// loader already logged the error). A silent stuck walk would
					// leave every later ↑/↓ dead.
					exitArrowWalk();
					return;
				}
				ArrowWalk.waiting = false;
				HistoryStore.set({ statusText: undefined });
				if (loaded.length === 0) {
					// No history to browse: leave walk mode with the draft untouched.
					exitArrowWalk();
					return;
				}
				ArrowWalk.rows = loaded;
				stepHistory(dir, loaded);
			});
		}

		/** Apply one cursor step over `rows` (newest-first). */
		function stepHistory(dir, rows) {
			var sid = ArrowWalk.sessionId;
			if (!sid) return;
			var cursor = ArrowWalk.cursor;
			if (dir < 0) {
				// older: -1 → 0 (newest), …; stop at the oldest row.
				if (cursor === rows.length - 1) return;
				var older = cursor + 1;
				ArrowWalk.cursor = older;
				setComposerDraft(sid, rows[older].label);
				return;
			}
			// newer: toward -1 (the user's original draft); stop there.
			if (cursor === -1) return;
			if (cursor === 0) {
				ArrowWalk.cursor = -1;
				setComposerDraft(sid, ArrowWalk.origin);
				// Back at the draft the walk started from: leave walk mode so the
				// composer behaves like a normal editor again.
				exitArrowWalk();
				return;
			}
			var newer = cursor - 1;
			ArrowWalk.cursor = newer;
			setComposerDraft(sid, rows[newer].label);
		}

		/** Enter walk mode at the current draft (origin) and take the first step. */
		function startArrowWalk(sessionId) {
			if (!sessionId) return;
			// The shared cache must never leak another session's rows into this
			// walk: cachedHistoryRows() hits only when the cached sessionId
			// matches, so starting a walk in a DIFFERENT session must clear the
			// stale rows — otherwise the previous session's history is recalled
			// into this composer. Same-session repeats keep the warm cache.
			if (HistoryCache.sessionId !== sessionId) {
				HistoryCache.sessionId = sessionId;
				HistoryCache.rows = null;
			}
			ArrowWalk.active = true;
			ArrowWalk.sessionId = sessionId;
			ArrowWalk.origin = RuntimeDraft.value || "";
			ArrowWalk.cursor = -1;
			ArrowWalk.waiting = false;
			ArrowWalk.rows = [];
			walkHistory(-1);
		}

		/** Leave walk mode, keeping whatever text is currently in the composer. */
		function exitArrowWalk() {
			if (!ArrowWalk.active && !ArrowWalk.waiting) return;
			ArrowWalk.active = false;
			ArrowWalk.sessionId = null;
			ArrowWalk.rows = [];
			ArrowWalk.cursor = -1;
			ArrowWalk.origin = "";
			ArrowWalk.waiting = false;
			HistoryStore.set({ statusText: undefined });
		}

		/** Esc during a walk: restore the draft the walk started from, then exit. */
		function escapeArrowWalk() {
			var sid = ArrowWalk.sessionId;
			var origin = ArrowWalk.origin;
			exitArrowWalk();
			if (sid) setComposerDraft(sid, origin);
		}

		/** True for keys that only move the caret / change selection and never
		 *  modify the draft text. While an arrow walk is active these keys must
		 *  NOT exit the walk (the origin draft stays recoverable); only keys
		 *  that actually start editing or leave the composer do. */
		function isCaretNavigationKey(e) {
			switch (e.key) {
				case "ArrowUp":
				case "ArrowDown":
				case "ArrowLeft":
				case "ArrowRight":
				case "Home":
				case "End":
				case "PageUp":
				case "PageDown":
					return true;
			}
			return false;
		}

		function HistoryOverlay(props) {
			var sessionId = props.sessionId || null;
			var useInput = props.useInput;
			var inputState = typeof useInput === "function" ? useInput((s) => s ? s : null) : null;
			var liveDraft = inputState ? inputState.draft : "";
			var store = react.useSyncExternalStore(HistoryStore.subscribe, HistoryStore.get);
			var menuRef = react.useRef(null);
			var searchRef = react.useRef(null);
			var [searchText, setSearchText] = react.useState("");

			var open = store.open;
			var index = store.index;
			var rows = store.rows;
			var status = store.phase;
			var activeSession = store.sessionId || sessionId;
			var filtered = react.useMemo(function () { return filterRows(rows, searchText); }, [rows, searchText]);
			var [maxHeight, setMaxHeight] = react.useState(320);

			// Keep the composer draft mirrored (arrow-walk origin + menu split).
			RuntimeDraft.value = liveDraft;

			// Keep the module root mirror for external-overlay detection (fresh
			// once the panel DOM mounts / unmounts).
			react.useEffect(function () {
				PanelRoot = menuRef.current;
				return function () { if (PanelRoot === menuRef.current) PanelRoot = null; };
			});

			// Official useAnchoredMaxHeight: dynamic clamp on open + resize/scroll.
			react.useLayoutEffect(function () {
				if (!open) return;
				function update() {
					if (menuRef.current) setMaxHeight(anchoredMaxHeight(menuRef.current));
				}
				update();
				window.addEventListener("resize", update);
				window.addEventListener("scroll", update, true);
				return function () {
					window.removeEventListener("resize", update);
					window.removeEventListener("scroll", update, true);
				};
			}, [open, filtered]);

			// Reset + focus search on open.
			react.useEffect(function () {
				if (!open) return;
				setSearchText("");
				var t = setTimeout(function () {
					if (searchRef.current) searchRef.current.focus({ preventScroll: true });
				}, 0);
				return function () { clearTimeout(t); };
			}, [open]);

			// Scroll the active row into view.
			react.useEffect(function () {
				if (!open || !menuRef.current) return;
				var activeEl = menuRef.current.querySelector(".dsh-ih-rowActive");
				if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ block: "nearest" });
			}, [open, index, filtered]);

			// Keep the mouse state needed by the hover arbitration: track genuine
			// pointer moves only while this panel is the one open on screen.
			react.useEffect(function () {
				if (!open) return;
				function onPointerMove() { lastPointerMoveAt = Date.now(); }
				document.addEventListener("pointermove", onPointerMove, true);
				return function () { document.removeEventListener("pointermove", onPointerMove, true); };
			}, [open]);

			/** Highlight to the hovered row, but never to a scroll-steered enter. */
			function hoverIndex(rowEl) {
				var idx = Number(rowEl.getAttribute("data-index"));
				if (isNaN(idx)) return;
				if (lastKeyMoveAt > lastPointerMoveAt) return; // stale hover; keyboard owns the highlight
				HistoryStore.set({ index: idx, open: true });
			}

			function moveIndex(dir) {
				if (filtered.length === 0) return;
				var next = (index + dir + filtered.length) % filtered.length;
				lastKeyMoveAt = Date.now();
				HistoryStore.set({ index: next, open: true });
			}
			/** Write the picked row into the composer: replace, or insert at the
			 *  /history token position (menu-pick path keeps surrounding text). */
			function applyItem(item) {
				if (!activeSession || !item) return;
				var snapshot = HistoryStore.get();
				if (snapshot.mode === "insert") {
					setComposerDraft(activeSession, snapshot.prefix + item.label + snapshot.suffix);
				} else {
					setComposerDraft(activeSession, item.label);
				}
				closePanel(false);
			}
			function accept() {
				if (filtered.length === 0) return;
				var picked = filtered[Math.min(index, filtered.length - 1)] || filtered[0];
				applyItem(picked);
			}
			function cancel() {
				closePanel(true);
			}

			// Keyboard. While the popup panel is open: ↑/↓/Enter/Esc drive the
			// single highlight. While closed: only the composer's contenteditable
			// receives our arrows. At a caret boundary (empty draft, first char
			// for ↑, last char for ↓) the arrows recall history TERMINAL-STYLE:
			// the draft is directly replaced with the newest sent message, ↑ walks
			// older, ↓ walks newer and finally back to the draft the walk started
			// from. Between boundary steps the editor keeps its native caret
			// movement; once the walk has replaced the draft, repeated boundary
			// arrows keep walking the same history.
			react.useEffect(function () {
				var handlerActive = false;
				function onKeyDown(e) {
					if (e.ctrlKey || e.metaKey || e.altKey) return;
					if (e.isComposing || e.keyCode === 229) return;
					var el = e.target;
					var card = el instanceof Element && el.closest ? el.closest("[data-composer-card]") : null;
					var inputEl = card ? card.querySelector("[data-composer-input]") : null;
					if (externalOverlayOpen(card)) return;
					if (open) {
						if (el !== document.body && !(card && card.contains(el))) return;
						if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); moveIndex(-1); return; }
						if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); moveIndex(1); return; }
						if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); accept(); return; }
						if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); return; }
						return;
					}
					if (!inputEl) return;
					var sid = activeSession || sessionId;
					// A walk belongs to one session; typing in another session's
					// composer must not be steered by stale walk state.
					if (ArrowWalk.active && ArrowWalk.sessionId !== sid) exitArrowWalk();
					// While walking, Esc leaves and restores the origin draft.
					if (ArrowWalk.active && e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						escapeArrowWalk();
						return;
					}
					// Once walk mode is active ↑/↓ walk history from ANY caret
					// position (terminal feel). Pure caret-navigation keys
					// (←/→/Home/End/PageUp/PageDown) move the caret WITHOUT
					// leaving the walk, so the origin draft stays recoverable
					// via ↓; anything else (typing, deleting, Enter, Tab…) exits
					// the walk and the current text becomes a normal draft.
					if (ArrowWalk.active && e.key === "ArrowUp") {
						e.preventDefault();
						e.stopPropagation();
						walkHistory(-1);
						return;
					}
					if (ArrowWalk.active && e.key === "ArrowDown") {
						e.preventDefault();
						e.stopPropagation();
						walkHistory(1);
						return;
					}
					if (ArrowWalk.active && !isCaretNavigationKey(e)) {
						exitArrowWalk();
					}
					if (e.key === "ArrowUp" || e.key === "ArrowDown") {
						var atStart = caretAtBoundary(inputEl, true);
						var atEnd = caretAtBoundary(inputEl, false);
						if (e.key === "ArrowUp" && atStart) {
							// 句首 ↑ → walk older (recall newest sent message).
							e.preventDefault();
							e.stopPropagation();
							startArrowWalk(sid);
						} else if (e.key === "ArrowDown" && atEnd) {
							// 句尾 ↓ → walk newer. From a fresh draft (not yet
							// walking) there is nothing newer, so this is a no-op;
							// during an active walk ↓ moves back toward the origin.
							e.preventDefault();
							e.stopPropagation();
							if (!ArrowWalk.active) {
								// Nothing newer than the current draft: do nothing.
								return;
							}
							walkHistory(1);
						}
					}
				}
				document.addEventListener("keydown", onKeyDown, true);
				return function () { document.removeEventListener("keydown", onKeyDown, true); };
			}, [open, index, filtered, activeSession, sessionId, status, rows, liveDraft]);

			// Dismiss on outside pointer-down.
			react.useEffect(function () {
				if (!open) return;
				function onPointerDown(e) {
					var el = e.target;
					if (el && el.closest && el.closest(".dsh-ih-menu")) return;
					cancel();
				}
				document.addEventListener("pointerdown", onPointerDown, true);
				return function () { document.removeEventListener("pointerdown", onPointerDown, true); };
			}, [open]);

			if (!open) {
				// Terminal walk feedback: a small non-interactive pill appears
				// only while the walk is loading rows, so the first ↑ doesn't
				// feel silent. (No panel/list is shown during the walk.)
				if (store.statusText === undefined) return null;
				return react.createElement("div", {
					className: "dsh-ih-walkstatus",
					style: {
						position: "absolute",
						right: "6px",
						bottom: "calc(100% + 2px)",
						zIndex: 95,
						pointerEvents: "none",
						color: "var(--dsw-alias-label-tertiary, #9a9aa5)",
						background: "var(--dsw-specific-menu, rgba(20,20,24,.9))",
						borderRadius: "8px",
						padding: "3px 8px",
						fontSize: "12px",
						lineHeight: "16px",
						opacity: 0.9
					}
				}, store.statusText);
			}

			var body;
			if (status === "loading") {
				body = react.createElement("div", { className: "dsh-ih-status" }, S("loading"));
			} else if (status === "error") {
				// Distinguish a real load failure from "no history yet" so the user
				// is not told to believe a broken RPC means an empty session.
				body = react.createElement("div", { className: "dsh-ih-status" }, S("error"));
			} else if (status === "empty" || filtered.length === 0) {
				body = react.createElement("div", { className: "dsh-ih-status" }, S("empty"));
			} else {
				var shownIndex = index < filtered.length ? index : filtered.length - 1;
				var items = [];
				for (var i = 0; i < filtered.length; i++) {
					// const per iteration: the row callbacks close over `item`, so the
					// binding must belong to each row. A function-scoped var would make
					// every mouse click apply the LAST filtered row (classic loop trap).
					const item = filtered[i];
					const active = i === shownIndex;
					items.push(react.createElement("div", {
						key: item.id,
						role: "option",
						"aria-selected": active,
						className: "dsh-ih-row" + (active ? " dsh-ih-rowActive" : ""),
						onMouseEnter: function (ev) {
							hoverIndex(ev.currentTarget);
						},
						onMouseDown: function (ev) {
							ev.preventDefault();
							ev.stopPropagation();
							applyItem(item);
						},
						"data-index": i
					},
						react.createElement("span", { className: "dsh-ih-label", title: item.label }, item.label),
						item.detail ? react.createElement("span", { className: "dsh-ih-detail" }, item.detail) : null
					));
				}
				body = react.createElement("div", { className: "dsh-ih-viewport", role: "listbox", "aria-label": S("panelAria") }, items);
			}

			return react.createElement("div", {
				ref: menuRef,
				className: "dsh-ih-menu",
				role: "listbox",
				"aria-label": S("panelAria"),
				style: { maxHeight: maxHeight },
				onKeyDown: function (e) {
					// The document-capture handler already drives the highlight; this
					// local stop keeps the event from ALSO scrolling/bubbling after a
					// selection (mirror of the official shell's local handling).
					if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter" || e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
					}
				}
			},
				react.createElement("input", {
					ref: searchRef,
					className: "dsh-ih-search",
					type: "text",
					placeholder: S("searchPh"),
					"aria-label": S("searchPh"),
					value: searchText,
					onChange: function (ev) {
						setSearchText(ev.currentTarget.value);
						lastKeyMoveAt = Date.now(); // typing is keyboard-driven; ignore scroll-steered hovers
						HistoryStore.set({ index: 0, open: true });
					}
				}),
				body
			);
		}

		/**
		 * The caret boundary test for the contenteditable composer. There is no
		 * selection API on the shell surface, so the boundary is derived from the
		 * live DOM selection.
		 *
		 * The composer is a Lexical contenteditable whose text lives inside
		 * paragraph elements (<p>…</p>). Comparing the caret anchor against the
		 * WHOLE div (`selectNodeContents(inputEl)`) is wrong: the caret sits in a
		 * #text node, and the div boundary is one element-boundary past the last
		 * text — so a caret at the true first/last character never compares equal
		 * and ↑/↓ never fire. Boundaries must be derived from the first/last TEXT
		 * node of the content instead:
		 *   - atStart → caret equals (firstText, 0)
		 *   - atEnd   → caret equals (lastText, lastText.length)
		 * Empty content (no text nodes at all) has exactly one caret position, so
		 * both directions count as "at the boundary". Leading/trailing empty
		 * paragraphs (<p><br></p>) contain no text; when the caret sits in such a
		 * paragraph and no further text exists in that direction, it is also at
		 * the boundary.
		 */
		function caretAtBoundary(inputEl, atStart) {
			var sel = typeof window !== "undefined" && window.getSelection ? window.getSelection() : null;
			if (!sel || sel.rangeCount === 0 || sel.isCollapsed === false) return false;
			if (!sel.anchorNode || !inputEl.contains(sel.anchorNode)) return false;
			var textNodes = [];
			{
				var walker = document.createTreeWalker(inputEl, NodeFilter.SHOW_TEXT);
				while (walker.nextNode()) textNodes.push(walker.currentNode);
			}
			var firstText = textNodes.length > 0 ? textNodes[0] : null;
			var lastText = textNodes.length > 0 ? textNodes[textNodes.length - 1] : null;
			var probe = document.createRange();
			try {
				probe.setStart(sel.anchorNode, sel.anchorOffset);
				probe.collapse(true);
			} catch (e) { return false; }
			if (atStart) {
				if (firstText === null) return true; // empty content
				if (probe.compareBoundaryPoints(Range.START_TO_START, caretAt(firstText, 0)) === 0) return true;
				// No text before the caret: leading empty paragraph(s).
				return !hasTextBefore(inputEl, sel.anchorNode);
			}
			if (lastText === null) return true; // empty content
			if (probe.compareBoundaryPoints(Range.END_TO_END, caretAt(lastText, lastText.data.length)) === 0) return true;
			// No text after the caret: trailing empty paragraph(s).
			return !hasTextAfter(inputEl, sel.anchorNode);
		}

		/** A collapsed range at one text-node offset (reused for comparisons). */
		function caretAt(node, offset) {
			var r = document.createRange();
			r.setStart(node, offset);
			r.collapse(true);
			return r;
		}

		/** True when any text node appears before (or is) the anchor node. */
		function hasTextBefore(root, anchor) {
			var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				var t = walker.currentNode;
				// anchor follows t → t lies before the caret.
				if (t === anchor || t.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) return true;
			}
			return false;
		}

		/** True when any text node appears after (or is) the anchor node. */
		function hasTextAfter(root, anchor) {
			var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				var t = walker.currentNode;
				// anchor precedes t → t lies after the caret.
				if (t === anchor || t.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING) return true;
			}
			return false;
		}

		var inject = ["slots", "inputTriggers"];

		function apply(ctx) {
			var slots = ctx.slots;
			var style = document.createElement("style");
			style.setAttribute("data-plugin", PKG_NAME);
			style.textContent = CSS;
			document.head.appendChild(style);
			ctx.effect(function () { return function () { style.remove(); }; });

			// History dropdown (official-shell lookalike) in the composer overlay.
			ctx.effect(function () {
				return slots.inject("conversation.input.overlay", function () {
					return slots.register({
						name: "conversation.input.overlay",
						id: "input-history-panel",
						order: 2,
						inject: function (sessionId) {
							return { sessionId: sessionId };
						}
					}, HistoryOverlay);
				});
			});

			// Optional host services (full-log history reads + composer recall).
			ctx.inject(["remote", "remote.session", "conversation"], function (hctx) {
				HostServices.remoteSession = hctx.get("remote.session");
				HostServices.conversation = hctx.get("conversation");
			});

			// /history input-trigger source: our own '/' source; opens OUR panel.
			ctx.inject(["inputTriggers"], function (sctx) {
				var triggers = sctx.get("inputTriggers");
				if (!triggers || typeof triggers.registerSource !== "function") return;
				sctx.effect(function () {
					return triggers.registerSource({
						trigger: "/",
						name: "input-history",
						order: 90,
						showGroupTitle: false,
						candidates: function (session, req) {
							var query = (req && req.query ? req.query : "").trim().toLowerCase();
							var name = S("cmdName").toLowerCase();
							// Only offer the row while the typed query still matches
							// the command name (blank query = just typed '/', offer it).
							if (query !== "" && name.indexOf(query) !== 0) return Promise.resolve([]);
							return Promise.resolve([{
								name: S("cmdName"),
								description: S("cmdDesc")
							}]);
						},
						onPick: function (pick) {
							if (!pick || !pick.candidate || pick.candidate.name !== S("cmdName")) return void 0;
							if (pick.via !== "menu") return void 0;
							var sid = pick.session ? pick.session.sessionId : null;
							// Menu path = INSERT mode. Do NOT rewrite the composer here:
							// returning {text:""} makes the official pipeline replace only
							// the /history token span with "", leaving prefix/suffix intact
							// (and the span CAS requires the draft revision unchanged).
							var split = splitAtToken(RuntimeDraft.value, pick.span);
							openHistoryPanel(sid, {
								clearComposer: false,
								savedDraft: split.prefix + split.suffix,
								mode: "insert",
								prefix: split.prefix,
								suffix: split.suffix
							});
							return { text: "" };
						},
						matchEnter: function (session, line, signal, envelope) {
							if (envelope && envelope.images > 0) {
								throw new Error("/" + S("cmdName") + " does not accept image attachments; remove them first");
							}
							if (line.trim() !== "/" + S("cmdName")) return void 0;
							openHistoryPanel(session ? session.sessionId : null, {
								clearComposer: true,
								savedDraft: commandlessDraft(line),
								mode: "replace"
							});
							return "handled";
						}
					});
				}, "input-history: /history source");
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

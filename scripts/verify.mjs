// verify.mjs — package-level smoke test for dsh-input-history (v3).
//
// Asserts that (1) the host half exports a valid (empty) apply, (2) the
// client bundle is a non-empty module-loader entry that exports apply and
// targets the v3 input-trigger surface (/history opens our own panel), and
// (3) the bundle patch declares this package as a loader insert. Then runs
// the functional check (scripts/functional-check.mjs), which evaluates the
// client bundle in a mocked browser/module environment and exercises apply().
// Run with:
//
//   pnpm verify        (or)   node scripts/verify.mjs
//
// It needs no dependencies; all checks are plain Node reads/imports.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PKG_NAME = "@loommii/dsh-input-history";

const { apply } = await import("../lib/index.js");
assert.equal(typeof apply, "function", "host half must export an apply function");

const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
assert.ok(client.includes("window.__ModuleLoader__.load"), "client bundle must register with the module loader");
assert.ok(client.includes("exports.apply = apply"), "client bundle must export apply");
assert.ok(client.includes("exports.inject = inject"), "client bundle must declare service inject (thin-search parity)");
assert.ok(client.includes(PKG_NAME), "client bundle must declare its module id");

// v3 surface assertions — the contenteditable-era wiring + own-panel /history:
assert.ok(client.includes("conversation.input.overlay"), "client must register the history dropdown overlay");
assert.ok(client.includes("data-composer-input"), "client must target the contenteditable composer host marker");
assert.ok(client.includes("setComposerDraft"), "client must write drafts through the conversation input shell");
assert.ok(client.includes("registerSource"), "client must register an input-trigger source (own /history entry)");
assert.ok(!client.includes("kind: \"popupSelect\""), "client must NOT open the official popupSelect shell for /history");
assert.ok(!client.includes("commandUi.register"), "client must not register a commandUi popupSelect contribution");
assert.ok(client.includes("pageAllUserMessages"), "client must read the FULL host session log");
assert.ok(client.includes("onMouseEnter"), "client panel owns a single highlight model incl. hover");
assert.ok(!client.includes("TEXTAREA"), "client must not reference the v1 textarea surface");
assert.ok(client.includes('ctx.inject(["inputTriggers"]'), "client must register the /history source through ctx.inject(inputTriggers)");
assert.ok(client.includes('ctx.inject(["remote", "remote.session", "conversation", "sessions"]'), "client must inject the Sessions identity service");
assert.ok(client.includes("subagentAddress"), "client must identify direct subagent Sessions before history access");
assert.ok(client.includes("historyAllowed"), "client must have a fail-closed history guard");

const patch = await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8");
assert.ok(patch.includes(PKG_NAME), "patch manifest must reference the package name");
assert.ok(patch.includes("- insert:"), "patch manifest must be an insert list");

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml", "package must declare dsh.bundle.patch");
assert.equal(pkg.dsh?.client?.platform, "web", "package must declare dsh.client.platform web");
assert.ok(pkg.dsh?.client?.inject?.includes("@deepseek-ai/dsh-api-session-controller"), "package must request the session-controller client graph");
assert.ok(pkg.exports?.["./client"] !== undefined, "package must export ./client");

console.log(`OK: ${PKG_NAME} host half, client bundle (v3 own-panel surface), and patch manifest verified.`);

await import("./functional-check.mjs");

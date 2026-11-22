// ==UserScript==
// @name         # Neopets Ruffle Upgrade
// @namespace    local-advisor-fork
// @version      1.1
// @description  Replaces the stale Ruffle build Neopets ships with a current one, so Flash games it cannot handle have a chance of running. Changes only which emulator loads; takes no game actions.
// @author       Austin Ryder
// @match        *://www.neopets.com/*
// @match        *://neopets.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Ruffle%20Upgrade.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Ruffle%20Upgrade.user.js
// ==/UserScript==
//
// WHY
//
// Neopets loads Ruffle pinned to @ruffle-rs/ruffle@0.1.0-nightly.2024.6.28,
// published 2024-06-28. Current stable is 0.7.1 (Oct 2026) — a major version and
// roughly two and a half years of compatibility work newer. Games that fail under
// their build often work under a current one.
//
// HOW, and why it has to be done this way
//
// Ruffle's loader ends with, in effect:
//
//     window.RufflePlayer instanceof PublicAPI
//       ? api = window.RufflePlayer
//       : (api = new PublicAPI(window.RufflePlayer), window.RufflePlayer = api);
//     api.sources["local"] = thisBuild;
//
// Every self-hosted copy registers under the same key, "local". So two copies do
// not negotiate by version — whichever runs *last* wins. Loading a newer Ruffle
// first would be silently overwritten by the page's older one. This script
// therefore blocks the stale script from executing and loads a current build in
// its place, with a re-injection fallback if the block misses.
//
// The build is loaded as a real <script src> from the CDN rather than inlined,
// because Ruffle derives the base path for its .wasm and core.ruffle.*.js chunks
// from document.currentScript.src. Inlining it breaks asset resolution.
//
// SCOPE: this changes which emulator runs the game. It does not click, submit,
// score, or automate anything, and it confers no advantage beyond the game
// working at all.

(function () {
  "use strict";

  const CONFIG = {
    // "0.7.1" is current stable. Swap to a nightly (e.g.
    // "0.8.0-nightly.2026.11.2") if a game needs a fix newer than stable.
    version: "0.7.1",
    // Only scripts whose src matches this are blocked, so a future Neopets
    // upgrade to a newer Ruffle is left alone.
    stalePattern: /@ruffle-rs\/ruffle@0\.1\.0-nightly/i,
    badge: true,
  };

  const NEW_URL = `https://unpkg.com/@ruffle-rs/ruffle@${CONFIG.version}/ruffle.js`;
  const TAG = "[Ruffle Upgrade]";

  let blocked = 0;
  let injected = false;

  // ---------------------------------------------------------------- blocking

  function isStale(node) {
    return node && node.tagName === "SCRIPT"
      && CONFIG.stalePattern.test(node.src || "");
  }

  function neutralise(node, how) {
    // Changing the type to something the browser will not execute is safer than
    // removing the node, which some page scripts notice.
    node.type = "javascript/blocked";
    node.dataset.ruffleUpgradeBlocked = "1";
    blocked++;
    console.info(`${TAG} blocked stale Ruffle (${how}):`, node.src);
  }

  // Firefox and Pale Moon fire this before a script runs, which is the reliable
  // path. Chromium has no equivalent, hence the observer below.
  document.addEventListener("beforescriptexecute", (e) => {
    if (isStale(e.target)) {
      e.preventDefault();
      neutralise(e.target, "beforescriptexecute");
    }
  }, true);

  // Catches parser-inserted nodes early enough in most cases.
  try {
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (isStale(n) && !n.dataset.ruffleUpgradeBlocked) {
            neutralise(n, "observer");
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  } catch (err) {
    console.warn(`${TAG} observer unavailable`, err);
  }

  // ---------------------------------------------------------------- injecting

  function activeVersion() {
    try {
      return window.RufflePlayer?.sources?.local?.version ?? null;
    } catch {
      return null;
    }
  }

  function inject(reason) {
    const s = document.createElement("script");
    s.src = NEW_URL;
    s.async = false;            // keep execution ordered
    s.dataset.ruffleUpgrade = CONFIG.version;
    (document.head || document.documentElement).appendChild(s);
    injected = true;
    console.info(`${TAG} loading Ruffle ${CONFIG.version} (${reason})`);
  }

  inject("initial");

  // Fallback: if the stale build executed anyway (block missed), load ours again.
  // Registering under "local" a second time overwrites their entry.
  function ensureCurrent(when) {
    const v = activeVersion();
    if (!v) return;
    if (!v.startsWith(CONFIG.version)) {
      console.warn(`${TAG} stale build won (${v}) at ${when}; re-injecting`);
      inject(`re-inject at ${when}`);
    }
  }

  document.addEventListener("DOMContentLoaded", () => ensureCurrent("DOMContentLoaded"));
  window.addEventListener("load", () => {
    ensureCurrent("load");
    if (CONFIG.badge) showBadge();
  });

  // ---------------------------------------------------------------- badge

  function showBadge() {
    const v = activeVersion();
    // Stay quiet on pages that never loaded Ruffle at all.
    if (!v && blocked === 0 && !document.querySelector("ruffle-player, ruffle-embed, ruffle-object")) {
      return;
    }
    const ok = !!v && v.startsWith(CONFIG.version);
    const d = document.createElement("div");
    d.style.cssText =
      `position: fixed; bottom: 8px; right: 8px; z-index: 2147483647;` +
      ` padding: 4px 8px; border-radius: 4px;` +
      ` border: 1px solid ${ok ? "#1a9850" : "#d73027"};` +
      ` background: ${ok ? "#eaf7ea" : "#fff0f0"}; color: #222;` +
      ` font: 11px/1.3 Verdana, sans-serif; cursor: pointer;`;
    d.title = "Click to dismiss. From the Neopets Ruffle Upgrade userscript.";
    d.textContent = ok
      ? `Ruffle ${v} active (upgraded; blocked ${blocked})`
      : `Ruffle ${v || "not detected"} — upgrade did not take`;
    d.addEventListener("click", () => d.remove());
    document.body.appendChild(d);
  }
})();

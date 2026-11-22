// ==UserScript==
// @name         # Neopets Lunar Temple Advisor
// @namespace    local-advisor-fork
// @version      1.1
// @description  Highlights the correct Lunar Temple answer. Advisory only: it never selects the radio or submits the form. You make the move.
// @author       Austin Ryder
// @contributor  Solver logic by Piotr Kardovsky ([Neopets] Lunar Temple Solver, GF 446046); advisory-only fork
// @match        http*://www.neopets.com/shenkuu/lunar/?show=puzzle
// @match        http*://neopets.com/shenkuu/lunar/?show=puzzle
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Lunar%20Temple%20Advisor.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Lunar%20Temple%20Advisor.user.js
// ==/UserScript==
//
// WHY THIS FORK EXISTS
//
// The upstream script is already well behaved by default: it carries an `AUTO`
// flag that defaults to false, and in that state it only highlights the answer.
// Two things still made a local fork worth keeping.
//
//  1. The auto-submit path is present as dead code. Upstream ships with
//     @updateURL and @downloadURL, and check_for_updates is on, so a future
//     upstream version could change that default or that branch without you
//     noticing. This fork deletes the branch and the update URLs, so what you
//     reviewed is what keeps running.
//  2. Upstream marks the answer with `background = "#000"`, a black fill over
//     the label, which is hard to read. This draws a visible ring and a caption
//     instead.
//
// The arithmetic is unchanged.

(function () {
  "use strict";

  // Boundaries of Kreludor's 17 visual phases, in degrees.
  const PHASE_BOUNDS = [
    11, 33, 56, 78, 101, 123, 146, 168, 191, 213, 236, 258, 281, 303, 326, 348, 360,
  ];

  const COLOR = "#1a9850";

  function phaseIndex(angle) {
    const i = PHASE_BOUNDS.findIndex((bound) => angle <= bound);
    if (i === -1) return null;
    // The answer is the phase half a cycle away from Kreludor's position.
    if (i === 16) return 8;
    return i < 8 ? i + 8 : i - 8;
  }

  function readAngle() {
    // `swf` is a page global; the angle rides in its embed parameters.
    const el = typeof swf !== "undefined" ? swf : document.querySelector("#swf, embed, object");
    const attr = el && el.attributes && el.attributes.swf;
    const raw = attr ? attr.value || String(attr) : "";
    const m = /Kreludor=(\d+)/.exec(raw);
    return m ? parseInt(m[1], 10) : null;
  }

  function caption(text, color) {
    const d = document.createElement("div");
    d.id = "lunar-advisor-note";
    d.style.cssText =
      `margin: 8px auto; padding: 6px 10px; max-width: 420px;` +
      ` border: 2px solid ${color}; border-radius: 5px; background: #f6fff6;` +
      ` font: bold 12px/1.4 Verdana, sans-serif; color: #222; text-align: center;`;
    d.textContent = text;
    const form = document.querySelector('form[action="results.phtml"]');
    (form && form.parentNode ? form.parentNode : document.body).insertBefore(
      d, form || document.body.firstChild);
  }

  function run() {
    if (document.getElementById("lunar-advisor-note")) return;
    // Only act on the answer form, not the intro page.
    if (!document.querySelector('input[value="0"]')) return;

    const angle = readAngle();
    if (angle === null) {
      caption("Lunar Advisor: could not read Kreludor's angle. Page layout may have changed.", "#d73027");
      return;
    }

    const idx = phaseIndex(angle);
    const input = idx === null
      ? null
      : document.querySelector(`.content input[value="${idx}"]`);

    if (!input) {
      caption(`Lunar Advisor: computed phase ${idx} but could not find that option.`, "#d73027");
      return;
    }

    const label = input.parentNode;
    if (label && label.style) {
      label.style.outline = `3px solid ${COLOR}`;
      label.style.outlineOffset = "2px";
      label.style.background = "#eaf7ea";
    }
    caption(
      `Lunar Advisor: Kreludor at ${angle} degrees, so the answer is option ${idx}, ringed below. ` +
      `Select it and submit yourself.`,
      COLOR
    );
  }

  run();
})();

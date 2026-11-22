// ==UserScript==
// @name         # Neopets Monotony Spin Guard
// @namespace    local-advisor-fork
// @version      1.1
// @description  Shows a live countdown for a Wheel of Monotony spin and keeps the tab from being discarded or reloaded out from under it. Display and protection only: it never spins, donates, or claims.
// @author       Austin Ryder
// @match        *://www.neopets.com/prehistoric/monotony/*
// @match        *://neopets.com/prehistoric/monotony/*
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Monotony%20Spin%20Guard.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Monotony%20Spin%20Guard.user.js
// ==/UserScript==
//
// WHY
//
// The wheel is Phaser, not Flash — phaser.min.js plus wheelgame_monotony.js.
// Ruffle is not involved. Reading that file explains the failures exactly.
//
//  1. Backgrounding the tab is FINE and is handled on purpose.
//     handleWindowVisible() stops the tween on `hidden`, and on `visible`
//     recomputes the remaining duration from the wall-clock wheelMonotonyEnd.
//     So requestAnimationFrame suspension does not cost you the spin.
//
//  2. Destroying the document is FATAL, and it is deliberate. create() ends:
//
//         // On page load (new tab or refresh), always start fresh — no spin
//         // resuming. Refund for abandoned spins is handled server-side in
//         // monotony.inc (passive check).
//         if (gameOptions.monotony) {
//             this.clearSpinState();
//             this.showSpinButtons();
//         }
//
//     loadSpinState(), syncWithBackend() and resumeSpin() are still in the
//     file but nothing calls them any more — resuming was switched off. So any
//     reload, discard, crash, or navigation away wipes monotonySpinState and
//     abandons the spin, which the server then passively refunds. That is the
//     "150 NP refunded to your account" alert.
//
//  3. `token` is a page-lifetime global, set only by startwheel.php. After the
//     document is replaced it is undefined, so getResult.php is POSTed a claim
//     with no token and rejects it — which is the "Oops!" popup, text from
//     getSpinResult()'s failure branch.
//
// So the requirement is blunt: this one document has to survive, unreloaded,
// for the whole spin — 2 hours ungreased, down to 48 minutes at a 200,000 NP
// donation. There is no leave-and-come-back. This script does the two things
// that are possible within that: show the real remaining time, and make the
// document hard to lose by accident.
//
// WHAT IT DOES NOT DO
//
// It does not re-enable resuming. The dead resume path could be revived from
// getSpinStatus.php, but that would be re-claiming a spin the client abandoned
// and the server has already written off — reinstating a mechanic TNT removed
// on purpose. That is well over the line in this repo's README, so it is left
// alone. The on-page timer is a separate matter: #wheelTimer and <title> are
// server-rendered once at page load and nothing ever ticks them, and
// updateCountdownDisplay() writes to #countdownDisplay, which does not exist on
// the page. The countdown below is the live one the page is missing.
//
// SCOPE: reads spin status, renders a countdown, holds the tab open. It does
// not click, spin, donate, claim, or submit.

(function () {
  "use strict";

  const CONFIG = {
    // Ask before unloading while a spin is running. The browser decides whether
    // to actually show its prompt; it will not without prior interaction.
    guardUnload: true,
    // Emit near-silent audio for the duration. An audible tab is exempt from
    // tab discarding in Firefox-family and Chromium browsers, which is the only
    // lever a page has over an unloader.
    holdAudio: true,
    // Output gain. Inaudible in practice, but deliberately non-zero: both
    // browsers decide "this tab is audible" from actual output, so a muted or
    // zero-gain graph does not count and buys nothing.
    holdGain: 0.0005,
    corner: "bottom-left",
  };

  const STATUS_URL = "/np-templates/ajax/wheels/monotony/getSpinStatus.php";
  const TAG = "[Spin Guard]";

  let endTime = null;
  let ticker = null;
  let hold = null;
  let guarded = false;

  // ------------------------------------------------------------------- status

  // Read-only status query. This is the endpoint the (now unreachable)
  // syncWithBackend() used, and it takes no parameters. getResult.php is the
  // one that awards a prize, and this script never touches it.
  async function readStatus() {
    const res = await fetch(STATUS_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    const data = await res.json();
    console.info(`${TAG} status`, data);
    return data;
  }

  // ---------------------------------------------------------------- keepalive

  // A continuous oscillator at negligible gain, rather than a looping audio
  // file: nothing to download, and no gap between loops where the tab could
  // read as silent.
  function startHold() {
    if (!CONFIG.holdAudio || hold) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      console.warn(`${TAG} no AudioContext; tab is unprotected from discarding`);
      return;
    }
    try {
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = CONFIG.holdGain;
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      hold = { ctx, osc };
      // Autoplay policy starts the context suspended without a user gesture.
      // Arming happens on the spin click, which is one, so this normally
      // resumes; if it does not, the badge says the tab is unprotected.
      ctx.resume().then(
        () => console.info(`${TAG} holding tab audible`),
        (err) => console.warn(`${TAG} audio hold suspended`, err),
      );
    } catch (err) {
      console.warn(`${TAG} could not start audio hold`, err);
      hold = null;
    }
  }

  function stopHold() {
    if (!hold) return;
    try {
      hold.osc.stop();
      hold.ctx.close();
    } catch {
      /* already gone */
    }
    hold = null;
  }

  function holding() {
    return !!hold && hold.ctx.state === "running";
  }

  function onBeforeUnload(e) {
    if (!endTime || Date.now() >= endTime) return;
    // Leaving now abandons the spin, so make it a deliberate act.
    e.preventDefault();
    e.returnValue = "";
    return "";
  }

  function guard() {
    if (guarded) return;
    guarded = true;
    if (CONFIG.guardUnload) window.addEventListener("beforeunload", onBeforeUnload);
    startHold();
  }

  function unguard() {
    if (!guarded) return;
    guarded = false;
    window.removeEventListener("beforeunload", onBeforeUnload);
    stopHold();
  }

  // ------------------------------------------------------------------ display

  let badge = null;
  let line = null;
  let note = null;

  function buildBadge() {
    const [vertical, horizontal] = CONFIG.corner.split("-");
    badge = document.createElement("div");
    badge.style.cssText =
      `position: fixed; ${vertical}: 8px; ${horizontal}: 8px;` +
      ` z-index: 2147483646; padding: 6px 10px; border-radius: 4px;` +
      ` border: 1px solid #555; background: #fffbe6; color: #222;` +
      ` font: 11px/1.5 Verdana, sans-serif; max-width: 260px;`;

    line = document.createElement("div");
    line.style.fontWeight = "bold";
    badge.appendChild(line);

    note = document.createElement("div");
    note.style.cssText = "margin-top: 3px; opacity: 0.8;";
    badge.appendChild(note);

    document.body.appendChild(badge);
  }

  function formatRemaining(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return (
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:` +
      `${String(s).padStart(2, "0")}`
    );
  }

  function render() {
    const left = endTime - Date.now();
    if (left <= 0) {
      line.textContent = "Spin finished";
      note.textContent = "Claim the prize on the wheel.";
      badge.style.borderColor = "#1a9850";
      badge.style.background = "#eaf7ea";
      stopTicker();
      unguard();
      return;
    }
    line.textContent = `Spinning — ${formatRemaining(left)} left`;
    // The unload prompt is installed either way; the audio hold is what keeps
    // an unloader off the tab, so report that specifically.
    note.textContent = holding()
      ? "Leave this tab loaded. A reload abandons the spin."
      : "Not held audible — the tab may be discarded.";
  }

  function stopTicker() {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  // The display is derived from a timestamp rather than accumulated ticks, so a
  // throttled or suspended tab still shows the right number when it is read.
  function startTicker() {
    stopTicker();
    render();
    ticker = setInterval(render, 1000);
  }

  // --------------------------------------------------------------------- wire

  function begin(ms) {
    endTime = Date.now() + ms;
    if (!badge) buildBadge();
    guard();
    startTicker();
  }

  // The page's own globals are the most accurate source once a spin has
  // started in this document, since startwheel.php set them directly.
  function pollForLocalSpin() {
    const seen = setInterval(() => {
      const end = window.wheelMonotonyEnd;
      if (typeof end === "number" && end > Date.now() && end !== endTime) {
        clearInterval(seen);
        begin(end - Date.now());
      }
    }, 1000);
  }

  async function main() {
    // Arm the hold on the user's own spin click: that gesture is what lets the
    // audio context resume, and it is the moment the document becomes precious.
    for (const id of ["wheelButtonSpin", "spinFasterButton", "donateAndSpinBtn"]) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", startHold, true);
    }

    pollForLocalSpin();

    // On a fresh load, say what the server thinks. If a spin is still open here
    // it is already lost — create() wiped the client state — so this reports
    // rather than resumes.
    const data = await readStatus().catch((err) => {
      console.warn(`${TAG} status read failed`, err);
      return null;
    });
    if (!data) return;

    if (data.isSpinning && typeof data.endTime === "number") {
      if (!badge) buildBadge();
      const left = data.endTime - Date.now();
      line.textContent =
        left > 0
          ? `Server still has a spin: ${formatRemaining(left)} left`
          : "Server has a finished spin";
      note.textContent =
        "This page load abandoned it, so expect a refund. Spin again.";
      badge.style.borderColor = "#d73027";
      badge.style.background = "#fff0f0";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();

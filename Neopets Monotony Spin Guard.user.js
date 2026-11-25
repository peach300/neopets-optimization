// ==UserScript==
// @name         # Neopets Monotony Spin Guard
// @namespace    local-advisor-fork
// @version      1.4
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

  // The two fonts the site serves itself, so the badge reads as one of the
  // site's own content modules rather than as an add-on. images.neopets.com
  // sends access-control-allow-origin: *, so @font-face reaches them from a
  // userscript with no grants - nothing to bundle and nothing to base64.
  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPTM Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPTM Museo", "Museo Sans Rounded", Verdana, sans-serif';

  // The family names are prefixed: an unprefixed "Cafeteria" would collide
  // with whatever the site has already registered under that name, and which
  // one wins is not worth leaving to load order. Cafeteria is sized in pt and
  // Museo in px because that is how the site's own template.css sizes them.
  const CSS = `
@font-face {
  font-family: "NPTM Cafeteria"; font-display: swap;
  src: url("${FONT_HOST}/cafeteria-black.ttf") format("truetype");
}
@font-face {
  font-family: "NPTM Museo"; font-style: normal; font-display: swap;
  src: url("${FONT_HOST}/museosansrounded-500.woff") format("woff"),
       url("${FONT_HOST}/museosansrounded-500.ttf") format("truetype");
}
/* !important on every declaration, and box-sizing on the root and all of its
   descendants: default.css and the theme sheets set font, color and
   text-align broadly and content-box in places, and the theme can be swapped
   underneath us. Without these the badge inherits centred text in the wrong
   font on some themes, and its padding pushes it past its own width. */
#spinguard {
  box-sizing: border-box !important;
  /* Bottom right, at the same 25px/23px the other per-activity panels in this
     repo sit at, so a page that happens to carry two of them lines them up
     rather than scattering them around the window. */
  position: fixed !important; bottom: 25px !important; right: 23px !important;
  /* The premium footer bar sits at 10000-10140 and its popups raise
     themselves further, so anything lower than this gets buried. */
  z-index: 2147483646 !important;
  /* A 1280px window leaves about 140px of margin either side of the site's
     centred 1000px content column, so 150px lives in that margin instead of
     lying over the wheel. The status line wraps onto a second line rather
     than widening this, because vertical room is what the margin has. */
  width: 150px !important;
  text-align: left !important;
  font: 12px/1.45 ${MUSEO} !important; color: #333 !important;
  border: 1px solid #27486d !important; border-radius: 10px !important;
  overflow: hidden !important; background: #fff !important;
  box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
}
#spinguard * { box-sizing: border-box !important; }
/* Hiding is one rule here, toggled with the hidden attribute, never with
   element.style.display: an author !important declaration beats an inline
   one, so the moment any rule above gains a display the inline form would
   silently stop working and leave an empty line on screen. */
#spinguard [hidden] { display: none !important; }
#spinguard-head {
  /* Cafeteria sits high in its box, so even vertical padding makes the label
     look like it is falling out of the bottom. */
  padding: 4px 8px 6px !important;
  font: 13pt/1.1 ${CAFETERIA} !important;
  color: #fff !important; text-shadow: 0 1px 1px rgba(0,0,0,0.35) !important;
  background: linear-gradient(#5b9bd9, #2367B5) !important;
  border-bottom: 1px solid #27486d !important;
}
#spinguard-body {
  padding: 5px 8px 7px !important;
  background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
}
/* One word, because the panel has one subject and the header already names
   it. What the word does not carry - whether the tab is actually held
   against an unloader - is carried by the colour instead. */
#spinguard-state { font: 11px/1.4 ${MUSEO} !important; color: #1b4f85 !important; }
/* Proportional digits reflow the line on every tick, which is what makes a
   countdown visibly jitter. The min-width covers the longest form the value
   takes (02:09:35 at 14px monospace is about 67px), so a passing second
   changes one glyph and nothing else on the badge moves. */
#spinguard-time {
  display: block !important; min-width: 68px !important;
  margin: 1px 0 0 !important;
  font: 14px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas,
        "DejaVu Sans Mono", monospace !important;
  font-variant-numeric: tabular-nums !important;
  font-feature-settings: "tnum" 1 !important;
  letter-spacing: 0 !important; color: #1b4f85 !important;
}
/* Meridell green is the only state colour, and it goes on the header so a
   finished spin is visible from the corner of the eye. Red is kept for a
   fault, which here is a real one: a spin the server still holds that this
   page load has already lost. The fault header gradient is derived from the
   palette's fault border rather than being a colour of its own. */
#spinguard[data-state="done"] { border-color: #14543a !important; }
#spinguard[data-state="done"] #spinguard-head {
  background: linear-gradient(#2fa86f, #1d774f) !important;
  border-bottom-color: #14543a !important;
}
#spinguard[data-state="done"] #spinguard-body { background: #e9f8ef !important; }
#spinguard[data-state="done"] #spinguard-state,
#spinguard[data-state="done"] #spinguard-time { color: #156141 !important; }
#spinguard[data-state="fault"] { border-color: #a94442 !important; }
#spinguard[data-state="fault"] #spinguard-head {
  background: linear-gradient(#c96866, #a94442) !important;
  border-bottom-color: #7a2b2b !important;
}
#spinguard[data-state="fault"] #spinguard-state,
#spinguard[data-state="fault"] #spinguard-time { color: #7a2b2b !important; }
`;

  let badge = null;
  let stateEl = null;
  let timeEl = null;

  // One <style> element, guarded by its id, so a second run of the script in
  // a frame or a re-injection does not stack the rules.
  function injectStyles() {
    if (document.getElementById("spinguard-style")) return;
    const el = document.createElement("style");
    el.id = "spinguard-style";
    el.textContent = CSS;
    (document.body || document.documentElement).appendChild(el);
  }

  function buildBadge() {
    injectStyles();
    badge = document.createElement("div");
    badge.id = "spinguard";
    badge.dataset.state = "spin";

    const head = document.createElement("div");
    head.id = "spinguard-head";
    head.textContent = "Wheel of Monotony";
    badge.appendChild(head);

    const body = document.createElement("div");
    body.id = "spinguard-body";

    stateEl = document.createElement("div");
    stateEl.id = "spinguard-state";

    timeEl = document.createElement("span");
    timeEl.id = "spinguard-time";

    body.append(stateEl, timeEl);
    badge.appendChild(body);
    document.body.appendChild(badge);
  }

  function setState(state) {
    if (badge && badge.dataset.state !== state) badge.dataset.state = state;
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

  // Two clocks, because the work timer and the readout want opposite things.
  // A browser throttles a background tab's timers to roughly once a minute
  // whatever period is asked for, so the work below has to tolerate a long
  // one; the digits want the refresh rate, and repainting them from the work
  // timer lands them at irregular offsets, which reads as choppiness even
  // though the arithmetic behind them is right.
  let frame = 0;

  function paintClock() {
    frame = 0;
    if (!endTime) return;
    const text = formatRemaining(endTime - Date.now());
    // This guard is what makes sixty frames a second cheap: the text changes
    // once a second, so fifty-nine of them do nothing at all.
    if (timeEl.textContent !== text) timeEl.textContent = text;
    frame = requestAnimationFrame(paintClock);
  }

  function startClock() {
    if (!frame) paintClock();
  }

  function stopClock() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  // A hidden tab does not fire requestAnimationFrame at all, so the loop dies
  // on a tab switch and has to be restarted by hand; without this the readout
  // sits frozen on whatever it last painted. The spin itself is unaffected -
  // the wheel recomputes its own remaining duration from the wall clock.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && endTime && Date.now() < endTime) startClock();
  });

  function render() {
    const left = endTime - Date.now();
    if (left <= 0) {
      setState("done");
      stateEl.textContent = "Finished";
      timeEl.hidden = true;
      stopTicker();
      stopClock();
      unguard();
      return;
    }
    // The unload prompt is installed either way, but the audio hold is what
    // keeps an unloader off the tab, and when it did not start the guard is
    // not guarding - the browser can take the tab without you touching it.
    // That is a fault rather than a state of the spin, so it goes on the
    // colour and leaves the word alone.
    setState(holding() ? "spin" : "fault");
    stateEl.textContent = "Spinning";
    timeEl.hidden = false;
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
    startClock();
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
      setState("fault");
      const left = data.endTime - Date.now();
      stateEl.textContent = "Abandoned";
      // Not ticked, and deliberately: this figure is the leftover of a spin
      // that is already lost, so it is a reading of what the server still
      // holds rather than a countdown to anything that can be claimed. It is
      // shown only while there is some left, since zero would read as a spin
      // that had just finished.
      timeEl.hidden = left <= 0;
      if (left > 0) timeEl.textContent = formatRemaining(left);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();

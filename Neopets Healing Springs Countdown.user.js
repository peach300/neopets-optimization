// ==UserScript==
// @name         # Neopets Healing Springs Countdown
// @namespace    local-advisor-fork
// @version      1.1
// @description  Tracks the Healing Springs' half-hour cooldown and shows a live countdown on every Neopets page, with a desktop notification, title flash and optional beep the moment it is ready. Display only: it never clicks, submits or heals for you.
// @author       Austin Ryder
// @match        *://www.neopets.com/*
// @match        *://neopets.com/*
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Healing%20Springs%20Countdown.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Healing%20Springs%20Countdown.user.js
// ==/UserScript==
//
// WHY
//
// The Healing Springs is usable once every 30 minutes, which is short enough
// that it is worth catching repeatedly in a session and long enough that you
// will not remember when you last went. The page itself tells you nothing: the
// faerie either heals your pets or refuses, and the refusal gives no remaining
// time. So the half hour is tracked here instead, from the one event the page
// does expose — the result text of a visit.
//
// HOW THE STATE IS READ
//
// Every load of /faerieland/springs.phtml is classified from the faerie's
// text:
//
//   * a visit that COUNTED — pets healed, hit points gained, a potion handed
//     over, or "no healing powers today" (that last one still burns the half
//     hour, which is the whole reason it has to be matched) — sets the
//     cooldown to exactly 30 minutes from that page load. This is the accurate
//     case.
//
//   * a visit that was REFUSED — "once every half hour" — means a cooldown is
//     running whose remainder the page does not state. If a timer is already
//     stored it is kept, because it is better information. If not, the script
//     assumes a full 30 minutes from now and labels the countdown "estimated",
//     so the first refusal after installing is pessimistic rather than wrong.
//
// Nothing is inferred from the idle page, which looks identical whether or not
// the springs are available. Two things guard against reading one as a visit:
// a "counted" verdict requires the heal form to be gone from the page, and
// submitting the form sets a one-shot flag in sessionStorage, so the page that
// submission loads counts as a visit even if TNT reworded the result or kept
// the form on it. The patterns themselves are kept narrow for the same reason
// — the idle page's flavour text is all healing waters and feeling better.
//
// The result is written to localStorage, so the countdown shows up on any
// Neopets page in any tab, and `storage` events keep open tabs in step. It is
// per browser profile, NOT per account: switching accounts in the same browser
// shows the previous account's timer. Set `badgeOnAllPages: false` to confine
// the display to the springs page itself.
//
// ALERTS
//
// A notification only fires while some Neopets tab is open — a userscript has
// no life of its own, so there is no background alarm here. Notifications need
// permission, which browsers only grant from a real click, so the badge offers
// an "Enable alerts" button the first time. Same for the beep: audio needs a
// prior gesture in the tab, and the enable click doubles as that gesture.
//
// SCOPE: reads the page's own result text, keeps a timestamp, draws a
// countdown, alerts on zero. It does not submit the heal form, and does not
// touch the page in any way the site can see.

(function () {
  "use strict";

  const CONFIG = {
    // The documented cooldown. Changing this is only useful if TNT changes it.
    cooldownMinutes: 30,
    // Added to the cooldown before "ready" is announced. The 30 minutes are
    // measured server-side from a moment slightly before the page rendered, so
    // a countdown that hits zero exactly is a coin flip on a wasted refusal.
    padSeconds: 20,
    // Show the badge on every Neopets page, not just the springs page.
    badgeOnAllPages: true,
    // Desktop notification when the cooldown ends.
    notify: true,
    // Short beep when the cooldown ends.
    beep: true,
    beepGain: 0.08,
    // Flash the tab title while the springs are ready and the tab is hidden.
    flashTitle: true,
    corner: "bottom-left",
  };

  // Faerieland, not Maraqua: the springs sit at /faerieland/springs.phtml.
  // Matched on the filename rather than the full path so that a move within
  // the site (or an /water/ alias) still registers as the springs page — the
  // cost of being wrong here is silent, since the page is simply never
  // classified and the timer never starts.
  const SPRINGS_URL = "/faerieland/springs.phtml";
  const SPRINGS_RE = /\/springs\.phtml$/;
  const STORE_KEY = "np_healing_springs_state";
  const ALERTS_KEY = "np_healing_springs_alerts";
  const TAG = "[Healing Springs]";

  const onSprings = SPRINGS_RE.test(location.pathname.toLowerCase());
  if (!onSprings && !CONFIG.badgeOnAllPages) return;

  // ------------------------------------------------------------------- state

  // {endTime: epoch ms, exact: bool, setAt: epoch ms}
  function readState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return typeof data?.endTime === "number" ? data : null;
    } catch {
      return null;
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn(`${TAG} could not persist state`, err);
    }
  }

  function alertsEnabled() {
    try {
      return localStorage.getItem(ALERTS_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setAlertsEnabled(on) {
    try {
      localStorage.setItem(ALERTS_KEY, on ? "1" : "0");
    } catch {
      /* private mode */
    }
  }

  function cooldownMs() {
    return CONFIG.cooldownMinutes * 60_000 + CONFIG.padSeconds * 1000;
  }

  // ------------------------------------------------------- page classification

  // The faerie has several result messages and TNT rewords them, so each
  // branch matches the stable part of the sentence rather than the whole
  // thing. These stay narrow on purpose: the idle page's own flavour text is
  // all about healing waters and feeling better, so anything looser than this
  // would read an untouched page as a visit and start a phantom half hour.
  const USED_RE = new RegExp(
    [
      "fully healed",
      "(has|have) been healed",
      "hit points?",
      "healing potion",
      "no healing powers",
    ].join("|"),
    "i",
  );

  const REFUSED_RE = new RegExp(
    [
      "once every half",
      "every half an hour",
      "already visited",
      "come back later",
      "visit me again",
    ].join("|"),
    "i",
  );

  // The heal form is the one unambiguous marker of a page you have not acted
  // on in this request. Its presence is what keeps a result pattern appearing
  // somewhere in the idle flavour text from being read as a visit.
  function healForm() {
    for (const form of document.querySelectorAll("form")) {
      const action = (form.getAttribute("action") || "").toLowerCase();
      if (action.includes("springs.phtml")) return form;
      if (/heal/i.test(form.innerText || "") && form.querySelector("input,button")) {
        return form;
      }
    }
    return null;
  }

  function classify() {
    // Scoped to the content column where present, so the site's own nav text
    // and ad copy cannot trip either pattern.
    const scope =
      document.querySelector(".content") ||
      document.querySelector("#content") ||
      document.body;
    const text = scope.innerText || "";

    // A refusal is unmistakable and always wins: it is the one message that
    // cannot be confused with flavour text, and treating it as a visit would
    // restart a half hour that is already partly served.
    if (REFUSED_RE.test(text)) return "refused";

    // Second signal, for the case where TNT keeps the form on the result page
    // and the text alone is inconclusive: this document was loaded by
    // submitting the heal form, so unless it says otherwise, a visit happened.
    if (consumePending()) return "used";

    if (USED_RE.test(text) && !healForm()) return "used";
    return "idle";
  }

  // Set when the heal form is submitted, read on the page that submission
  // loads. sessionStorage, not localStorage: it belongs to this tab's
  // navigation, and a stale flag in another tab must not count as a visit.
  const PENDING_KEY = "np_healing_springs_submitted";

  function markPending() {
    try {
      sessionStorage.setItem(PENDING_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
  }

  function consumePending() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      return false;
    }
    const at = Number(raw);
    // A few minutes' grace for a slow load; anything older is a flag left
    // behind by a back-button or a tab restored from the session store.
    return Number.isFinite(at) && Date.now() - at < 180_000;
  }

  // Both ways the heal can leave this page are flagged, because which one the
  // page uses is not something to bet the timer on: a POSTed form fires
  // `submit`, while a plain <a href="springs.phtml?..."> link fires only a
  // click. Listening on the document in the capture phase also survives the
  // page rebuilding its own controls after load.
  function watchControls() {
    const form = healForm();
    if (form) form.addEventListener("submit", markPending, { capture: true });

    document.addEventListener(
      "click",
      (e) => {
        const el = e.target?.closest?.(
          "a[href], button, input[type=submit], input[type=image]",
        );
        if (!el) return;
        const label = `${el.getAttribute("href") || ""} ${el.value || ""} ${
          el.innerText || ""
        }`;
        if (/heal|spring/i.test(label)) markPending();
      },
      { capture: true },
    );
  }

  function applyPageState() {
    const verdict = classify();
    const stored = readState();
    const now = Date.now();

    if (verdict === "used") {
      writeState({ endTime: now + cooldownMs(), exact: true, setAt: now });
      console.info(`${TAG} visit counted; cooldown started`);
      return;
    }

    if (verdict === "refused") {
      // A live timer is better than a guess, so only fill a gap.
      if (stored && stored.endTime > now) {
        console.info(`${TAG} refused; keeping the timer already stored`);
        return;
      }
      writeState({ endTime: now + cooldownMs(), exact: false, setAt: now });
      console.info(`${TAG} refused with no timer stored; assuming a full wait`);
      return;
    }

    console.info(`${TAG} idle page; state unchanged`);
  }

  // ------------------------------------------------------------------- alerts

  function fireNotification() {
    if (!CONFIG.notify || !alertsEnabled()) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    try {
      const n = new Notification("Healing Springs is ready", {
        body: "The faerie will heal your pets again.",
        tag: "np-healing-springs",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.warn(`${TAG} notification failed`, err);
    }
  }

  function fireBeep() {
    if (!CONFIG.beep || !alertsEnabled()) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = CONFIG.beepGain;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      // Short fade rather than a hard stop, which clicks.
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.55);
      osc.onended = () => ctx.close();
    } catch (err) {
      console.warn(`${TAG} beep failed`, err);
    }
  }

  let titleFlasher = null;
  const realTitle = document.title;

  function startTitleFlash() {
    if (!CONFIG.flashTitle || titleFlasher) return;
    let on = false;
    titleFlasher = setInterval(() => {
      on = !on;
      document.title = on ? "✨ Springs ready!" : realTitle;
    }, 1500);
  }

  function stopTitleFlash() {
    if (!titleFlasher) return;
    clearInterval(titleFlasher);
    titleFlasher = null;
    document.title = realTitle;
  }

  // ------------------------------------------------------------------ display

  let badge = null;
  let mini = null;
  let line = null;
  let note = null;
  let button = null;
  let manual = null;
  let fold = null;
  let ticker = null;
  let announced = false;

  // Styled as one of the classic layout's own content modules rather than as a
  // browser-chrome tooltip: Verdana 11, a blue gradient header bar in the
  // site's #2367B5, a pale body, and the yellow #FFD026 pill the site uses for
  // its buttons. The ready state swaps the blue for Meridell's #1d774f green,
  // since "go now" wants to read differently at a glance.
  //
  // Every declaration is !important and the selectors are id-scoped. The badge
  // lives on every page of a site whose own stylesheets are broad (`button`,
  // `a`, `div` all carry site rules, and the H5 pages load Tailwind-ish
  // utilities on top), so anything less gets repainted by whatever page it
  // lands on.
  const STYLE_ID = "nphs-style";

  // The site's own fonts and its own button. Both are served from
  // images.neopets.com with `access-control-allow-origin: *`, so a userscript
  // stylesheet can declare them the same way template.css does — the files are
  // already in the browser's cache on any H5 page.
  //
  //   Cafeteria          — titles and buttons (template.css: .button-default__2020)
  //   Museo Sans Rounded — body copy (safetydeposit.css: .text-museo / -bold)
  //
  // They are declared under their own names, so they cannot collide with the
  // page's definitions or be lost on a classic-layout page that never loads
  // template.css.
  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPHS Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPHS Museo", "Museo Sans Rounded", Verdana, sans-serif';
  const MUSEO_BOLD =
    '"NPHS Museo Bold", "Museo Sans Rounded Bold", Verdana, sans-serif';

  // The button is the SDB's "Remove 1": np-button + button-default__2020 +
  // button-yellow__2020 + .sdb-remove1, copied declaration for declaration —
  // Cafeteria at 11pt, the #f6e250 → #ebb233 gradient, 15px radius, and the
  // four-layer inset shadow that gives it its bevel and black outline.
  const CSS = `
    @font-face {
      font-family: "NPHS Cafeteria";
      src: url("${FONT_HOST}/cafeteria-black.ttf") format("truetype");
      font-display: swap;
    }
    @font-face {
      font-family: "NPHS Museo"; font-style: normal;
      src: url("${FONT_HOST}/museosansrounded-500.woff") format("woff"),
           url("${FONT_HOST}/museosansrounded-500.ttf") format("truetype");
      font-display: swap;
    }
    @font-face {
      font-family: "NPHS Museo Bold"; font-style: normal;
      src: url("${FONT_HOST}/museosansrounded-700.woff") format("woff"),
           url("${FONT_HOST}/museosansrounded-700.ttf") format("truetype");
      font-display: swap;
    }
    #nphs {
      position: fixed !important; z-index: 2147483646 !important;
      width: 190px !important; box-sizing: border-box !important;
      font: 12px/1.45 ${MUSEO} !important;
      color: #333 !important; text-align: left !important;
      border: 1px solid #27486d !important; border-radius: 10px !important;
      overflow: hidden !important; background: #fff !important;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
    }
    #nphs-head {
      display: flex !important; align-items: center !important;
      gap: 6px !important; padding: 5px 9px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important;
      font: 15pt/1.1 ${CAFETERIA} !important;
      cursor: pointer !important; user-select: none !important;
    }
    #nphs-head svg { flex: none !important; }
    #nphs-name { flex: 1 1 auto !important; white-space: nowrap !important; }
    #nphs-mini { display: none !important; }
    #nphs-fold { opacity: 0.85 !important; font-size: 13px !important; }
    #nphs-body {
      padding: 8px 9px !important;
      background: #eaf2fb !important;
      border-top: 1px solid #bcd3ec !important;
    }
    #nphs-time {
      font: 24pt/1 ${CAFETERIA} !important;
      color: #1b4f85 !important; letter-spacing: 0.5px !important;
      margin: 0 0 2px !important;
    }
    #nphs-note {
      font: 11px/1.35 ${MUSEO} !important; color: #4a5a6a !important;
      margin: 0 0 7px !important;
    }
    #nphs-note a { color: #2367B5 !important; text-decoration: underline !important; }
    #nphs-manual {
      display: none !important; font: 11px/1.35 ${MUSEO} !important;
      color: #2367B5 !important; text-decoration: underline !important;
      cursor: pointer !important; margin: 0 0 7px !important;
    }
    #nphs[data-state="ready"] #nphs-manual {
      display: block !important; color: #156141 !important;
    }
    /* .np-button + .button-default__2020 + .button-yellow__2020 + .sdb-remove1 */
    #nphs-btn {
      display: block !important; width: 100% !important;
      box-sizing: border-box !important; margin: 0 !important;
      padding: 3px 10px 7px !important; cursor: pointer !important;
      position: relative !important; overflow: hidden !important;
      outline: none !important; text-align: center !important;
      font: 11pt/1.1 ${CAFETERIA} !important;
      white-space: nowrap !important;
      color: #363636 !important;
      background: linear-gradient(#f6e250, #ebb233) !important;
      border: #fff solid 1px !important; border-radius: 15px !important;
      box-shadow: inset 0 0 0 1px rgba(246,226,80,1),
                  inset 0 -3px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #nphs-btn:hover, #nphs-btn:focus {
      color: #363636 !important;
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #nphs-btn:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #nphs[data-state="ready"] { border-color: #14543a !important; }
    #nphs[data-state="ready"] #nphs-head {
      background: linear-gradient(#2fa86f, #1d774f) !important;
      border-bottom-color: #14543a !important;
    }
    #nphs[data-state="ready"] #nphs-body {
      background: #e9f8ef !important; border-top-color: #b6e0c6 !important;
    }
    #nphs[data-state="ready"] #nphs-time { color: #156141 !important; }
    #nphs[data-state="ready"] #nphs-note a { color: #156141 !important; }
    #nphs[data-collapsed="1"] #nphs-body { display: none !important; }
    #nphs[data-collapsed="1"] { width: auto !important; }
    #nphs[data-collapsed="1"] #nphs-name { display: none !important; }
    #nphs[data-collapsed="1"] #nphs-mini { display: inline !important; }
  `;

  // A water droplet in place of an icon file: the springs are a water-world
  // daily, and a drawn glyph cannot 404 or go missing the way a hotlinked
  // images.neopets.com asset can.
  const DROP_SVG =
    '<svg width="11" height="13" viewBox="0 0 11 13" aria-hidden="true">' +
    '<path d="M5.5 0.5 C8 4 10.5 6.2 10.5 8.6 A5 5 0 0 1 0.5 8.6 C0.5 6.2 3 4 5.5 0.5 Z"' +
    ' fill="#dff0ff" stroke="#ffffff" stroke-width="1"/>' +
    '<ellipse cx="4" cy="8.6" rx="1.2" ry="1.7" fill="#ffffff" opacity="0.75"/>' +
    "</svg>";

  const COLLAPSE_KEY = "np_healing_springs_collapsed";

  function collapsed() {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function buildBadge() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const [vertical, horizontal] = CONFIG.corner.split("-");
    badge = document.createElement("div");
    badge.id = "nphs";
    badge.style.setProperty(vertical, "10px", "important");
    badge.style.setProperty(horizontal, "10px", "important");
    badge.dataset.collapsed = collapsed() ? "1" : "0";

    const head = document.createElement("div");
    head.id = "nphs-head";
    head.innerHTML = DROP_SVG;
    head.title = "Click to collapse";

    const name = document.createElement("span");
    name.id = "nphs-name";
    name.textContent = "Healing Springs";
    head.appendChild(name);

    mini = document.createElement("span");
    mini.id = "nphs-mini";
    head.appendChild(mini);

    fold = document.createElement("span");
    fold.id = "nphs-fold";
    head.appendChild(fold);

    head.addEventListener("click", () => {
      const next = badge.dataset.collapsed === "1" ? "0" : "1";
      badge.dataset.collapsed = next;
      try {
        localStorage.setItem(COLLAPSE_KEY, next);
      } catch {
        /* private mode */
      }
      render();
    });
    badge.appendChild(head);

    const body = document.createElement("div");
    body.id = "nphs-body";

    line = document.createElement("div");
    line.id = "nphs-time";
    body.appendChild(line);

    note = document.createElement("div");
    note.id = "nphs-note";
    body.appendChild(note);

    // Escape hatch. Reading a visit off the page is a heuristic against a
    // page TNT can reword at any time, so there is always a way to say "it
    // happened" by hand rather than being stuck watching a timer that never
    // started.
    manual = document.createElement("div");
    manual.id = "nphs-manual";
    manual.textContent = "I just healed \u2014 start the timer";
    manual.addEventListener("click", () => {
      const now = Date.now();
      writeState({ endTime: now + cooldownMs(), exact: false, setAt: now });
      announced = false;
      render();
    });
    body.appendChild(manual);

    button = document.createElement("button");
    button.id = "nphs-btn";
    button.type = "button";
    button.addEventListener("click", onButtonClick);
    body.appendChild(button);

    badge.appendChild(body);
    document.body.appendChild(badge);
  }

  // The one click the script needs: notification permission and the audio
  // autoplay gesture both require it, and neither can be asked for silently.
  function onButtonClick() {
    if (alertsEnabled()) {
      setAlertsEnabled(false);
      render();
      return;
    }
    setAlertsEnabled(true);
    fireBeep(); // doubles as "alerts are on" feedback and unblocks audio
    if (CONFIG.notify && typeof Notification !== "undefined") {
      if (Notification.permission === "default") {
        Notification.requestPermission()
          .then(render)
          .catch((err) => console.warn(`${TAG} permission request failed`, err));
      }
    }
    render();
  }

  function formatRemaining(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function alertsLabel() {
    if (!alertsEnabled()) return "✦ Enable alerts";
    if (
      CONFIG.notify &&
      typeof Notification !== "undefined" &&
      Notification.permission === "denied"
    ) {
      return "Alerts on (beep only)";
    }
    return "Alerts on — click to mute";
  }

  function render() {
    if (!badge) buildBadge();
    const state = readState();
    const left = state ? state.endTime - Date.now() : 0;
    fold.textContent = badge.dataset.collapsed === "1" ? "▸" : "–";

    if (!state || left <= 0) {
      badge.dataset.state = "ready";
      line.textContent = "Ready!";
      mini.textContent = "Ready!";
      note.innerHTML = onSprings
        ? "The faerie will heal your pets."
        : `<a href="${SPRINGS_URL}">Visit the Healing Springs »</a>`;
      if (state && !announced) {
        // Only announce a transition this tab actually watched happen; a stale
        // timer from hours ago is not news worth a notification.
        announced = true;
        if (Date.now() - state.endTime < 60_000) {
          fireNotification();
          fireBeep();
        }
        if (document.hidden) startTitleFlash();
      }
    } else {
      badge.dataset.state = "waiting";
      line.textContent = formatRemaining(left);
      mini.textContent = formatRemaining(left);
      note.textContent = state.exact
        ? "until the faerie will heal again."
        : "estimated — a full wait assumed.";
      announced = false;
      stopTitleFlash();
    }

    button.textContent = alertsLabel();
  }

  // The display is derived from a stored timestamp rather than accumulated
  // ticks, so a throttled or suspended tab still shows the right number the
  // moment it is read.
  function startTicker() {
    if (ticker) clearInterval(ticker);
    render();
    ticker = setInterval(render, 1000);
  }

  // --------------------------------------------------------------------- wire

  // Another tab visiting the springs updates the shared timer; follow it.
  window.addEventListener("storage", (e) => {
    if (e.key === COLLAPSE_KEY && badge) {
      badge.dataset.collapsed = collapsed() ? "1" : "0";
    }
    if (e.key === STORE_KEY || e.key === ALERTS_KEY || e.key === COLLAPSE_KEY) {
      render();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) stopTitleFlash();
  });

  function start() {
    if (onSprings) {
      applyPageState(); // reads this load, including any pending submit flag
      watchControls(); // flags the next load, if you heal from this page
    }
    startTicker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

// ==UserScript==
// @name         # Neopets Wishing Well
// @namespace    local-advisor-fork
// @version      1.0
// @description  Wishes at the Wishing Well for you, naming an item the well has actually granted lately, up to the seven a twelve-hour window allows. It submits the well's own form and spends 22 NP a wish; SUBMIT_WISHES false fills the form and leaves the click to you.
// @author       Austin Ryder
// @contributor  Auto-Wisher by @dogwithglasses (Greasy Fork 532440, MIT); this is a restyled fork
// @match        *://www.neopets.com/wishing.phtml*
// @match        *://www.neopets.com/process_wishing.phtml*
// @match        *://neopets.com/wishing.phtml*
// @match        *://neopets.com/process_wishing.phtml*
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Wishing%20Well.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Wishing%20Well.user.js
// ==/UserScript==
//
// FORKED FROM
//
// "Neopets - Wishing Well Auto-Wisher" by @dogwithglasses, Greasy Fork 532440,
// MIT. The thing worth forking is its item pool, which is the one real idea in
// a wishing-well script: the well only grants a wish for an item it is
// currently willing to grant, nobody outside TNT knows that list, and the page
// itself publishes a sample of it in the "wishes granted" table. Drawing from
// that table - uniformly over the raw rows, duplicates and all, so an item
// listed seven times is seven times as likely - is a frequency-weighted draw
// from the only evidence there is.
//
// What this fork changes is everything around that: the panel is the house one
// from the rest of this folder (see .claude/skills/neopets-panel-style), the
// control is the Refresher's Start / Stop / Resume / Done, and the counting is
// a run rather than a loop started by a button that could not be stopped once
// it was going.
//
// It also drops the GM_* grants. The original kept its count in GM storage;
// this one uses localStorage and @grant none, which costs nothing here because
// the count is not the authority - see below - and the page the script runs on
// is the only page that matters.
//
// SEVEN WISHES, AND WHO IS COUNTING
//
// The well allows seven wishes per twelve hours. Two things count them:
//
//   - The page itself, which prints "Wish Count: N". That is the server's own
//     number, it is the one that matters, and it drops back to zero when the
//     window rolls over. Where it can be read, it wins outright.
//   - This script, in localStorage, as a fallback for a page that does not
//     print it. A twelve-hour clock from the first wish of the window resets
//     that fallback, so a stuck local count cannot keep the panel saying Done
//     forever.
//
// A wish costs 22 NP. The well's minimum is 21; the extra Neopoint is the
// original's, and it is kept because the rounder number is easier to spot in a
// bank statement than a figure that matches the minimum exactly.
//
// SCOPE, and the ground rule
//
// The README's rule is that a script may change what you see, never what you
// do. This one crosses it, deliberately and in the same way the Lottery
// autobuy and the Dice-A-Roo refresher do: it fills the well's own form and
// clicks its own submit button, which spends 22 NP a go.
//
// The bounds on a forgotten tab:
//
//   - SUBMIT_WISHES false is advisory-only: it fills the form, names the item,
//     and leaves the click to you. That is the whole of the difference.
//   - It starts stopped. Running is a click, and it is remembered, so a reload
//     you did not ask for does not resume a run you had finished.
//   - Seven wishes, held in localStorage across page loads and overruled by
//     the server's own count whenever the page prints one.
//   - A countdown before every single wish, with Stop live throughout and
//     never hidden while a wish is pending.
//   - It submits only on a page that actually has the wish form. The page a
//     wish lands on has none, so a granted wish cannot re-trigger; a run walks
//     back to the well instead, after a pause.
//   - One submit per page load, latched, regardless of what else fires.
//
// It does nothing else. No shop, no bank, no pet, no other form.

(function () {
  "use strict";

  const CONFIG = {
    // The one flag that matters. false = fill the form and stop, which is the
    // advisory-only behaviour and spends nothing.
    SUBMIT_WISHES: true,
    // Seconds of countdown before each wish, with Stop live throughout.
    DELAY_SECONDS: 3,
    // How long to wait on the page a wish lands on before walking back to the
    // well for the next one, drawn from this range. A person does not wish on
    // a metronome.
    BETWEEN_MIN_SECONDS: 2,
    BETWEEN_MAX_SECONDS: 6,
  };

  // The well's own rules, not settings. Seven wishes per twelve hours is what
  // the site allows; 21 NP is its minimum donation, and 22 is what this script
  // sends (see the header). A bigger number here would buy refusals.
  const MAX_WISHES = 7;
  const WINDOW_MS = 12 * 60 * 60 * 1000;
  const DONATION = 22;
  // The wish box's own maxlength. An item name longer than this is sent
  // truncated by the browser anyway, so it is truncated here too rather than
  // being wished for in a form the page would silently cut.
  const MAX_WISH_LENGTH = 40;

  const TAG = "[Wishing Well]";
  const STORE_KEY = "wishingWell.state";
  const WELL_URL = "/wishing.phtml";

  // Used only when the "wishes granted" table cannot be found or parsed, which
  // is the one case where this script has no evidence at all about what the
  // well wants. Four items the well was granting when this was written: a
  // guess, and marked as one in the console when it is reached.
  const FALLBACK_ITEMS = [
    "Grave Danger Petpet Stamp",
    "Y28 Usukicon Goodie Bag",
    "Horace Stamp",
    "Hungry Fungus",
  ];

  let submitted = false;

  // ---------------------------------------------------------------- the store

  const BLANK = {
    running: false,
    count: 0,          // wishes this script believes you have made this window
    windowStart: 0,    // ms, the first wish of the window, for the 12h fallback
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
      return { ...BLANK, ...raw };
    } catch {
      // A broken store must not read as "no wishes yet", or the seven stops
      // being seven. Claim the window is spent and wish for nothing.
      return { ...BLANK, count: MAX_WISHES };
    }
  }

  const state = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      // Without a count that survives a page load there is no cap, so the run
      // stops rather than becoming unbounded.
      console.warn(`${TAG} cannot persist the count; stopping`, err);
      state.running = false;
    }
  }

  // ------------------------------------------------------------- the counting

  // The server's own number, printed on the page as "Wish Count: N".
  function serverCount() {
    const el = [...document.querySelectorAll("b")]
      .find((b) => /^\s*Wish Count:\s*\d+\s*$/i.test(b.textContent || ""));
    return el ? parseInt(el.textContent.match(/\d+/)[0], 10) : null;
  }

  // Reconcile what we think with what the page says. The server wins wherever
  // it speaks, because it is the only one of the two that decides anything;
  // the twelve-hour clock is only here for the page that does not say.
  function syncCount() {
    const said = serverCount();
    if (said !== null) {
      if (said !== state.count) {
        console.info(`${TAG} server says ${said} wish${said === 1 ? "" : "es"} this window`);
      }
      state.count = said;
    } else if (state.windowStart && Date.now() - state.windowStart >= WINDOW_MS) {
      console.info(`${TAG} twelve hours since the first wish; counting from zero again`);
      state.count = 0;
    }
    if (state.count === 0) state.windowStart = 0;
    save();
    return state.count;
  }

  function spent() {
    return state.count >= MAX_WISHES;
  }

  // Is there a window to pick up, as opposed to one to begin? Drives the
  // button's word, so Start and Resume are not one label doing two jobs.
  function resumable() {
    return !state.running && state.count > 0 && !spent();
  }

  // ------------------------------------------------------------ the item pool

  // The "Here are some people who have had their wishes granted" table: three
  // columns, the third headed "Got a ...". Read by that shape rather than by
  // position or id, since neither is promised.
  function grantedItems() {
    const items = [];
    for (const table of document.querySelectorAll("table")) {
      const header = table.rows[0];
      if (!header || header.cells.length !== 3) continue;
      if (!/^Got a/i.test(header.cells[2].textContent.trim())) continue;
      for (const row of [...table.rows].slice(1)) {
        if (row.cells.length < 3) continue;
        const item = row.cells[2].textContent.trim();
        if (item) items.push(item);
      }
    }
    return items;
  }

  // Uniform over the raw rows, duplicates included, which is exactly a
  // frequency-weighted draw: an item the table lists seven times is seven
  // times as likely as one listed once. De-duplicating first would throw that
  // away, and the duplicates are the only signal in there.
  function pickWish() {
    const won = grantedItems();
    const pool = won.length ? won : FALLBACK_ITEMS;
    if (!won.length) {
      console.warn(`${TAG} no granted-wishes table on this page; falling back to a guessed list`);
    }
    return {
      item: pool[Math.floor(Math.random() * pool.length)].slice(0, MAX_WISH_LENGTH),
      pool: pool.length,
      guessed: !won.length,
    };
  }

  function between() {
    const lo = Math.max(0, CONFIG.BETWEEN_MIN_SECONDS);
    const hi = Math.max(lo, CONFIG.BETWEEN_MAX_SECONDS);
    return Math.round((lo + Math.random() * (hi - lo)) * 1000);
  }

  // ----------------------------------------------------------------- the form

  // Found by the fields it must contain rather than by action or index, so a
  // markup change cannot silently point this at something else.
  function findWishForm() {
    const donation = document.querySelector('input[name="donation"]');
    const wish = document.querySelector('input[name="wish"]');
    if (!donation || !wish) return null;
    const form = donation.form;
    if (!form || wish.form !== form) return null;
    return { form, donation, wish };
  }

  function submitOf(form) {
    return form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
  }

  function doWish(found, item) {
    if (submitted) return;
    submitted = true;

    found.donation.value = String(DONATION);
    found.wish.value = item;
    for (const el of [found.donation, found.wish]) {
      // Some Neopets pages watch their own inputs; mirror a real edit.
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (!CONFIG.SUBMIT_WISHES) {
      // Advisory-only has nothing to run: the form is filled, the click is
      // yours, and a run light left on would be claiming otherwise. So this
      // stands the run down and the button goes back to offering the next one.
      console.info(`${TAG} filled "${item}" - submitting is off, the click is yours`);
      state.running = false;
      save();
      setNote("Filled - the click is yours.", "info");
      render();
      return;
    }

    // Counted before the click, because the click navigates and nothing after
    // it runs. The server's count overrules this on the next page anyway.
    if (state.count === 0) state.windowStart = Date.now();
    state.count += 1;
    save();
    render();

    const btn = submitOf(found.form);
    console.info(`${TAG} wishing for "${item}" (${state.count}/${MAX_WISHES}, ${DONATION} NP)`);
    if (btn) {
      btn.click();
    } else {
      console.info(`${TAG} no submit button found; falling back to form.submit()`);
      found.form.submit();
    }
  }

  // ---------------------------------------------------------------- the panel
  //
  // House style, per .claude/skills/neopets-panel-style: the site's own two
  // fonts from images.neopets.com, the #2367B5 header that turns Meridell
  // green when the window is spent, and the Safety Deposit Box's yellow
  // button. 150px because the site's content column is 1000px and centred, so
  // at that width the panel sits in the window's margin rather than over the
  // page - and the item name, which is the one thing here that can be long,
  // gets its own line and an ellipsis rather than making the panel wider.

  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPWW Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPWW Museo", "Museo Sans Rounded", Verdana, sans-serif';

  const CSS = `
    @font-face {
      font-family: "NPWW Cafeteria"; font-display: swap;
      src: url("${FONT_HOST}/cafeteria-black.ttf") format("truetype");
    }
    @font-face {
      font-family: "NPWW Museo"; font-style: normal; font-display: swap;
      src: url("${FONT_HOST}/museosansrounded-500.woff") format("woff"),
           url("${FONT_HOST}/museosansrounded-500.ttf") format("truetype");
    }
    #npww {
      box-sizing: border-box !important;
      position: fixed !important; bottom: 25px !important; right: 23px !important;
      z-index: 2147483646 !important;
      width: 150px !important; text-align: left !important;
      font: 12px/1.45 ${MUSEO} !important; color: #333 !important;
      /* Every inherited text property the page could be setting, restated.
         Neopets' older pages carry "body { text-align: center }", which
         inherits into anything appended to the body; the rest are the same
         bug waiting for a theme that sets them. */
      direction: ltr !important;
      letter-spacing: normal !important; word-spacing: normal !important;
      text-indent: 0 !important; text-transform: none !important;
      text-shadow: none !important; white-space: normal !important;
      border: 1px solid #27486d !important; border-radius: 10px !important;
      overflow: hidden !important; background: #fff !important;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
    }
    #npww * { box-sizing: border-box !important; }
    #npww-head {
      display: flex !important; align-items: center !important;
      gap: 6px !important; padding: 4px 8px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important; font: 13pt/1.1 ${CAFETERIA} !important;
      user-select: none !important;
    }
    #npww-title {
      flex: 1 1 auto !important; white-space: nowrap !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
    }
    #npww-dot {
      flex: none !important; width: 8px !important; height: 8px !important;
      border-radius: 50% !important; border: 1px solid #fff !important;
      background: transparent !important;
    }
    #npww[data-running="1"] #npww-dot { background: #fff !important; }
    /* Green only once the window's seven are gone. A countdown toward spending
       NP is not a success, so it stays blue while Stop still means something. */
    #npww[data-kind="done"] #npww-head {
      background: linear-gradient(#2fa86f, #1d774f) !important;
      border-bottom-color: #14543a !important;
    }
    #npww-body {
      background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
      padding: 5px 8px 7px !important; border-radius: 0 0 9px 9px !important;
    }
    #npww-label {
      color: #4a5a6a !important; font: 10.5px/1.5 ${MUSEO} !important;
    }
    /* The item, on its own line. Item names run to the box's 40 characters,
       which no panel narrow enough to stay off the page could hold, so it
       ellipsises and the whole name is in the tooltip. Museo rather than the
       monospace used for figures: this is a name, and nothing about it ticks. */
    #npww-item {
      padding-bottom: 2px !important; color: #1b4f85 !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
      white-space: nowrap !important;
      font: 10.5px/1.5 ${MUSEO} !important;
    }
    .npww-row {
      display: flex !important; align-items: baseline !important; gap: 6px !important;
      padding: 2px 0 !important; border-top: 1px solid #dce8f6 !important;
    }
    /* Hide with the [hidden] attribute, not an inline style.display: the rules
       here carry !important, and an author !important declaration beats an
       inline one, so the moment any rule above gains a display property a
       style.display = "none" would silently stop working. */
    #npww [hidden] { display: none !important; }
    .npww-row .k {
      flex: 1 1 auto !important; color: #4a5a6a !important;
      font: 10.5px/1.5 ${MUSEO} !important;
    }
    /* Tabular figures for anything that ticks or counts, so a change moves one
       digit instead of reflowing the row. */
    .npww-row .v {
      flex: none !important; min-width: 40px !important; text-align: right !important;
      color: #1b4f85 !important;
      font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
      letter-spacing: 0 !important;
    }
    #npww-note {
      margin-top: 4px !important; padding-top: 4px !important;
      border-top: 1px solid #cfe0f2 !important;
      font: 10.5px/1.35 ${MUSEO} !important; color: #22303f !important;
    }
    #npww[data-kind="done"] #npww-note { color: #156141 !important; font-weight: bold !important; }
    #npww[data-kind="info"] #npww-note { color: #4a5a6a !important; }
    /* The Safety Deposit Box's "Remove 1": template.css .button-default__2020 +
       .button-yellow__2020 plus safetydeposit.css .sdb-remove1, copied
       declaration for declaration. The four inset layers are the bevel; drop
       one and it looks flat and nearly right, which is worse than different. */
    #npww-btn {
      display: block !important; width: 100% !important;
      margin: 7px 0 0 !important; padding: 3px 10px 7px !important;
      cursor: pointer !important; position: relative !important;
      overflow: hidden !important; outline: none !important;
      text-align: center !important; white-space: nowrap !important;
      font: 11pt/1.1 ${CAFETERIA} !important; color: #363636 !important;
      background: linear-gradient(#f6e250, #ebb233) !important;
      border: #fff solid 1px !important; border-radius: 15px !important;
      box-shadow: inset 0 0 0 1px rgba(246,226,80,1),
                  inset 0 -3px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #npww-btn:hover, #npww-btn:focus {
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #npww-btn:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    /* Done. Flat, since the bevel above is what makes the button read as
       pressable, and the window's seven are not. */
    #npww-btn:disabled {
      cursor: not-allowed !important; color: #7b7b7b !important;
      background: linear-gradient(#efefef, #dcdcdc) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,1),
                  inset 0 -2px 2px 2px rgba(0,0,0,0.07),
                  0 0 0 2px rgba(0,0,0,0.45) !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById("npww-style")) return;
    const style = document.createElement("style");
    style.id = "npww-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  let panel = null;
  let elItem = null;
  let vCount = null;
  let rowClock = null;
  let vClock = null;
  let elNote = null;
  let btn = null;

  function addRow(parent, label) {
    const row = document.createElement("div");
    row.className = "npww-row";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "v";
    row.appendChild(k);
    row.appendChild(v);
    parent.appendChild(row);
    return { row, v };
  }

  function build() {
    injectStyles();

    panel = document.createElement("div");
    panel.id = "npww";

    const head = document.createElement("div");
    head.id = "npww-head";
    const dot = document.createElement("span");
    dot.id = "npww-dot";
    const title = document.createElement("span");
    title.id = "npww-title";
    // The place, not the script: on the page it is on, the script is not the
    // thing in doubt.
    title.textContent = "Wishing Well";
    head.appendChild(dot);
    head.appendChild(title);
    panel.appendChild(head);

    const body = document.createElement("div");
    body.id = "npww-body";

    const label = document.createElement("div");
    label.id = "npww-label";
    label.textContent = "Wishing for";
    body.appendChild(label);

    elItem = document.createElement("div");
    elItem.id = "npww-item";
    body.appendChild(elItem);

    vCount = addRow(body, "Wishes").v;
    const clock = addRow(body, "Wishing in");
    rowClock = clock.row;
    vClock = clock.v;
    rowClock.hidden = true;

    elNote = document.createElement("div");
    elNote.id = "npww-note";
    elNote.hidden = true;
    body.appendChild(elNote);

    btn = document.createElement("button");
    btn.id = "npww-btn";
    btn.type = "button";
    btn.addEventListener("click", () => (state.running ? stop() : start()));
    body.appendChild(btn);

    panel.appendChild(body);
    (document.body || document.documentElement).appendChild(panel);
  }

  function setItem(pick) {
    if (!panel) build();
    if (!pick) {
      elItem.textContent = "—";
      elItem.title = "";
      return;
    }
    elItem.textContent = pick.item;
    elItem.title = pick.guessed
      ? `${pick.item} — guessed: this page published no granted-wishes table`
      : `${pick.item} — drawn from ${pick.pool} wishes the well granted lately`;
  }

  function setNote(text, kind) {
    if (!panel) build();
    elNote.textContent = text || "";
    elNote.hidden = !text;
    if (kind) panel.dataset.kind = kind;
  }

  function render() {
    if (!panel) build();

    panel.dataset.running = state.running ? "1" : "0";
    panel.dataset.kind = spent() ? "done" : (elNote.textContent ? panel.dataset.kind || "info" : "info");

    vCount.textContent = `${state.count} / ${MAX_WISHES}`;
    vCount.title = `${state.count} this window, about ${state.count * DONATION} NP`
      + ` — the well allows ${MAX_WISHES} every twelve hours`;

    btn.textContent = state.running
      ? "Stop"
      : spent() ? "Done" : resumable() ? "Resume" : "Start";
    btn.disabled = spent();
    btn.title = spent()
      ? `All ${MAX_WISHES} wishes used this window — the well's own limit.`
      : state.running
        ? "Stop wishing. The window's count is kept."
        : resumable()
          ? `Carry on from wish ${state.count}.`
          : CONFIG.SUBMIT_WISHES
            ? `Wish until the window's ${MAX_WISHES} are gone.`
            : "Fill the form with an item the well has granted lately.";
  }

  // ------------------------------------------------------------------ the run

  let timer = 0;
  let hop = 0;

  function clearTimers() {
    if (timer) { clearInterval(timer); timer = 0; }
    if (hop) { clearTimeout(hop); hop = 0; }
  }

  function start() {
    if (spent()) return;
    state.running = true;
    save();
    setNote("", "info");
    render();
    console.info(`${TAG} run started at ${state.count}/${MAX_WISHES}`);
    step();
  }

  // A pause, and it says nothing: a button reading Resume states it already.
  // The count stays, because it counts the window rather than the run - the
  // well does not hand the wishes back because you stopped watching.
  function stop() {
    state.running = false;
    save();
    clearTimers();
    if (rowClock) rowClock.hidden = true;
    setNote("", "info");
    render();
    console.info(`${TAG} paused at ${state.count}/${MAX_WISHES}`);
  }

  // One step of the run, from whichever page it finds itself on:
  //
  //   a wish form   count down, then wish. The submit navigates, so this is
  //                 the last thing this document does.
  //   no form       the page a wish landed on. Wait a few seconds, then walk
  //                 back to the well for the next one.
  function step() {
    if (!state.running) return;
    if (spent()) {
      state.running = false;
      save();
      render();
      console.info(`${TAG} the window's ${MAX_WISHES} are gone`);
      return;
    }

    const found = findWishForm();
    if (!found) {
      // The page a wish landed on. Replace rather than assign, so seven wishes
      // leave one entry in front of the Back button rather than fourteen.
      const wait = between();
      console.info(`${TAG} no wish form here; back to the well in ${(wait / 1000).toFixed(1)}s`);
      hop = setTimeout(() => location.replace(WELL_URL), wait);
      return;
    }

    const pick = pickWish();
    setItem(pick);

    let left = Math.max(0, CONFIG.DELAY_SECONDS);
    if (left === 0) {
      doWish(found, pick.item);
      return;
    }
    rowClock.hidden = false;
    vClock.textContent = `${left}s`;
    timer = setInterval(() => {
      if (!state.running) return;
      left -= 1;
      if (left > 0) {
        vClock.textContent = `${left}s`;
        return;
      }
      clearTimers();
      rowClock.hidden = true;
      doWish(found, pick.item);
    }, 1000);
  }

  function run() {
    syncCount();
    render();

    const found = findWishForm();
    if (!found) {
      setItem(null);
      console.info(`${TAG} no wish form on this page`);
    } else {
      // Something to show while idle, picked the same way the next wish will
      // be. The form itself is left alone until a wish is actually going out,
      // so this never overwrites a wish you were typing yourself.
      setItem(pickWish());
    }

    if (spent()) {
      if (state.running) {
        state.running = false;
        save();
      }
      render();
      return;
    }
    if (state.running) step();
  }

  // The original waited a random 200-1000ms before doing anything, and that is
  // kept: the granted-wishes table is server-rendered, but the page also runs
  // its own scripts, and arriving in the same frame as every other load event
  // is the one thing nothing else on the page does.
  const settle = Math.floor(Math.random() * 800) + 200;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(run, settle), { once: true });
  } else {
    setTimeout(run, settle);
  }
})();

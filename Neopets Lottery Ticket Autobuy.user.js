// ==UserScript==
// @name         # Neopets Lottery Ticket Autobuy
// @namespace    local-advisor-fork
// @version      2.1
// @description  Fills the Neopian Lottery ticket with 6 unique random numbers and, once you start a run, buys ticket after ticket up to the day's limit of 20 - each one behind a cancellable countdown. Successor to the Lottery Ticket Randomizer, which filled the boxes and left the click to you.
// @author       Austin Ryder
// @match        *://www.neopets.com/games/lottery.phtml*
// @match        *://neopets.com/games/lottery.phtml*
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Lottery%20Ticket%20Autobuy.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Lottery%20Ticket%20Autobuy.user.js
// ==/UserScript==
//
// WHY
//
// The old Lottery Ticket Randomizer (decoded-scripts/07) filled the six boxes on
// page load and stopped there: "You still need to click 'Buy a Lottery Ticket!'".
// The numbers are irrelevant to the outcome - a uniform draw over 1-30 does not
// care which set you hold - so the click carries no decision. This script takes it.
//
// A DAY IS TWENTY TICKETS
//
// Twenty is not a setting in this file. It is the lottery's own limit, per
// account per day, and the site refuses the twenty-first whatever any script
// believes - so DAILY_LIMIT is a constant beside the code that reads it rather
// than a number in the config block, where it would look like a dial you could
// turn.
//
// The wait before each buy is drawn rather than printed: a bar that drains as
// the buy comes due, the same bar the Refresher uses between its rounds, and
// it shows this script's other wait too - the pause on the page a buy lands on
// before walking back for the next ticket. The seconds live in its tooltip.
//
// That limit is also what makes this a run rather than a one-shot. Twenty
// tickets is twenty page loads of filling six boxes and clicking the same
// button, which is exactly the shape of work worth handing over. So the panel
// carries the same control as the Refresher in this folder: Start, Stop, and a
// Resume that keeps the count - and once the twenty are gone the button greys
// out and reads Done, because the day really is over and a button offering to
// start another would be a lie.
//
// Stop is a pause, as it is there: the tickets you have already bought stay
// counted, because the count is against the day and not against the run.
//
// SCOPE
//
// This one acts: it spends NP (20 per ticket, so 400 for a full day) and
// submits a form with no human in the loop. Nothing happens until you press
// Start, and the bounds on a forgotten tab are:
//
//   - The day's twenty, counted in localStorage against the NST date, so a
//     reload (or a tab restored by the browser) cannot buy past it.
//   - A countdown with the Stop button live throughout, so any individual buy
//     can still be caught by hand.
//   - It submits only on a page that actually has the buy form. The post-buy
//     confirmation page has none, so a successful buy cannot re-trigger; a run
//     walks back to the ticket page instead, after a pause.
//   - One submit per page load, latched, regardless of what else fires.
//
// HOW the submit is done
//
// The form is found from its own fields (the inputs named one..six) rather than by
// form name or index, so a markup change does not silently target something else.
// It is submitted by clicking the real submit button, not form.submit(): clicking
// sends that button's own name/value pair, which form.submit() drops, and Neopets
// forms sometimes dispatch on it. form.submit() is only a fallback when no button
// can be found.

(function () {
  "use strict";

  const CONFIG = {
    // The wait before each buy, seconds, drawn from this range. It is long
    // enough to catch a buy you did not want and short enough not to be the
    // thing you are waiting for: five seconds was the first number here and
    // twenty of them is nearly two minutes of looking at a bar. Set both to 0
    // to buy the moment the page is ready.
    DELAY_MIN_SECONDS: 1,
    DELAY_MAX_SECONDS: 2,
    // How long to wait on the page a buy lands on before walking back for the
    // next ticket, drawn from this range. A run is a person buying twenty
    // tickets, and a person does not do it on a metronome.
    BETWEEN_MIN_SECONDS: 2,
    BETWEEN_MAX_SECONDS: 6,
    // Sort the six numbers ascending (easier to eyeball against past tickets).
    SORT: true,
  };

  // The lottery's own limit: twenty tickets per account per day. Not a setting.
  // The site refuses the twenty-first regardless of what this file says, so a
  // bigger number here would buy nothing and report a run that never finished.
  const DAILY_LIMIT = 20;

  const TAG = "[Lottery Autobuy]";
  const STORE_KEY = "lotteryAutobuy.state";
  const LEGACY_KEY = "lotteryAutobuy.count";
  const FIELDS = ["one", "two", "three", "four", "five", "six"];
  const MIN = 1;
  const MAX = 30;
  const TICKET_URL = "/games/lottery.phtml";

  let submitted = false;

  // ------------------------------------------------------------------ the day

  // Neopets days turn over at midnight NST, which is America/Los_Angeles. Counting
  // against the local date would let a late-evening reload buy a twenty-first
  // ticket on the same Neopets day (or refuse one on a new day).
  function nstDate() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  // ---------------------------------------------------------------- the store

  const BLANK = {
    date: "",            // the NST day `bought` belongs to
    bought: 0,           // tickets this script has bought today
    running: false,      // is a run going
  };

  function load() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
      // A broken store must not read as "nothing bought yet", or the day's
      // limit stops being a limit. Claim the day is spent and buy nothing.
      return { ...BLANK, date: nstDate(), bought: DAILY_LIMIT };
    }
    // The first version counted under its own key, as {date, count}. Carry it
    // over so an upgrade mid-day does not hand you back tickets you have spent.
    if (!raw.date) {
      try {
        const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "{}") || {};
        if (old.date) raw = { date: old.date, bought: old.count | 0 };
      } catch {
        /* nothing to carry over */
      }
    }
    const state = { ...BLANK, ...raw };
    // A new NST day: the count goes, and a run that was going carries on into
    // the new day with a fresh twenty rather than stopping at midnight.
    if (state.date !== nstDate()) {
      state.date = nstDate();
      state.bought = 0;
    }
    return state;
  }

  const state = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      // If the count cannot be written, the day's limit cannot be held across
      // page loads, so the run stops rather than becoming unbounded.
      console.warn(`${TAG} cannot persist the count; stopping`, err);
      state.running = false;
    }
  }

  function spent() {
    return state.bought >= DAILY_LIMIT;
  }

  // Is there a day to pick up, as opposed to one to begin? Drives the button's
  // word, so that Start and Resume are not one label doing two jobs.
  function resumable() {
    return !state.running && state.bought > 0 && !spent();
  }

  function recordBuy() {
    state.bought += 1;
    save();
  }

  // --------------------------------------------------------------- the numbers

  function pickNums() {
    const nums = [];
    while (nums.length < 6) {
      const n = Math.floor(Math.random() * (MAX - MIN + 1)) + MIN;
      if (!nums.includes(n)) nums.push(n);
    }
    return CONFIG.SORT ? nums.sort((a, b) => a - b) : nums;
  }

  function between() {
    const lo = Math.max(0, CONFIG.BETWEEN_MIN_SECONDS);
    const hi = Math.max(lo, CONFIG.BETWEEN_MAX_SECONDS);
    return Math.round((lo + Math.random() * (hi - lo)) * 1000);
  }

  // ------------------------------------------------------------------ the form

  // Locate the ticket form by the fields it must contain. Returns null if this
  // page has no buy form at all - the post-buy confirmation, or a day the lottery
  // is not selling - which is what stops the script re-firing.
  function findTicketForm() {
    const inputs = FIELDS.map((name) => document.querySelector(`input[name="${name}"]`));
    if (inputs.some((el) => !el)) return null;
    const form = inputs[0].form;
    if (!form) return null;
    // Every box must belong to the same form, or we would be filling one form and
    // submitting another.
    if (inputs.some((el) => el.form !== form)) {
      console.warn(`${TAG} ticket fields span more than one form; not touching it`);
      return null;
    }
    return { form, inputs };
  }

  function fill(inputs, nums) {
    inputs.forEach((el, i) => {
      el.value = String(nums[i]);
      // Some Neopets pages watch their own inputs; mirror a real edit.
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function buyButton(form) {
    return form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
  }

  function doSubmit(form) {
    if (submitted) return;
    submitted = true;
    recordBuy();          // recorded before navigating; the page is about to go away
    const btn = buyButton(form);
    console.info(`${TAG} buying ticket ${state.bought} of ${DAILY_LIMIT}`);
    if (btn) {
      btn.click();
    } else {
      console.info(`${TAG} no submit button found; falling back to form.submit()`);
      form.submit();
    }
  }

  // ------------------------------------------------------------------ the panel
  //
  // House style, per .claude/skills/neopets-panel-style: the site's own two
  // fonts from images.neopets.com, the #2367B5 header, Meridell green once the
  // day is spent, and the Safety Deposit Box's yellow button.
  //
  // The countdown gets tabular monospace for the usual reason and one specific
  // to this script: it is the clock on an irreversible spend, it reads down
  // through single digits, and a readout that reflows the panel every second
  // under the cursor is the last thing wanted above a Stop button.

  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPLB Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPLB Museo", "Museo Sans Rounded", Verdana, sans-serif';

  const CSS = `
    @font-face {
      font-family: "NPLB Cafeteria"; font-display: swap;
      src: url("${FONT_HOST}/cafeteria-black.ttf") format("truetype");
    }
    @font-face {
      font-family: "NPLB Museo"; font-style: normal; font-display: swap;
      src: url("${FONT_HOST}/museosansrounded-500.woff") format("woff"),
           url("${FONT_HOST}/museosansrounded-500.ttf") format("truetype");
    }
    #nplb {
      box-sizing: border-box !important;
      position: fixed !important; bottom: 25px !important; right: 23px !important;
      z-index: 2147483647 !important;
      /* Wide enough for the worst line of numbers it can draw: six two-digit
         picks and five ", " separators is 22 characters, which at 10.5px in
         this monospace stack needs about 150px of inner width - measured, not
         guessed. 150px of panel did not have it and the line wrapped to two,
         so the panel grew rather than the figures shrinking: the numbers are
         what it is for. 172 leaves a few pixels over the measured worst case,
         because the stack falls through to whatever monospace the machine
         has and they are not all the same width. */
      width: 172px !important; text-align: left !important;
      font: 12px/1.45 ${MUSEO} !important; color: #333 !important;
      /* Every inherited text property the page could be setting, restated.
         Neopets' older pages carry "body { text-align: center }", which
         inherits into anything appended to the body; text-align was already
         here for that reason, and the rest are the same bug waiting for a
         theme that sets them. */
      direction: ltr !important;
      letter-spacing: normal !important; word-spacing: normal !important;
      text-indent: 0 !important; text-transform: none !important;
      text-shadow: none !important; white-space: normal !important;
      border: 1px solid #27486d !important; border-radius: 10px !important;
      overflow: hidden !important; background: #fff !important;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
    }
    #nplb * { box-sizing: border-box !important; }
    #nplb-head {
      display: flex !important; align-items: center !important;
      gap: 6px !important; padding: 4px 8px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important; font: 13pt/1.1 ${CAFETERIA} !important;
      user-select: none !important;
    }
    #nplb-title {
      flex: 1 1 auto !important; white-space: nowrap !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
    }
    /* The run light, as on the Refresher: filled while a run is going, hollow
       while it is not. */
    #nplb-dot {
      flex: none !important; width: 8px !important; height: 8px !important;
      border-radius: 50% !important; border: 1px solid #fff !important;
      background: transparent !important;
    }
    #nplb[data-running="1"] #nplb-dot { background: #fff !important; }
    /* Green only once the day's twenty are gone. A countdown toward spending
       NP is not a success yet, so it stays blue while Stop still means
       something. */
    #nplb[data-kind="done"] #nplb-head {
      background: linear-gradient(#2fa86f, #1d774f) !important;
      border-bottom-color: #14543a !important;
    }
    #nplb-body {
      background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
      padding: 5px 8px 7px !important; border-radius: 0 0 9px 9px !important;
    }
    #nplb-label {
      color: #4a5a6a !important; font: 10.5px/1.5 ${MUSEO} !important;
    }
    /* The six numbers, on their own line and never wrapped: see the width note
       above. nowrap rather than a shrinking font, so a wrap shows up as an
       overflow during testing instead of quietly reflowing the panel. */
    #nplb-nums {
      padding-bottom: 2px !important; color: #1b4f85 !important;
      white-space: nowrap !important;
      font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
    }
    .nplb-row {
      display: flex !important; align-items: baseline !important; gap: 6px !important;
      padding: 2px 0 !important; border-top: 1px solid #dce8f6 !important;
    }
    /* Hiding a row has to be done with [hidden] rather than an inline
       style.display, because the rules above carry !important and an author
       !important declaration beats an inline one. The first cut set
       style.display = "none" and the empty "Buying in" row stayed on screen on
       every panel that has no countdown. This is the cost of the
       !important-everything rule the site forces, and it applies to every
       show/hide in these panels. */
    #nplb [hidden] { display: none !important; }
    .nplb-row .k {
      flex: 1 1 auto !important; color: #4a5a6a !important;
      font: 10.5px/1.5 ${MUSEO} !important;
    }
    .nplb-row .v {
      flex: none !important; min-width: 44px !important; text-align: right !important;
      color: #1b4f85 !important;
      font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
    }
    /* The wait, drawn rather than counted: a bar that drains as the buy comes
       due, the same as the Refresher's. It shows both of this script's waits -
       the countdown before a buy and the pause before walking back for the
       next ticket - because what they have in common is all the panel needs to
       say: something is due, and this much of it is left. The seconds are in
       the tooltip for when the figure is a question you are actually asking.
       The track keeps its place while nothing is due, so the panel does not
       change height every time a wait starts or ends. */
    #nplb-bar {
      margin-top: 6px !important; height: 7px !important;
      border: 1px solid #bcd3ec !important; border-radius: 4px !important;
      background: #dce8f6 !important; overflow: hidden !important;
    }
    /* No transform here, deliberately. An author !important declaration beats
       an inline one, so declaring it in this stylesheet would make the fill
       unmovable from script - the same trap the [hidden] note above describes.
       The starting transform is set inline where the element is built. */
    #nplb-fill {
      display: block !important; width: 100% !important; height: 100% !important;
      transform-origin: left center !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
    }
    #nplb[data-kind="done"] #nplb-fill {
      background: linear-gradient(#2fa86f, #1d774f) !important;
    }
    #nplb-note {
      margin-top: 4px !important; padding-top: 4px !important;
      border-top: 1px solid #cfe0f2 !important;
      font: 10.5px/1.35 ${MUSEO} !important; color: #22303f !important;
    }
    #nplb[data-kind="done"] #nplb-note { color: #156141 !important; font-weight: bold !important; }
    #nplb[data-kind="info"] #nplb-note { color: #4a5a6a !important; }
    /* The Safety Deposit Box's "Remove 1": template.css .button-default__2020 +
       .button-yellow__2020 plus safetydeposit.css .sdb-remove1, copied
       declaration for declaration. */
    #nplb-btn {
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
    #nplb-btn:hover, #nplb-btn:focus {
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #nplb-btn:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    /* Done. Flat, since the bevel above is what makes the button read as
       pressable, and the day's twenty are not pressable. */
    #nplb-btn:disabled {
      cursor: not-allowed !important; color: #7b7b7b !important;
      background: linear-gradient(#efefef, #dcdcdc) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,1),
                  inset 0 -2px 2px 2px rgba(0,0,0,0.07),
                  0 0 0 2px rgba(0,0,0,0.45) !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById("nplb-style")) return;
    const style = document.createElement("style");
    style.id = "nplb-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  let panel = null;
  let elNums = null;
  let vCount = null;
  let elBar = null;
  let elFill = null;
  let elNote = null;
  let btn = null;

  function addRow(parent, label) {
    const row = document.createElement("div");
    row.className = "nplb-row";
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
    panel.id = "nplb";

    const head = document.createElement("div");
    head.id = "nplb-head";
    const dot = document.createElement("span");
    dot.id = "nplb-dot";
    const title = document.createElement("span");
    title.id = "nplb-title";
    // The game's name, not the script's: on the page it is on, the script is
    // not the thing in doubt.
    title.textContent = "Neopian Lottery";
    head.appendChild(dot);
    head.appendChild(title);
    panel.appendChild(head);

    const body = document.createElement("div");
    body.id = "nplb-body";

    const label = document.createElement("div");
    label.id = "nplb-label";
    label.textContent = "Filled";
    body.appendChild(label);

    elNums = document.createElement("div");
    elNums.id = "nplb-nums";
    body.appendChild(elNums);

    vCount = addRow(body, "Tickets").v;

    elBar = document.createElement("div");
    elBar.id = "nplb-bar";
    elFill = document.createElement("span");
    elFill.id = "nplb-fill";
    elFill.style.transform = "scaleX(0)";
    elBar.appendChild(elFill);
    body.appendChild(elBar);

    elNote = document.createElement("div");
    elNote.id = "nplb-note";
    elNote.hidden = true;
    body.appendChild(elNote);

    btn = document.createElement("button");
    btn.id = "nplb-btn";
    btn.type = "button";
    btn.addEventListener("click", () => (state.running ? stop() : start()));
    body.appendChild(btn);

    panel.appendChild(body);
    (document.body || document.documentElement).appendChild(panel);
  }

  function render() {
    if (!panel) build();

    panel.dataset.running = state.running ? "1" : "0";
    panel.dataset.kind = spent() ? "done" : "info";

    vCount.textContent = `${state.bought} / ${DAILY_LIMIT}`;
    vCount.title = `${state.bought} bought today, about ${state.bought * 20} NP`
      + ` — the lottery allows ${DAILY_LIMIT} a day`;

    elNote.hidden = !elNote.textContent;
    paintBar();

    // The day's twenty are the finish line, so the control says so rather than
    // offering a twenty-first the site would refuse anyway.
    btn.textContent = state.running
      ? "Stop"
      : spent() ? "Done" : resumable() ? "Resume" : "Start";
    btn.disabled = spent();
    btn.title = spent()
      ? `All ${DAILY_LIMIT} tickets bought today — the lottery's own limit.`
      : state.running
        ? "Stop buying. The day's count is kept."
        : resumable()
          ? `Carry on from ticket ${state.bought}.`
          : "Buy tickets until the day's twenty are gone.";
  }

  function setNote(text, kind) {
    if (!panel) build();
    elNote.textContent = text || "";
    elNote.hidden = !text;
    if (kind) panel.dataset.kind = kind;
  }

  // --------------------------------------------------------------- the waiting
  //
  // Two clocks, deliberately. The due check is a half-second interval, because
  // a browser throttles a background tab's timers to about once a minute
  // whatever period is asked for - that delays a buy, it does not lose it. The
  // paint is requestAnimationFrame, which runs at the refresh rate in front of
  // you and stops dead when the tab is hidden, which is exactly right for
  // something only worth drawing when it can be seen.

  let waitFrom = 0;
  let waitUntil = 0;
  let onDue = null;
  let frame = 0;
  let tick = 0;

  function startWait(ms, fn) {
    waitFrom = Date.now();
    waitUntil = waitFrom + ms;
    onDue = fn;
    if (!tick) tick = setInterval(checkDue, 500);
    paintBar();
  }

  function cancelWait() {
    waitFrom = 0;
    waitUntil = 0;
    onDue = null;
    if (tick) { clearInterval(tick); tick = 0; }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    paintBar();
  }

  function checkDue() {
    if (!waitUntil) return;
    if (Date.now() < waitUntil) {
      // Painted from here as well as from rAF. A tab the browser has throttled
      // - backgrounded, or just not the window in front - gets a frame or two
      // a second instead of sixty, and a bar that moves twice a second beats
      // one that sits still and then jumps. It writes only on change, so on a
      // tab being watched this costs nothing.
      paintBar();
      return;
    }
    const fn = onDue;
    cancelWait();
    if (fn) fn();
  }

  function barFraction() {
    if (!waitUntil) return 0;
    const span = waitUntil - waitFrom;
    if (!(span > 0)) return 0;
    return Math.max(0, Math.min(1, (waitUntil - Date.now()) / span));
  }

  function paintBar() {
    // Any pending frame is dropped first, because this is called from the due
    // check as well as from rAF: without it each interval tick would start a
    // second painting loop beside the one already running, and they multiply.
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (!elFill) return;
    const t = `scaleX(${barFraction().toFixed(3)})`;
    if (elFill.style.transform !== t) elFill.style.transform = t;
    const left = waitUntil - Date.now();
    const label = !waitUntil
      ? (state.running ? "working" : "nothing due")
      : left >= 1000 ? `buying in ${Math.floor(left / 1000)}s` : "about to buy";
    if (elBar.title !== label) elBar.title = label;
    if (waitUntil) frame = requestAnimationFrame(paintBar);
  }

  // Hidden tabs do not fire rAF, so the paint loop dies on a tab switch and
  // has to be restarted when you come back; the due check above is what keeps
  // the run going meanwhile.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && waitUntil && !frame) paintBar();
  });

  function delay() {
    const lo = Math.max(0, CONFIG.DELAY_MIN_SECONDS);
    const hi = Math.max(lo, CONFIG.DELAY_MAX_SECONDS);
    return Math.round((lo + Math.random() * (hi - lo)) * 1000);
  }

  // ------------------------------------------------------------------- the run

  function start() {
    if (spent()) return;
    state.running = true;
    save();
    setNote("", "info");
    render();
    console.info(`${TAG} run started at ${state.bought}/${DAILY_LIMIT}`);
    step();
  }

  // A pause, and it says nothing: a button reading Resume states it already.
  // The count stays, because it is a count of the day rather than of the run -
  // Neopets does not hand the tickets back because you stopped watching.
  function stop() {
    state.running = false;
    save();
    cancelWait();
    setNote("", "info");
    render();
    console.info(`${TAG} paused at ${state.bought}/${DAILY_LIMIT}`);
  }

  // One step of the run, from whatever page it finds itself on:
  //
  //   a ticket form   count down, then buy. The buy navigates, so this is the
  //                   last thing this document does.
  //   no form         the page a buy landed on. Wait a few seconds, then walk
  //                   back to the ticket page for the next one.
  function step() {
    if (!state.running) return;
    if (spent()) {
      state.running = false;
      save();
      render();
      console.info(`${TAG} the day's ${DAILY_LIMIT} are gone`);
      return;
    }

    const found = findTicketForm();
    if (!found) {
      // The confirmation page. Nothing here to buy, so go back for another
      // ticket - replace rather than assign, so twenty buys leave one entry in
      // front of the Back button rather than forty.
      const wait = between();
      console.info(`${TAG} no ticket form here; back to the ticket page in ${(wait / 1000).toFixed(1)}s`);
      startWait(wait, () => location.replace(TICKET_URL));
      return;
    }

    const ms = delay();
    if (ms < 100) {
      doSubmit(found.form);
      return;
    }
    startWait(ms, () => doSubmit(found.form));
  }

  // Filling the boxes is the thing this script inherited from the randomizer
  // and it happens on every load, run or no run: the numbers carry no decision,
  // so there is nothing to consent to. Buying is the part that waits for Start.
  function run() {
    const found = findTicketForm();
    if (found) {
      const nums = pickNums();
      fill(found.inputs, nums);
      console.info(`${TAG} filled ${nums.join(", ")}`);
      render();
      elNums.textContent = nums.join(", ");
    } else {
      render();
      elNums.textContent = "—";
      console.info(`${TAG} no ticket form on this page`);
    }

    if (spent()) {
      if (state.running) {
        state.running = false;
        save();
        render();
      }
      return;
    }
    if (state.running) step();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();

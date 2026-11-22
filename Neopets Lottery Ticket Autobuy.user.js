// ==UserScript==
// @name         # Neopets Lottery Ticket Autobuy
// @namespace    local-advisor-fork
// @version      1.1
// @description  Fills the Neopian Lottery ticket with 6 unique random numbers and, after a cancellable countdown, submits the buy itself. Successor to the Lottery Ticket Randomizer, which filled the boxes and left the click to you.
// @author       Austin Ryder
// @match        *://www.neopets.com/games/lottery.phtml*
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
// SCOPE, and the ground rule
//
// Read the README's ground rule before enabling this. It says a script may change
// what you see, never what you do, because submitting on your behalf is "your
// computer playing the site without you" - which the Neopets ToS FAQ prohibits and
// the Neopian Task Force enforces with permanent account loss. This script is on
// the wrong side of that line by design. It spends NP (20 per ticket) and submits
// a form with no human in the loop. AUTO_BUY is the whole risk surface; set it to
// false and you are back to the old randomizer's behaviour.
//
// The guards below exist because an autobuyer's failure mode is a refresh loop
// quietly draining NP:
//
//   - A countdown with a Cancel button, so any page load can be aborted by hand.
//   - A per-day ticket cap, counted in localStorage against the NST date, so a
//     reload (or a tab restored by the browser) cannot buy past the cap.
//   - It submits only on a page that actually has the buy form. The post-buy
//     confirmation page has no form, so a successful buy cannot re-trigger.
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
    // The only setting that matters. false = fill the boxes and stop (old behaviour).
    AUTO_BUY: true,
    // Seconds of countdown before the buy, during which Cancel aborts it.
    // 0 submits immediately; keep a few seconds unless you know you want none.
    DELAY_SECONDS: 5,
    // Hard ceiling on tickets bought per NST day by this script. Tickets cost
    // 20 NP each. The cap is the backstop against a reload loop.
    MAX_TICKETS_PER_DAY: 1,
    // Sort the six numbers ascending (easier to eyeball against past tickets).
    SORT: true,
    BADGE: true,
  };

  const TAG = "[Lottery Autobuy]";
  const STORE_KEY = "lotteryAutobuy.count";
  const FIELDS = ["one", "two", "three", "four", "five", "six"];
  const MIN = 1;
  const MAX = 30;

  let submitted = false;

  // ------------------------------------------------------------------ the day

  // Neopets days turn over at midnight NST, which is America/Los_Angeles. Counting
  // against the local date would let a late-evening reload buy a second ticket on
  // the same Neopets day (or refuse one on a new day).
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

  function boughtToday() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return raw.date === nstDate() ? (raw.count | 0) : 0;
    } catch {
      // A broken or blocked store must not read as "nothing bought yet", or the
      // cap stops being a cap. Claim the cap is reached and buy nothing.
      return CONFIG.MAX_TICKETS_PER_DAY;
    }
  }

  function recordBuy() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        date: nstDate(),
        count: boughtToday() + 1,
      }));
    } catch (err) {
      console.warn(`${TAG} could not record the buy; cap may not hold`, err);
    }
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
    if (btn) {
      console.info(`${TAG} submitting via button`, btn.value || btn.textContent);
      btn.click();
    } else {
      console.info(`${TAG} no submit button found; falling back to form.submit()`);
      form.submit();
    }
  }

  // ------------------------------------------------------------------ the badge
  //
  // House style, per .claude/skills/neopets-panel-style: the site's own two
  // fonts from images.neopets.com, the #2367B5 header, Meridell green once the
  // buy has gone in, and the Safety Deposit Box's yellow button for Cancel.
  // 150px because the site's content column is 1000px and centred, so at that
  // width the badge sits in the window's margin rather than over the page.
  //
  // The countdown gets tabular monospace for the usual reason and one specific
  // to this script: it is the clock on an irreversible spend, it reads down
  // through single digits, and a readout that reflows the panel every second
  // under the cursor is the last thing wanted above a Cancel button.

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
      position: fixed !important; bottom: 20px !important; right: 18px !important;
      z-index: 2147483647 !important;
      width: 150px !important; text-align: left !important;
      font: 12px/1.45 ${MUSEO} !important; color: #333 !important;
      border: 1px solid #27486d !important; border-radius: 10px !important;
      overflow: hidden !important; background: #fff !important;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
    }
    #nplb * { box-sizing: border-box !important; }
    #nplb-head {
      padding: 4px 8px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important; font: 13pt/1.1 ${CAFETERIA} !important;
      white-space: nowrap !important; overflow: hidden !important;
      text-overflow: ellipsis !important; user-select: none !important;
    }
    /* Green only once the buy has actually gone in. A countdown toward spending
       NP is not a success yet, so it stays blue while Cancel still means
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
    /* The six numbers, on their own line: at 10.5px monospace "1, 4, 9, 12, 20,
       28" is about 120px, which fits the 134px of inner width, and a label
       beside it would not. */
    #nplb-nums {
      padding-bottom: 2px !important; color: #1b4f85 !important;
      font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
    }
    #nplb-count {
      display: flex !important; align-items: baseline !important; gap: 6px !important;
      padding: 2px 0 !important; border-top: 1px solid #dce8f6 !important;
    }
    /* Hiding a row has to be done with [hidden] rather than an inline
       style.display, because the rules above carry !important and an author
       !important declaration beats an inline one. The first cut set
       style.display = "none" and the empty "Buying in" row stayed on screen on
       every badge that has no countdown. This is the cost of the
       !important-everything rule the site forces, and it applies to every
       show/hide in these panels. */
    #nplb [hidden] { display: none !important; }
    #nplb-count .k {
      flex: 1 1 auto !important; color: #4a5a6a !important;
      font: 10.5px/1.5 ${MUSEO} !important;
    }
    #nplb-count .v {
      flex: none !important; min-width: 34px !important; text-align: right !important;
      color: #1b4f85 !important;
      font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
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
    #nplb-cancel {
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
    #nplb-cancel:hover, #nplb-cancel:focus {
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #nplb-cancel:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById("nplb-style")) return;
    const style = document.createElement("style");
    style.id = "nplb-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // Carries the Cancel control, so it is not optional when a buy is pending.
  // onCancel null means there is nothing to cancel.
  function makeBadge({ nums, note, kind, onCancel }) {
    injectStyles();

    const el = document.createElement("div");
    el.id = "nplb";
    el.dataset.kind = kind || "info";

    const head = document.createElement("div");
    head.id = "nplb-head";
    head.textContent = "Lottery ticket";
    el.appendChild(head);

    const body = document.createElement("div");
    body.id = "nplb-body";

    const label = document.createElement("div");
    label.id = "nplb-label";
    label.textContent = "Filled";
    body.appendChild(label);

    const elNums = document.createElement("div");
    elNums.id = "nplb-nums";
    elNums.textContent = nums;
    body.appendChild(elNums);

    const count = document.createElement("div");
    count.id = "nplb-count";
    count.hidden = true;
    const ck = document.createElement("span");
    ck.className = "k";
    ck.textContent = "Buying in";
    const cv = document.createElement("span");
    cv.className = "v";
    count.appendChild(ck);
    count.appendChild(cv);
    body.appendChild(count);

    const elNote = document.createElement("div");
    elNote.id = "nplb-note";
    elNote.textContent = note || "";
    elNote.hidden = !note;
    body.appendChild(elNote);

    let btn = null;
    if (onCancel) {
      btn = document.createElement("button");
      btn.id = "nplb-cancel";
      btn.type = "button";
      btn.textContent = "Cancel";
      btn.addEventListener("click", onCancel);
      body.appendChild(btn);
    } else {
      // Click-to-dismiss, but only when there is no Cancel: dismissing a badge
      // that still has a pending buy behind it would hide the control without
      // stopping the buy, which is the one thing this panel must not do.
      el.style.cursor = "pointer";
      el.title = "Click to dismiss.";
      el.addEventListener("click", () => el.remove());
    }

    el.appendChild(body);
    (document.body || document.documentElement).appendChild(el);

    return {
      el,
      setNote: (t, k) => {
        elNote.textContent = t;
        elNote.hidden = !t;
        if (k) el.dataset.kind = k;
      },
      setCountdown: (secs) => {
        count.hidden = secs == null;
        if (secs != null) cv.textContent = `${secs}s`;
      },
      // Removing Cancel is what makes the badge dismissable, so the two go
      // together: past the point of no return the control would be a lie, and
      // what is left is a message you may well want out of the way.
      removeCancel: () => {
        btn?.remove();
        btn = null;
        el.style.cursor = "pointer";
        el.title = "Click to dismiss.";
        // On the next task, not now. removeCancel() is called from inside the
        // Cancel button's own click handler, and that click is still bubbling
        // toward this element: a listener added during dispatch on an ancestor
        // the event has not reached yet still fires for that event. Attaching
        // synchronously made the click that cancels also dismiss the panel,
        // taking the "Cancelled" message away with it.
        setTimeout(() => el.addEventListener("click", () => el.remove()), 0);
      },
    };
  }

  // ------------------------------------------------------------------- the run

  function run() {
    const found = findTicketForm();
    if (!found) {
      console.info(`${TAG} no ticket form on this page; nothing to do`);
      return;
    }
    const { form, inputs } = found;
    const nums = pickNums();
    fill(inputs, nums);
    const picked = nums.join(", ");
    console.info(`${TAG} filled ${picked}`);

    if (!CONFIG.AUTO_BUY) {
      if (CONFIG.BADGE) {
        makeBadge({ nums: picked, note: "Autobuy off - click Buy yourself.", kind: "info" });
      }
      return;
    }

    const already = boughtToday();
    if (already >= CONFIG.MAX_TICKETS_PER_DAY) {
      console.info(`${TAG} daily cap reached (${already}/${CONFIG.MAX_TICKETS_PER_DAY}); not buying`);
      if (CONFIG.BADGE) {
        makeBadge({
          nums: picked,
          note: `Daily cap reached (${already}/${CONFIG.MAX_TICKETS_PER_DAY}) - buy by hand if you want more.`,
          kind: "info",
        });
      }
      return;
    }

    let left = Math.max(0, CONFIG.DELAY_SECONDS);
    if (left === 0) { doSubmit(form); return; }

    let cancelled = false;
    const badge = CONFIG.BADGE
      ? makeBadge({
          nums: picked,
          kind: "pending",
          onCancel: () => {
            cancelled = true;
            clearInterval(timer);
            badge.setCountdown(null);
            badge.setNote("Cancelled - buy by hand if you want it.", "info");
            badge.removeCancel();
            console.info(`${TAG} cancelled by user`);
          },
        })
      : null;
    badge?.setCountdown(left);

    const timer = setInterval(() => {
      if (cancelled) return;
      left -= 1;
      if (left > 0) { badge?.setCountdown(left); return; }
      clearInterval(timer);
      badge?.setCountdown(null);
      badge?.setNote("Buying...", "done");
      // Past the point of no return; Cancel would be a lie.
      badge?.removeCancel();
      doSubmit(form);
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();

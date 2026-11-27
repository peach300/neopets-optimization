// ==UserScript==
// @name         # Neopets Wishing Well
// @namespace    local-advisor-fork
// @version      1.3
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
//     print it, cleared when the window it belongs to ends.
//
// WHEN THE WINDOW ENDS
//
// Not twelve hours after your first wish. That is what this script used to
// count, and it is why the panel could sit on Done through a window that had
// already rolled over. Jellyneo's Wishing Well page: wishes are granted twice
// a day, twelve hours apart, at around 8:00 AM and 8:00 PM NST — the well's
// own page claiming four times a day is wrong — and the moment they are
// granted every ungranted wish from the previous twelve hours is wiped and the
// well starts from a clean slate. So the boundary is on the clock and not on
// you: a wish made at 7:55am NST belongs to a window with five minutes left in
// it, not to one running until 7:55pm.
//
// The 8:00 is approximate twice over — Jellyneo read it in February 2026 and
// says it drifts a few seconds later every day — so the local count is held
// past the hour by GRANT_GRACE_MS before the window is called over. Being late
// costs nothing: the panel says Done a little longer, and the well's own page
// overrules it with "Wish Count: 0" the moment it is opened. Being early would
// send an eighth wish into a window that is still running.
//
// A wish costs 22 NP. The well's minimum is 21; the extra Neopoint is the
// original's, and it is kept because the rounder number is easier to spot in a
// bank statement than a figure that matches the minimum exactly.
//
// The wait before each wish is drawn rather than printed: a bar that drains as
// the wish comes due, the same bar the Refresher uses between its rounds, and
// it shows this script's other wait too - the pause on the page a wish lands
// on before walking back to the well. The seconds live in its tooltip.
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
    // The wait before each wish, seconds, drawn from this range. Long enough
    // to catch a wish you did not want, short enough not to be the thing you
    // are waiting for. Set both to 0 to wish the moment the page is ready.
    DELAY_MIN_SECONDS: 1,
    DELAY_MAX_SECONDS: 2,
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
  // The two NST hours the well grants on, and how long past one of them the
  // local count is held before the window is treated as over. The hour itself
  // is approximate and drifting (see the header), so the margin is wide, and
  // wide in the one direction that is free to be wrong in.
  const GRANT_HOURS = [8, 20];
  const GRANT_GRACE_MS = 45 * 60 * 1000;
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
    windowEnd: 0,      // ms, when the window this count belongs to rolls over
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

  // NST is US Pacific, so the grant hours are read off that clock and not off
  // whichever one the browser is sitting in.
  function nstSecondsIntoDay(when = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const got = {};
    for (const p of fmt.formatToParts(when)) got[p.type] = p.value;
    return (Number(got.hour) % 24) * 3600 + Number(got.minute) * 60 + Number(got.second);
  }

  // The next time the well wipes its slate, grace included. Counted forward in
  // real milliseconds from where the NST clock currently stands, which on the
  // two days a year that clock jumps an hour lands an hour out — inside the
  // grace, and overruled by the page's own count in any case.
  function nextGrantAt(when = Date.now()) {
    const secs = nstSecondsIntoDay(new Date(when));
    const marks = GRANT_HOURS.map((h) => h * 3600 + GRANT_GRACE_MS / 1000);
    for (const mark of marks) if (secs < mark) return when + (mark - secs) * 1000;
    return when + (86400 - secs + marks[0]) * 1000;
  }

  // Rough on purpose: the grant time is approximate, so a readout to the
  // second would be claiming a precision nobody outside TNT has.
  function gapWords(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return `about ${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `about ${h}h ${m}m` : `about ${h}h`;
  }

  // The server's own number, printed on the page as "Wish Count: N".
  function serverCount() {
    const el = [...document.querySelectorAll("b")]
      .find((b) => /^\s*Wish Count:\s*\d+\s*$/i.test(b.textContent || ""));
    return el ? parseInt(el.textContent.match(/\d+/)[0], 10) : null;
  }

  // Reconcile what we think with what the page says. The server wins wherever
  // it speaks, because it is the only one of the two that decides anything;
  // the window clock is only here for the page that does not say.
  function syncCount() {
    const said = serverCount();
    if (said !== null) {
      if (said !== state.count) {
        console.info(`${TAG} server says ${said} wish${said === 1 ? "" : "es"} this window`);
      }
      state.count = said;
    } else if (state.windowEnd && Date.now() >= state.windowEnd) {
      console.info(`${TAG} that count's window has been granted out; counting from zero again`);
      state.count = 0;
    }
    if (state.count === 0) state.windowEnd = 0;
    // A count read off the page needs a window of its own to expire with, or
    // the next page that prints no count has nothing to clear it by.
    else if (!state.windowEnd) state.windowEnd = nextGrantAt();
    save();
    return state.count;
  }

  // The same rollover, taken while the page sits there rather than only as it
  // loads. syncCount runs once, at load, which is all the original run needed:
  // every wish navigates, so the next thing to happen was always another load.
  // A page left open is the case it never covered \u2014 open the well at 7:50am
  // with the window spent and the panel reads Done for the next fifty-five
  // minutes, through a grant that has already wiped the count and past a window
  // that has already begun.
  //
  // Called on an interval rather than a timeout to the exact moment, because
  // the moment is approximate anyway (see nextGrantAt) and a browser throttles
  // a background tab's timers to about a minute whatever period is asked for.
  // A minute late on a time nobody publishes to the minute is close enough.
  const ROLLOVER_EVERY_MS = 30 * 1000;

  function rollover() {
    if (!state.windowEnd || Date.now() < state.windowEnd) return;
    console.info(`${TAG} the window that count belonged to has been granted out; counting from zero again`);
    state.count = 0;
    state.windowEnd = 0;
    save();
    // Done becomes Start, and a run that stopped because the window was spent
    // can be started again without reloading the page.
    render();
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
    if (!state.windowEnd) state.windowEnd = nextGrantAt();
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
    /* The wait, drawn rather than counted: a bar that drains as the wish comes
       due, the same as the Refresher's. It shows both of this script's waits -
       the countdown before a wish and the pause before walking back to the
       well - because what they have in common is all the panel needs to say:
       something is due, and this much of it is left. The seconds are in the
       tooltip. The track keeps its place while nothing is due, so the panel
       does not change height every time a wait starts or ends. */
    #npww-bar {
      margin-top: 6px !important; height: 7px !important;
      border: 1px solid #bcd3ec !important; border-radius: 4px !important;
      background: #dce8f6 !important; overflow: hidden !important;
    }
    /* No transform here, deliberately: an author !important declaration beats
       an inline one, so declaring it would make the fill unmovable from
       script. The starting transform is set inline where it is built. */
    #npww-fill {
      display: block !important; width: 100% !important; height: 100% !important;
      transform-origin: left center !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
    }
    #npww[data-kind="done"] #npww-fill {
      background: linear-gradient(#2fa86f, #1d774f) !important;
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
  let elBar = null;
  let elFill = null;
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

    elBar = document.createElement("div");
    elBar.id = "npww-bar";
    elFill = document.createElement("span");
    elFill.id = "npww-fill";
    elFill.style.transform = "scaleX(0)";
    elBar.appendChild(elFill);
    body.appendChild(elBar);

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

    paintBar();
    vCount.textContent = `${state.count} / ${MAX_WISHES}`;
    vCount.title = `${state.count} this window, about ${state.count * DONATION} NP`
      + ` — the well allows ${MAX_WISHES} every twelve hours`;

    btn.textContent = state.running
      ? "Stop"
      : spent() ? "Done" : resumable() ? "Resume" : "Start";
    btn.disabled = spent();
    btn.title = spent()
      ? `All ${MAX_WISHES} wishes used this window — the well's own limit.`
        + ` The next grant is ${gapWords((state.windowEnd || nextGrantAt()) - Date.now())}`
        + ` away, and wipes the count.`
      : state.running
        ? "Stop wishing. The window's count is kept."
        : resumable()
          ? `Carry on from wish ${state.count}.`
          : CONFIG.SUBMIT_WISHES
            ? `Wish until the window's ${MAX_WISHES} are gone.`
            : "Fill the form with an item the well has granted lately.";
  }

  // -------------------------------------------------------------- the waiting
  //
  // Two clocks, deliberately. The due check is a half-second interval, because
  // a browser throttles a background tab's timers to about once a minute
  // whatever period is asked for - that delays a wish, it does not lose it.
  // The paint is requestAnimationFrame, which runs at the refresh rate in
  // front of you and stops dead when the tab is hidden, which is exactly right
  // for something only worth drawing when it can be seen.

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
      : left >= 1000 ? `wishing in ${Math.floor(left / 1000)}s` : "about to wish";
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

  // ------------------------------------------------------------------ the run

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
    cancelWait();
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
      startWait(wait, () => location.replace(WELL_URL));
      return;
    }

    const pick = pickWish();
    setItem(pick);

    const ms = delay();
    if (ms < 100) {
      doWish(found, pick.item);
      return;
    }
    startWait(ms, () => doWish(found, pick.item));
  }

  function run() {
    syncCount();
    render();
    setInterval(rollover, ROLLOVER_EVERY_MS);

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

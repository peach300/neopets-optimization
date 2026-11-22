// ==UserScript==
// @name         # Neopets Dice-A-Roo and Scorchy Slots Refresher
// @namespace    local-advisor-fork
// @version      1.3
// @description  Reloads the Dice-A-Roo or Scorchy Slots landing page on a randomised interval, which is what "playing" means for the pet-boredom mechanic, and stops itself when the page says the pet is bored, with any unfamiliar line in the game's own column as the backstop. Reloads only; it never submits the play form, so it never spends NP.
// @author       Austin Ryder
// @match        *://www.neopets.com/games/dicearoo.phtml*
// @match        *://www.neopets.com/games/play_dicearoo.phtml*
// @match        *://www.neopets.com/games/slots.phtml*
// @match        *://neopets.com/games/dicearoo.phtml*
// @match        *://neopets.com/games/play_dicearoo.phtml*
// @match        *://neopets.com/games/slots.phtml*
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Dice-A-Roo%20and%20Scorchy%20Slots%20Refresher.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Dice-A-Roo%20and%20Scorchy%20Slots%20Refresher.user.js
// ==/UserScript==
//
// WHY
//
// For the boredom mechanic a "play" is a page load of the game's landing page,
// not a round of the game. So the whole job is: reload, wait, reload, and know
// when to stop. The two things that make that worth scripting rather than
// holding F5 down are the two things a human does badly - an interval that is
// not a metronome, and noticing the stop signal on the first load it appears on
// rather than fifty loads later.
//
// THE REFRESH HAS TO COME FROM THE LANDING PAGE
//
// The two games are laid out differently, and both captured pages are worth
// stating exactly, because an earlier version of this gate silently stood the
// script down on one of them.
//
//   Dice-A-Roo   landing /games/dicearoo.phtml, which posts to
//                /games/play_dicearoo.phtml with a hidden raah=init. The play
//                page is a separate document holding the roll state, so
//                reloading it re-posts a stale init and drops you back on the
//                landing page mid-game. Its button reads "Lets Play! (Costs 5 NP)".
//
//   Scorchy Slots  landing /games/slots.phtml, which posts to *itself* with a
//                hidden play=yes. Landing and play therefore share one URL, so
//                no URL test can tell them apart. Its button reads "Click Here
//                to Play" - not "Lets Play", which is why a gate written around
//                that one phrase matched Dice-A-Roo and silently ignored
//                Scorchy Slots: no panel, no run, no error.
//
// So the gate is per game and keyed on the landing form's own hidden field,
// which is the one thing on each page that says "this is the page that starts a
// game" rather than "this is a page about this game":
//
//   - the document title names the game, and
//   - its landing marker is present (raah=init / play=yes), and
//   - no button on the page reads "Play Again".
//
// The last is a guard for Scorchy Slots specifically. Its play page is one URL
// I have not captured; the rules text on the landing page says a new game is
// started with a "Play Again" button, so if that page also carries play=yes the
// title and marker alone would not separate them. If it turns out the slots play
// page is distinguishable some other way, tighten LANDING_MARKER rather than
// loosening this.
//
// @match now names only those three paths. Anything else is not a page of these
// two games, and a page that fails the gate does nothing at all - no panel, no
// timer, no listeners.
//
// HOW IT KNOWS THE PET IS BORED - TWO LAYERS
//
// The boredom line is the point of the run, so it gets a check of its own,
// before the faults and before the caps: if a load is both the 150th and the
// bored one, it is the bored one. Matching it ends the run as a success - green
// and bold on the panel, "run complete", and the load count recorded so a
// second run has a number to expect rather than only the caps.
//
// WHERE THE LINE IS, AND WHERE IT IS NOT
//
// A captured bored page settles both. It is served at
// /games/play_dicearoo.phtml, carries the game's own title, has no "Lets Play"
// button, and its content column reads:
//
//     Im SO BORED of Dice-A-Roo... let's play something else!
//     Click here for the Games Room!
//
// Two things follow.
//
// First, the line is in the game's own column, so that column is the only part
// of the page this script reads. The sidebar is not read at all - not for the
// pet's name, not for its Mood. Mood would have been the obvious signal and is
// the wrong one: on that same bored page it still said "cheerful", because it
// tracks overall happiness and has nothing to say about being bored of one
// particular game.
//
// Second, the line does not appear on the landing page, so the gate below would
// stand the script down on the very page that announces the result and report
// it as "left the landing page" - throwing away the one outcome the run exists
// to reach. The boredom check therefore runs *before* the gate, on any page of
// this game, and a bored page ends the run as a success wherever it is served.
//
// Layer one is wording: BORED_PATTERNS, led by the captured line. Note the
// shape of it - no apostrophe in "Im", and "SO" with a single o, which an
// earlier guess requiring "soo" would have missed.
//
// Layer two exists because none of those wordings is one I could verify, and
// matching only a guessed string would mean refreshing straight past the one
// event the run exists to catch. So the backstop is inverted: the script learns
// what this landing page normally says, by storing every line of its content
// area with digits normalised to "#", and stops when a line appears that is not
// in that set. That catches the boredom line whatever it says - reported as an
// unexpected stop rather than as a finished run, which is the signal to read the
// line and add it to BORED_PATTERNS. It also catches a random event, an "Oops",
// a jackpot-winner notice, a logged-out page and the visiting-too-quickly page,
// all of which you want a refresher to stop for and a wording list would miss.
//
// The cost is a learning period: the first LEARN_LOADS loads are spent building
// the baseline, during which layer two does not stop for anything (layer one
// still does). Keep that number small and expect one or two false halts in the
// first run of a new month, when the site swaps an event banner in. "Forget page
// text" clears the baseline if the page genuinely changed for good.
//
// Both wording lists are checked on every load, learnt or not, so a pattern the
// page's own text happens to contain would end every run on load one - and a
// BORED_PATTERNS hit would do it while reporting success. The learning pass
// therefore tests both lists against the column and warns in the console if any
// of them already matches, naming the list to drop it from. Scorchy Slots makes
// that worth having: its landing page prints the full rules, which is a lot more
// prose for a pattern to collide with than Dice-A-Roo's.
//
// SCOPE
//
// A timer, not you, decides when the next page load happens. The script only
// reloads a page you are already sitting on: it submits no form, clicks no
// button and spends no NP. The caps below exist so that a forgotten tab is
// bounded:
//
//   - MAX_REFRESHES and MAX_MINUTES, both counted across reloads.
//   - A floor under the delay, and a per-minute ceiling, so a crash loop cannot
//     hammer the site.
//   - Halt on anything unfamiliar, as above.
//   - It starts stopped. Running is a click, and it is remembered per game, so
//     a reload you did not ask for does not resume a run you had finished.

(function () {
  "use strict";

  const CONFIG = {
    // Delay between page loads, seconds, drawn uniformly from this range each
    // time. MIN is floored at 1 below whatever you put here.
    MIN_SECONDS: 1,
    MAX_SECONDS: 6,

    // Every so often, take a longer break instead - the thing a person does and
    // a metronome does not. Chance per refresh, and the range of that break.
    LONG_PAUSE_CHANCE: 0.12,
    LONG_PAUSE_MIN_SECONDS: 20,
    LONG_PAUSE_MAX_SECONDS: 45,

    // Hard stops, both counted across reloads for the current run.
    MAX_REFRESHES: 150,
    MAX_MINUTES: 25,

    // Ceiling on page loads in any rolling 60 seconds, regardless of the above.
    // This is a crash-loop backstop, not a pacing control, so it has to sit well
    // clear of what the delay range can produce on a fast stretch: at a 1s floor
    // a minute of unlucky draws is nearly 60 loads, where the average with the
    // long breaks folded in is nearer 9. Anything above 40 is a loop, not luck.
    MAX_PER_MINUTE: 40,

    // Loads spent learning what this page normally says before new text counts
    // as a stop signal. 2 is enough; 1 means a line that only appears half the
    // time (a rotating banner) will halt the next run.
    LEARN_LOADS: 2,

    // Halt when the content area shows a line not seen during learning. This is
    // the main stop condition; turning it off leaves only the caps and the
    // wording list below, which is a much worse way to catch the boredom line.
    HALT_ON_NEW_TEXT: true,

    // The boredom line itself - the thing the run is for. Checked before
    // anything else and on every load, learnt or not, so a line that somehow got
    // into the baseline during learning still ends the run. Matching one of
    // these is a finished run, not a fault, and the panel says so.
    //
    // Matched against the game's own column only - the pet's sidebar is not
    // read. The list is deliberately broader than the one captured line, since
    // Scorchy Slots' wording for this has not been seen.
    BORED_PATTERNS: [
      // The captured line, verbatim: "Im SO BORED of Dice-A-Roo... let's play
      // something else!", in the content column, over a picture of the pet.
      // No apostrophe, and "SO" with a single o - an earlier guess at this
      // required "soo" and would have missed it. The vowel is left stretchable
      // in case it varies, and the pronoun optional for a third-person
      // rendering ("... is so bored of ...").
      /(?:\bi'?m\s+|\bis\s+)?so+\s+bored\s+of\b/i,
      /\bbored\b/i,
      // The line that goes with it, as a second reading of the same page.
      /let'?s play something else/i,
      /\btired of (?:playing|this|that|it)\b/i,
      /\bhad enough\b/i,
      /\bfed up\b/i,
      /\bdoes ?n[o']?t want to play\b/i,
      /\bwon'?t play (?:any ?more|again)\b/i,
    ],

    // Other wordings worth stopping for, which are faults rather than a finished
    // run. Same always-checked treatment as the boredom list.
    HALT_PATTERNS: [
      /\brandom event\b/i,
      // The site's red "Oops" page, which is what a reload of the *play* page
      // gets you: "You have been directed to this page from the wrong place!"
      // It has no "Lets Play" button, so the gate above already stands the
      // script down there - this is for the case where it is served in place of
      // the landing page itself.
      /directed to this page from the wrong place/i,
    ],
  };

  const TAG = "[Refresher]";

  // ------------------------------------------------------------------ the gate

  // One entry per game. LANDING_MARKER is the hidden field the landing form
  // carries and nothing else does - it is what the form posts to start a game,
  // so it marks the page that starts one. Matching on that rather than on the
  // button's label is what makes this work for both games at once: the labels
  // differ ("Lets Play! (Costs 5 NP)" against "Click Here to Play") and a gate
  // written around either one ignores the other without saying so.
  const GAMES = [
    {
      name: "Dice-A-Roo",
      title: /dice\s*-?\s*a\s*-?\s*roo/i,
      LANDING_MARKER: 'input[name="raah"][value="init"]',
    },
    {
      name: "Scorchy Slots",
      title: /scorchy/i,
      LANDING_MARKER: 'input[name="play"][value="yes"]',
    },
  ];

  // Any button that starts a *further* game rather than the first one. Scorchy
  // Slots' landing page describes its play page as having one, and that play
  // page shares the landing URL, so this is the separator of last resort.
  function hasPlayAgain() {
    for (const el of document.querySelectorAll('input[type="submit"], button')) {
      if (/play again/i.test((el.value || el.textContent || ""))) return true;
    }
    return false;
  }

  const entry = GAMES.find((g) => g.title.test(document.title || ""));
  if (!entry) return;
  const game = entry.name;
  const onLanding = !!document.querySelector(entry.LANDING_MARKER) && !hasPlayAgain();

  // --------------------------------------------------------------- the content

  // Everything this script reads is the game's own column and nothing else.
  // The sidebar carries the pet's stats and the Neofriends list and the premium
  // footer carries bank balances and a stock table, all of which change on
  // their own and would read as new text on every single load. The boredom line
  // is in this column - the captured bored page puts it under the game's own
  // header - so nothing outside it needs reading.
  function contentRoot() {
    return document.querySelector("td.content")
      || document.querySelector(".contentModule")
      || document.querySelector("#content")
      || document.body;
  }

  function contentText() {
    return (contentRoot().innerText || "").replace(/\s+/g, " ");
  }

  // Lines of that column, digits flattened to "#" so the jackpot figure and the
  // NP totals do not each count as a sentence never seen before.
  function contentLines() {
    const text = (contentRoot().innerText || "").replace(/\u00a0/g, " ");
    const out = [];
    for (const raw of text.split("\n")) {
      const line = raw.replace(/[\d,]+/g, "#").replace(/\s+/g, " ").trim();
      if (line.length >= 12) out.push(line);
    }
    return out;
  }

  // ----------------------------------------------------------------- the store

  // Keyed per game, so a Dice-A-Roo run and a Scorchy Slots run are separate
  // runs with separate counts, caps and learnt page text.
  const KEY = `gameRefresher.${game.replace(/\W+/g, "").toLowerCase()}`;

  const BLANK = {
    running: false,
    count: 0,            // page loads this run
    startedAt: 0,        // ms, this run
    nextAt: 0,           // ms, when the next load is due
    loads: 0,            // loads ever seen, for the learning period
    known: [],           // learnt content lines
    recent: [],          // ms timestamps of recent loads, for MAX_PER_MINUTE
    note: "",            // why it stopped, shown on the panel after a halt
    noteKind: "stop",    // "bored" (the run's goal) or "stop" (anything else)
    lastBored: null,     // {at, count} of the last boredom line, kept across runs
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return Object.assign({}, BLANK, raw);
    } catch {
      // A broken store must not read as "running", or a halt could be forgotten
      // and the run resume itself.
      return Object.assign({}, BLANK);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // If the state cannot be written, the caps cannot be counted across
      // reloads, so the run stops here rather than becoming uncapped.
      console.warn(`${TAG} cannot persist state; stopping`, err);
      state.running = false;
    }
  }

  const state = load();

  // ------------------------------------------------------------------ the halt

  // kind is "bored" for a run that reached what it was for, "stop" for anything
  // else. Only the panel's colour and wording turn on it; both end the run.
  function halt(note, kind) {
    state.running = false;
    state.nextAt = 0;
    state.note = note;
    state.noteKind = kind || "stop";
    save();
    clearInterval(tick);
    console.info(`${TAG} ${game}: stopped (${state.noteKind}) - ${note}`);
    render();
  }

  // Did this load show the boredom line? Separate from the faults below because
  // it is the run's goal, and because it is worth recording when it happened.
  function checkBored() {
    const text = contentText();
    for (const re of CONFIG.BORED_PATTERNS) {
      const m = text.match(re);
      if (m) return `page says "${m[0]}"`;
    }
    return null;
  }

  // Everything else that can end a run, checked on this load, in order of how
  // much you would mind missing it.
  function checkStops() {
    const text = contentText();

    for (const re of CONFIG.HALT_PATTERNS) {
      const m = text.match(re);
      if (m) return `page matched ${re} ("${m[0]}") - look at the page`;
    }

    if (CONFIG.HALT_ON_NEW_TEXT && state.loads > CONFIG.LEARN_LOADS) {
      const known = new Set(state.known);
      const fresh = contentLines().filter((l) => !known.has(l));
      if (fresh.length) {
        console.info(`${TAG} new text on the page:`, fresh);
        return `new text on the page: "${fresh[0].slice(0, 90)}"`;
      }
    }

    if (state.count >= CONFIG.MAX_REFRESHES) {
      return `refresh cap reached (${state.count}/${CONFIG.MAX_REFRESHES})`;
    }

    const mins = (Date.now() - state.startedAt) / 60000;
    if (state.startedAt && mins >= CONFIG.MAX_MINUTES) {
      return `time cap reached (${Math.round(mins)}/${CONFIG.MAX_MINUTES} min)`;
    }

    const minute = Date.now() - 60000;
    if (state.recent.filter((t) => t > minute).length > CONFIG.MAX_PER_MINUTE) {
      return `rate ceiling hit (>${CONFIG.MAX_PER_MINUTE} loads/min) - something is looping`;
    }

    return null;
  }

  // ------------------------------------------------------------- the scheduler

  function pickDelay() {
    const long = Math.random() < CONFIG.LONG_PAUSE_CHANCE;
    const lo = long ? CONFIG.LONG_PAUSE_MIN_SECONDS : Math.max(1, CONFIG.MIN_SECONDS);
    const hi = long ? CONFIG.LONG_PAUSE_MAX_SECONDS : Math.max(lo, CONFIG.MAX_SECONDS);
    return Math.round((lo + Math.random() * (hi - lo)) * 1000);
  }

  function schedule() {
    const ms = pickDelay();
    state.nextAt = Date.now() + ms;
    save();
    console.info(`${TAG} ${game}: next load in ${(ms / 1000).toFixed(1)}s`);
  }

  // location.replace rather than reload(): a fresh GET, so no re-post prompt if
  // the page was ever reached by one, and it overwrites the history entry
  // instead of stacking a hundred and fifty of them in front of the Back button.
  function go() {
    state.nextAt = 0;
    save();
    location.replace(location.href);
  }

  function start() {
    // Refusing beats starting and halting on load one, which looks like a fault
    // in the script rather than the state of the pet.
    const already = checkBored();
    if (already) {
      state.note = `Already bored - nothing to do. ${already}`;
      state.noteKind = "bored";
      save();
      render();
      return;
    }
    state.running = true;
    state.count = 0;
    state.startedAt = Date.now();
    state.note = "";
    state.noteKind = "stop";
    schedule();
    render();
  }

  function stop() {
    halt("stopped by hand");
  }

  // The clock is checked against wall time rather than counted down, because a
  // background tab throttles timers to about once a minute: that delays a load,
  // it does not lose it or fire a burst of them.
  const tick = setInterval(() => {
    if (state.running && state.nextAt && Date.now() >= state.nextAt) {
      go();
      return;
    }
    render();
  }, 250);

  // ----------------------------------------------------------------- the panel
  //
  // House style, per .claude/skills/neopets-panel-style: the site's own two
  // fonts from images.neopets.com, the #2367B5 header that turns Meridell green
  // when the run is done, the Safety Deposit Box's yellow button, and the
  // countdown in tabular monospace so a passing second changes one digit
  // instead of reflowing the row. 150px because the site's content column is
  // 1000px and centred, so at that width the panel sits in the window's margin
  // rather than over the page.

  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPRF Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPRF Museo", "Museo Sans Rounded", Verdana, sans-serif';

  const CSS = `
    @font-face {
      font-family: "NPRF Cafeteria"; font-display: swap;
      src: url("${FONT_HOST}/cafeteria-black.ttf") format("truetype");
    }
    @font-face {
      font-family: "NPRF Museo"; font-style: normal; font-display: swap;
      src: url("${FONT_HOST}/museosansrounded-500.woff") format("woff"),
           url("${FONT_HOST}/museosansrounded-500.ttf") format("truetype");
    }
    #nprf {
      box-sizing: border-box !important;
      position: fixed !important; bottom: 20px !important; right: 18px !important;
      z-index: 2147483646 !important;
      width: 150px !important; text-align: left !important;
      font: 12px/1.45 ${MUSEO} !important; color: #333 !important;
      border: 1px solid #27486d !important; border-radius: 10px !important;
      overflow: hidden !important; background: #fff !important;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
    }
    #nprf * { box-sizing: border-box !important; }
    #nprf-head {
      display: flex !important; align-items: center !important;
      gap: 6px !important; padding: 4px 8px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important; font: 13pt/1.1 ${CAFETERIA} !important;
      user-select: none !important;
    }
    #nprf-title { flex: 1 1 auto !important; white-space: nowrap !important;
      overflow: hidden !important; text-overflow: ellipsis !important; }
    /* The run light, in the header where it is visible without reading: a
       filled dot while loads are happening, hollow while stopped. */
    #nprf-dot {
      flex: none !important; width: 8px !important; height: 8px !important;
      border-radius: 50% !important; border: 1px solid #fff !important;
      background: transparent !important;
    }
    #nprf[data-running="1"] #nprf-dot { background: #fff !important; }
    /* Green header for a finished run - the one state worth seeing from the
       corner of the eye, since it is the state the whole run is for. */
    #nprf[data-outcome="bored"] #nprf-head {
      background: linear-gradient(#2fa86f, #1d774f) !important;
      border-bottom-color: #14543a !important;
    }
    #nprf[data-outcome="stop"] { border-color: #a94442 !important; }
    #nprf[data-outcome="stop"] #nprf-head {
      background: linear-gradient(#d07a78, #a94442) !important;
      border-bottom-color: #7a2b2b !important;
    }
    #nprf-body {
      background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
      padding: 5px 8px 7px !important; border-radius: 0 0 9px 9px !important;
    }
    .nprf-row {
      display: flex !important; align-items: baseline !important;
      gap: 6px !important; padding: 1px 0 !important;
    }
    .nprf-row + .nprf-row { border-top: 1px solid #dce8f6 !important; }
    .nprf-k {
      flex: 1 1 auto !important; min-width: 0 !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
      white-space: nowrap !important;
      color: #4a5a6a !important; font: 10.5px/1.5 ${MUSEO} !important;
    }
    /* Tabular monospace, right-aligned, with a min-width wide enough for the
       longest form the value takes. Proportional digits reflow the row on every
       tick, which is what makes a countdown jitter. */
    .nprf-v {
      flex: none !important; min-width: 52px !important; text-align: right !important;
      color: #1b4f85 !important;
      font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
      letter-spacing: 0 !important;
    }
    #nprf-note {
      margin-top: 5px !important; padding-top: 5px !important;
      border-top: 1px solid #cfe0f2 !important;
      font: 10.5px/1.35 ${MUSEO} !important; color: #7a2b2b !important;
    }
    #nprf[data-outcome="bored"] #nprf-note { color: #156141 !important; font-weight: bold !important; }
    #nprf[data-outcome="info"] #nprf-note { color: #4a5a6a !important; }
    #nprf-history {
      margin-top: 3px !important;
      font: 10px/1.35 ${MUSEO} !important; color: #6a7a8c !important;
    }
    /* Hide with the [hidden] attribute, not an inline style.display: the rules
       here carry !important, and an author !important declaration beats an
       inline one, so style.display = "none" on any element whose rule gains a
       display property would silently stop working. None of the rules above
       set display today; this is here so that adding one later cannot quietly
       strand a row on screen. */
    #nprf [hidden] { display: none !important; }
    #nprf-buttons { margin-top: 7px !important; }
    /* The Safety Deposit Box's "Remove 1": template.css .button-default__2020 +
       .button-yellow__2020 plus safetydeposit.css .sdb-remove1, copied
       declaration for declaration. The four inset layers are the bevel; drop
       one and it looks flat and nearly right, which is worse than different.
       The uneven vertical padding is Cafeteria sitting high in its box. */
    .nprf-btn {
      display: block !important; width: 100% !important; margin: 0 !important;
      padding: 3px 10px 7px !important; cursor: pointer !important;
      position: relative !important; overflow: hidden !important;
      outline: none !important; text-align: center !important;
      font: 11pt/1.1 ${CAFETERIA} !important; white-space: nowrap !important;
      color: #363636 !important;
      background: linear-gradient(#f6e250, #ebb233) !important;
      border: #fff solid 1px !important; border-radius: 15px !important;
      box-shadow: inset 0 0 0 1px rgba(246,226,80,1),
                  inset 0 -3px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    .nprf-btn:hover, .nprf-btn:focus {
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    .nprf-btn:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    .nprf-btn--sm {
      font-size: 9pt !important; padding: 2px 10px 5px !important;
      margin-top: 5px !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById("nprf-style")) return;
    const style = document.createElement("style");
    style.id = "nprf-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  let panel, vCount, vNext, elNote, elHistory, btnRun;

  // One row of the body: a label that ellipsises and a value that does not move.
  function addRow(parent, label) {
    const row = document.createElement("div");
    row.className = "nprf-row";
    const k = document.createElement("span");
    k.className = "nprf-k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "nprf-v";
    row.appendChild(k);
    row.appendChild(v);
    parent.appendChild(row);
    return v;
  }

  function build() {
    injectStyles();

    panel = document.createElement("div");
    panel.id = "nprf";

    const head = document.createElement("div");
    head.id = "nprf-head";
    const dot = document.createElement("span");
    dot.id = "nprf-dot";
    const title = document.createElement("span");
    title.id = "nprf-title";
    // The game's name, not the script's: on the page it is on, which game this
    // is is the only thing in doubt.
    title.textContent = game;
    title.title = `${game} refresher`;
    head.appendChild(dot);
    head.appendChild(title);
    panel.appendChild(head);

    const body = document.createElement("div");
    body.id = "nprf-body";
    vCount = addRow(body, "Loads");
    vNext = addRow(body, "Next");

    elNote = document.createElement("div");
    elNote.id = "nprf-note";
    body.appendChild(elNote);

    elHistory = document.createElement("div");
    elHistory.id = "nprf-history";
    elHistory.hidden = true;
    body.appendChild(elHistory);

    const buttons = document.createElement("div");
    buttons.id = "nprf-buttons";

    btnRun = document.createElement("button");
    btnRun.className = "nprf-btn";
    btnRun.addEventListener("click", () => (state.running ? stop() : start()));
    buttons.appendChild(btnRun);

    const btnForget = document.createElement("button");
    btnForget.className = "nprf-btn nprf-btn--sm";
    btnForget.textContent = "Forget text";
    btnForget.title =
      "Throw away the learnt baseline and learn it again. Use this when the page has"
      + " genuinely changed for good - a new event banner - and every load now stops.";
    btnForget.addEventListener("click", () => {
      state.known = [];
      state.loads = 0;
      state.note = "Page text forgotten; relearning.";
      state.noteKind = "info";
      save();
      render();
    });
    buttons.appendChild(btnForget);

    body.appendChild(buttons);
    panel.appendChild(body);
    (document.body || document.documentElement).appendChild(panel);
  }

  // Rounded to a tenth while a load is seconds away and to the second above
  // that, so the fast end reads as a countdown and a 45s break does not flicker
  // a decimal nobody is watching.
  function fmtSeconds(ms) {
    const s = Math.max(0, ms / 1000);
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
  }

  function render() {
    if (!panel) build();

    // The header's colour and the run light are driven by data attributes, so
    // every state lives in the stylesheet beside the rule it changes rather
    // than in a pile of inline writes here.
    panel.dataset.running = state.running ? "1" : "0";
    panel.dataset.outcome = state.running ? "" : (state.note ? state.noteKind : "");

    vCount.textContent = state.running || state.count
      ? `${state.count} / ${CONFIG.MAX_REFRESHES}`
      : `0 / ${CONFIG.MAX_REFRESHES}`;

    if (state.running && state.nextAt) {
      vNext.textContent = fmtSeconds(state.nextAt - Date.now());
    } else if (state.loads <= CONFIG.LEARN_LOADS) {
      vNext.textContent = `learn ${state.loads}/${CONFIG.LEARN_LOADS}`;
    } else {
      vNext.textContent = "—";
    }

    elNote.textContent = state.note || "";
    elNote.hidden = !state.note;

    if (state.lastBored && !state.running) {
      const ago = Math.round((Date.now() - state.lastBored.at) / 60000);
      elHistory.textContent =
        `Last bored after ${state.lastBored.count} loads, `
        + (ago < 1 ? "just now" : ago < 60 ? `${ago} min ago` : `${Math.round(ago / 60)}h ago`);
      elHistory.hidden = false;
    } else {
      elHistory.hidden = true;
    }

    btnRun.textContent = state.running ? "Stop" : "Start";
  }

  // ------------------------------------------------- not the landing page
  //
  // No run can continue from here. Returning on the spot was wrong, though: it
  // left `running` true with a due time already in the past, so the panel on the
  // next landing page would claim a run was still going and pick it up from a
  // stale count. A run that has left the landing page has ended, and the store
  // has to say so. This is also the one place that can name *why*, since the
  // page that interrupted it is the page in front of us.
  if (!onLanding) {
    clearInterval(tick);
    // The boredom check comes first, and deliberately runs on a page the script
    // will not refresh. The captured bored page is served at
    // /games/play_dicearoo.phtml, carries the game's title and the line "Im SO
    // BORED of Dice-A-Roo... let's play something else!" in the content column,
    // and has no "Lets Play" button - so the gate stands the script down there.
    // Reporting that as "left the landing page" would throw away the one
    // outcome the run exists to reach, on the page that states it.
    const bored = checkBored();
    if (bored) {
      if (state.running) state.lastBored = { at: Date.now(), count: state.count };
      state.running = false;
      state.nextAt = 0;
      state.note = `Pet is bored - run complete. ${bored}`;
      state.noteKind = "bored";
      save();
      console.info(`${TAG} ${game}: ${state.note}`);
      render();
      return;
    }

    if (state.running) {
      const err = /directed to this page from the wrong place/i.test(document.body.innerText || "");
      state.running = false;
      state.nextAt = 0;
      state.note = err
        ? "Stopped: the site served its wrong-place error. A reload of the *play* page does that - this script only ever reloads the landing page, so something else navigated."
        : "Stopped: left the landing page (a game was started, or the site served another page).";
      state.noteKind = "stop";
      save();
      console.info(`${TAG} ${game}: ${state.note}`);
      render();
      return;
    }
    console.info(`${TAG} ${game}, but not the landing page (no "Lets Play" button); standing down`);
    return;
  }

  // ------------------------------------------------------------------- the run

  // This load counts, whether or not a run is going: the learning period needs
  // ordinary loads too.
  state.loads += 1;
  state.recent = state.recent.filter((t) => t > Date.now() - 120000).concat(Date.now());

  if (state.loads <= CONFIG.LEARN_LOADS) {
    const known = new Set(state.known);
    for (const l of contentLines()) known.add(l);
    state.known = Array.from(known);
    console.info(`${TAG} ${game}: learning page text (${state.loads}/${CONFIG.LEARN_LOADS}), ${state.known.length} lines`);

    // Both pattern lists are checked on every load, learnt or not, so one that
    // the page's own rules text happens to contain would end the run on its
    // first load, every time, with no obvious cause - and a BORED_PATTERNS hit
    // would do it while reporting the run a success. Say so now rather than
    // then. Dice-A-Roo's rules talk about losing and proceeding and name no
    // moods, but Scorchy Slots' text is not something I could read to check.
    const text = contentText();
    const lists = [["BORED_PATTERNS", CONFIG.BORED_PATTERNS], ["HALT_PATTERNS", CONFIG.HALT_PATTERNS]];
    for (const [which, list] of lists) {
      for (const re of list) {
        if (re.test(text)) {
          console.warn(
            `${TAG} ${game}: ${re} already matches this page's ordinary text.`
            + ` Any run will end on load one - drop that pattern from ${which}.`
          );
        }
      }
    }
  }

  if (state.running) {
    state.count += 1;

    // The boredom line first, before the faults and before the caps: if this
    // load is both the 150th and the bored one, it is the bored one.
    const bored = checkBored();
    if (bored) {
      state.lastBored = { at: Date.now(), count: state.count };
      halt(`Pet is bored - run complete. ${bored}`, "bored");
    } else {
      const why = checkStops();
      if (why) halt(why, "stop");
      else { schedule(); render(); }
    }
  } else {
    save();
    render();
  }
})();

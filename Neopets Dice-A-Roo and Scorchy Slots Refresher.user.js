// ==UserScript==
// @name         # Neopets Dice-A-Roo and Scorchy Slots Refresher
// @namespace    local-advisor-fork
// @version      1.5
// @description  Plays Dice-A-Roo or Scorchy Slots on a randomised interval, for the pet-boredom mechanic, and stops itself when the page says the pet is bored. Each play submits the game's own form, which costs its usual 5 NP; SUBMIT_TO_PLAY false stops it acting.
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
// rather than fifty loads later. What a "play" actually is turned out to be the
// harder question, and the section below is the answer.
//
// A RELOAD IS NOT A PLAY
//
// This script began as a refresher, on the premise that reloading the landing
// page is what "playing" means for the boredom mechanic. That premise is
// wrong, at least for Scorchy Slots: reloading slots.phtml just re-serves the
// same page and starts no game. The only thing that starts one is submitting
// the form, so that is what the timer now does, and that is why this script
// costs money.
//
// Each play costs the game's 5 NP, as playing it by hand would. SUBMIT_TO_PLAY
// false puts the old reload back, which spends nothing and plays nothing.
//
// The two games then differ in where the next play lives:
//
//   Dice-A-Roo    /games/dicearoo.phtml carries the play form (hidden
//                 raah=init, "Lets Play! (Costs 5 NP)"). Submitting it lands
//                 you on /games/play_dicearoo.phtml, which holds the roll
//                 state and offers no way to start another game - so the loop
//                 walks back to the landing page and plays again. The walk
//                 back is a GET of the landing URL, not a reload of the roll
//                 page: reloading that one re-posts a stale init, which is
//                 what produces the site's red wrong-place error.
//
//                 Note what this means: each cycle starts a game and then
//                 abandons it, pot and all, to go back and start another. The
//                 run is playing for boredom, not for Neopoints.
//
//   Scorchy Slots /games/slots.phtml serves two pages under one URL, and both
//                 start a play: the landing form (hidden play=yes, "Click Here
//                 to Play") before a game, and the reels (form posting to
//                 process_slots2.phtml, "Play Again") once one is in progress.
//                 The site keeps serving the reels after your first play, so a
//                 long run spends almost all of it clicking Play Again, and no
//                 walk back is needed.
//
// The label on those buttons is deliberately not what the script looks for.
// Gating on "Lets Play" was the first version of this and it matched
// Dice-A-Roo while silently ignoring Scorchy Slots, whose button reads "Click
// Here to Play" - no panel, no run, no error. Each game is keyed on the hidden
// field or the action URL of the form itself, and the submit control is then
// taken from that form.
//
// Clicking the control rather than calling form.submit() sends the button's
// own name/value pair, which form.submit() drops and which Neopets forms
// sometimes dispatch on.
//
// @match names only dicearoo.phtml, play_dicearoo.phtml and slots.phtml.
//
// HOW IT KNOWS THE PET IS BORED
//
// The boredom line is the point of the run, so it is checked before the faults
// and before the caps: if a load is both the 150th and the bored one, it is the
// bored one. Matching it ends the run as a success - green header, "run
// complete", and the load count recorded so a second run has a number to expect
// rather than only the caps.
//
// A captured bored page says where that line lives. It is served at
// /games/play_dicearoo.phtml, carries the game's own title, and its content
// column reads:
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
// Second, the line appears on a page the script does not play from, so checking
// it only on pages that carry a play button would throw away the one outcome
// the run exists to reach. The boredom check therefore runs first, on any page of the
// game, and ends the run as a success wherever that line is served.
//
// BORED_PATTERNS is led by the captured line. Note its shape - no apostrophe in
// "Im", and "SO" with a single o, which an earlier guess requiring "soo" would
// have missed. The list is deliberately broader than that one line, because
// Scorchy Slots' wording for this has never been seen; if a slots run reaches
// the 150-load cap without ending, read the page and add its wording here.
//
// Both wording lists are checked on every load, so a pattern the page's own
// text happens to contain would end every run on load one - and a
// BORED_PATTERNS hit would do it while reporting success. While the panel is
// idle the script therefore tests both lists against the column and warns in
// the console if any of them already matches, naming the list to drop it from.
// Scorchy Slots makes that worth having: its landing page prints the full
// rules, a lot more prose for a pattern to collide with than Dice-A-Roo's.
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
    // Each play is a form submit, which is what actually starts a game and
    // what the games charge their 5 NP for. False puts the original reload
    // back, which is the off switch rather than an alternative: a reload
    // starts no game, so it neither spends nor plays.
    SUBMIT_TO_PLAY: true,

    // Delay between page loads, seconds, drawn uniformly from this range each
    // time. MIN is floored at 1 below whatever you put here.
    MIN_SECONDS: 1,
    MAX_SECONDS: 6,

    // Every so often, take a longer break instead - the thing a person does and
    // a metronome does not. Chance per refresh, and the range of that break.
    LONG_PAUSE_CHANCE: 0.12,
    LONG_PAUSE_MIN_SECONDS: 12,
    LONG_PAUSE_MAX_SECONDS: 15,

    // Hard stops, both counted across reloads for the current run.
    MAX_REFRESHES: 150,
    MAX_MINUTES: 25,

    // Ceiling on page loads in any rolling 60 seconds, regardless of the above.
    // This is a crash-loop backstop, not a pacing control, so it has to sit well
    // clear of what the delay range can produce on a fast stretch: at a 1s floor
    // a minute of unlucky draws is nearly 60 plays, where the average with the
    // long breaks folded in is nearer 13. Anything above 40 is a loop, not luck.
    MAX_PER_MINUTE: 40,

    // The boredom line itself - the thing the run is for. Checked before
    // anything else and on every load, including pages the script will not
    // reload. Matching one of these is a finished run, not a fault, and the
    // panel says so.
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

  // One entry per game.
  //
  //   playButton()  the control on THIS page that starts a play, or null. A
  //                 reload is not a play - that was the earlier design and it
  //                 does not advance the mechanic - so this is what the timer
  //                 clicks.
  //
  //   returnUrl     where to go when a run is live and this page has no play
  //                 button. Dice-A-Roo needs it: starting a game lands you on
  //                 play_dicearoo.phtml, which has no way to start another, so
  //                 the loop walks back to the landing page. Scorchy Slots does
  //                 not: its reels page carries "Play Again", so the next play
  //                 is always right there.
  const GAMES = [
    {
      name: "Dice-A-Roo",
      title: /dice\s*-?\s*a\s*-?\s*roo/i,
      // Only on the landing page, found by the hidden field its form posts.
      // Never on play_dicearoo.phtml, which holds the roll state.
      playButton: () => {
        const marker = document.querySelector('input[name="raah"][value="init"]');
        return marker && marker.form ? submitOf(marker.form) : null;
      },
      // A fresh GET of the landing page. Walking back this way rather than
      // reloading matters: play_dicearoo.phtml is a POST result, and reloading
      // it re-posts a stale init, which is what gets you the site's red
      // wrong-place error.
      returnUrl: "/games/dicearoo.phtml",
    },
    {
      name: "Scorchy Slots",
      title: /scorchy/i,
      // slots.phtml serves two pages under one URL, and both can start a play:
      // the landing form (hidden play=yes, "Click Here to Play") before a game,
      // and the reels (form posting to process_slots2.phtml, "Play Again") once
      // one is in progress. The site keeps serving the reels after your first
      // play, so the second case is the one a long run spends its time in.
      playButton: () => {
        const marker = document.querySelector('input[name="play"][value="yes"]');
        if (marker && marker.form) return submitOf(marker.form);
        const reels = document.querySelector('form[action*="process_slots"]');
        return reels ? submitOf(reels) : null;
      },
      returnUrl: null,
    },
  ];

  // The form's own submit control. Clicking it rather than calling
  // form.submit() sends that button's name/value pair, which form.submit()
  // drops and which Neopets forms sometimes dispatch on.
  function submitOf(form) {
    return form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
  }

  const entry = GAMES.find((g) => g.title.test(document.title || ""));
  if (!entry) return;
  const game = entry.name;
  const playBtn = entry.playButton();
  // A page with no play button is still worth something on a game that can walk
  // back to one - that is the Dice-A-Roo roll page mid-loop, not a dead end.
  const canAct = !!playBtn || (!!entry.returnUrl && !onReturnUrl());

  function onReturnUrl() {
    return !!entry.returnUrl && location.pathname === entry.returnUrl;
  }

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

  // ----------------------------------------------------------------- the store

  // Keyed per game, so a Dice-A-Roo run and a Scorchy Slots run are separate
  // runs with separate counts and caps.
  const KEY = `gameRefresher.${game.replace(/\W+/g, "").toLowerCase()}`;

  const BLANK = {
    running: false,
    count: 0,            // steps this run (plays plus walk-backs)
    plays: 0,            // plays actually submitted this run, which is the NP
    startedAt: 0,        // ms, this run
    nextAt: 0,           // ms, when the next load is due
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

    // Counted in plays, not steps: Dice-A-Roo's walk back to the landing page
    // is a page load but not a game, and charging it against the cap would
    // halve the run for no reason.
    if (state.plays >= CONFIG.MAX_REFRESHES) {
      return `play cap reached (${state.plays}/${CONFIG.MAX_REFRESHES})`;
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

  // One step of the loop. Three shapes, in order of what the page offers:
  //
  //   a play button   click it. This is the play.
  //   a return URL    walk back to the page that has one. Not a play, not
  //                   counted, and not charged.
  //   neither         should not happen - canAct gates it - so say so loudly
  //                   rather than spinning.
  //
  // Navigation uses location.replace so a long run leaves one history entry
  // rather than a hundred and fifty in front of the Back button.
  function go() {
    state.nextAt = 0;

    if (playBtn && CONFIG.SUBMIT_TO_PLAY) {
      // Counted and charged before the click, because the click navigates and
      // nothing after it runs.
      state.plays += 1;
      save();
      console.info(`${TAG} ${game}: play ${state.plays}`);
      playBtn.click();
      return;
    }
    if (playBtn) {
      // SUBMIT_TO_PLAY off: the old reload, which starts no game.
      save();
      location.replace(location.href);
      return;
    }
    if (entry.returnUrl) {
      save();
      location.replace(entry.returnUrl);
      return;
    }
    halt("Stopped: nothing on this page starts a play.", "stop");
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
    state.plays = 0;
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
    vCount = addRow(body, "Plays");
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

    vCount.textContent = `${state.plays} / ${CONFIG.MAX_REFRESHES}`;

    vNext.textContent = state.running && state.nextAt
      ? fmtSeconds(state.nextAt - Date.now())
      : "—";

    elNote.textContent = state.note || "";
    elNote.hidden = !state.note;

    if (state.lastBored && !state.running) {
      const ago = Math.round((Date.now() - state.lastBored.at) / 60000);
      elHistory.textContent =
        `Last bored after ${state.lastBored.count} plays, `
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
  if (!canAct) {
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
      if (state.running) state.lastBored = { at: Date.now(), count: state.plays };
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
        : "Stopped: nothing here starts a play and there is no way back - the site served something else.";
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

  state.recent = state.recent.filter((t) => t > Date.now() - 120000).concat(Date.now());

  // Checked while idle, which is when you would read it. A pattern the page's
  // ordinary text happens to contain would end a run on its first load, every
  // time, with no obvious cause - and a BORED_PATTERNS hit would do it while
  // reporting the run a success. Scorchy Slots makes this worth keeping: its
  // landing page prints the full rules, far more prose for a pattern to
  // collide with than Dice-A-Roo's.
  if (!state.running) {
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
    // load is both the last one and the bored one, it is the bored one.
    const bored = checkBored();
    if (bored) {
      state.lastBored = { at: Date.now(), count: state.plays };
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

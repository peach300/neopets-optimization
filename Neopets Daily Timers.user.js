// ==UserScript==
// @name         # Neopets Daily Timers
// @namespace    local-advisor-fork
// @version      3.1
// @description  One panel on every Neopets page with a live countdown for each timed activity you turn on — cooldowns, midnight-NST dailies and fixed NST windows — with alerts when one comes up and a settings page to pick which to track. Display only: it never clicks, submits or plays for you.
// @author       Austin Ryder
// @match        *://www.neopets.com/*
// @match        *://neopets.com/*
// @match        *://www.jellyneo.net/*
// @match        *://jellyneo.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Daily%20Timers.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Daily%20Timers.user.js
// ==/UserScript==
//
// WHAT THIS IS
//
// The Healing Springs countdown in this folder, generalised. Neopets has
// dozens of activities on a clock and tells you the remaining time for almost
// none of them, so the clock is kept here instead: one panel, a row per
// activity you have switched on, soonest first.
//
// THE ORDER THE ROWS COME IN
//
// Two groups. What is ready sits at the top, in the order you dragged it
// into, because that order is a running order and "ready" carries no clock to
// sort on. Everything still counting down follows, soonest first, and the
// drag order has no say there at all: a waiting row is a wait, and how long
// is the only thing about it worth ordering by.
//
// Before this the whole list was fixed - Jellyneo's dailies order, or yours,
// with the ready rows scattered through it and the ones twelve hours out at
// the top.
//
// The cadences come from Jellyneo's dailies list (jellyneo.net/?go=dailies),
// read on 2026-11-18. Three kinds are tracked, because three kinds is what
// Neopets actually has:
//
//   interval — a cooldown measured from your last visit. Healing Springs is
//              30 minutes, Buried Treasure 3 hours, Coltzan's Shrine 13, the
//              Expellibox an odd 7h07m.
//   daily    — resets at midnight NST for everyone at once. The row reads
//              "ready" until it is ticked off, then counts down to that
//              midnight. The reset time is exact; whether you have been today
//              is the part this browser has to be told, by your click on the
//              page or by the tick in the panel.
//   window   — open during fixed NST hours: the Snowager's three one-hour
//              slots, Deadly Dice between midnight and 1am. The row counts
//              down to the next opening, or says how long the window has left.
//
// HOW A VISIT IS DETECTED, AND HOW MUCH TO TRUST IT
//
// A userscript cannot ask the server when you last went, so for everything
// except the fixed windows a visit has to be noticed here. Each row is one of:
//
//   read from the page — the page states the outcome and the script reads it.
//              Healing Springs is the worked example: the faerie's result
//              text, the refusal, and the "no healing powers today" that still
//              burns the half hour. This is as good as it gets.
//   the page's own request — most of H5 does its dailies over AJAX, so the
//              script watches what the page itself sends: a same-origin POST
//              or AJAX call from the tracked page is the action happening, not
//              a guess that it might have. Collecting bank interest POSTs to
//              process_bank.php; a classic page's form submit counts the same
//              way. Requests fired while the page is still loading are
//              ignored, as is a list of calls the site makes by itself (the
//              notification poll, the Quest Log pane refreshing, bookmarking),
//              which would otherwise tick things off for merely arriving.
//   from your click — last resort: a button, a submit, or a link that acts on
//              the page rather than leaving it. A plain link elsewhere does
//              not count, so walking away from the Shrine no longer marks it.
//
// A better source overwrites a worse one, never the other way round, so a
// stray click cannot overwrite what the page itself said.
//
// Every row says which it is, and every row can be set or cleared by hand, so
// a wrong guess is never a dead end. Nothing here ever acts for you: the
// request watcher reads the method and URL of calls the page was making
// anyway, passes them through untouched, and sends nothing of its own.
//
// WHAT IS DELIBERATELY NOT HERE
//
// Activities whose timing is random or unknowable from the client: Tarla,
// Smuggler's Cove, the Kadoatery, faerie quests, restocks, Turmaculus (its
// waking hours are predicted, not published), Ye Olde Fishing Vortex. A
// countdown for those would be a made-up number wearing a clock's face.
//
// Per-day allowances are the fourth kind of row, and they are neither counted
// nor timed: Coconut Shy, Bagatelle and the Cork Gun Gallery simply say Ready
// until the game itself says you are out, and then count down to midnight NST.
// They did show a running tally - "6/20 used" - but that tally was counting
// openings of the handler page, so a reload, a play made in another tab or a
// click that never landed all moved it, and it was printed in the clock's own
// place as though the site had said it. The site does say it, once: the
// handler's answer carries "No more throws, you've had yer lot." Reading that
// is worth more than counting twenty of anything. Game high-score limits (three
// plays of Hasee Bounce) and the scavenging ones (10-13 items from the Money
// Tree) are left out — those are per-game rules rather than one clock, and a
// row saying "ready" for them would mean nothing.
//
// BROKEN PAGES
//
// Some of these dailies' own pages are Flash and have been dead for years,
// while the handler they used to post to still works and still pays out:
// Coconut Shy, Bagatelle, and the Qasalan Expellibox. Those rows link to the
// handler, which the settings can switch back to the real page. Opening such
// a link IS the play, so the panel counts it the moment you click; for the
// Expellibox, whose handler lives on ncmall.neopets.com — another origin this
// script neither runs on nor can read — that click is the only signal there
// will ever be.
//
// SCOPE: reads the page, keeps timestamps, draws countdowns, alerts on zero.
// It does not visit, claim, spin, bet or submit anything.

(function () {
  "use strict";

  // ------------------------------------------------------- cross-origin bits
  //
  // Two things need care because this script runs on two different sites.
  //
  // STORAGE. localStorage belongs to one origin, so what the guide reads on
  // jellyneo.net cannot be written where the panel on neopets.com will find
  // it. Framing one site from the other is out — Jellyneo sends
  // X-Frame-Options: SAMEORIGIN — and fetching it is out too, since it sends
  // no access-control-allow-origin. The one store that spans both is the
  // userscript manager's own, GM_setValue/GM_getValue, which is why this
  // script asks for those two grants and nothing else.
  //
  // PAGE CONTEXT. Asking for any grant moves the script into the manager's
  // sandbox, where `window` is a wrapper rather than the page's own object —
  // and the request-watching detection works by wrapping the page's fetch and
  // XMLHttpRequest. `unsafeWindow` is the page's real window, so the patching
  // targets that. If a manager does not provide it, or refuses the write, the
  // script says so once and carries on: the text and click sources still
  // work, only the request source is lost.
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  const SHARED = (() => {
    const ok =
      typeof GM_setValue === "function" && typeof GM_getValue === "function";
    return {
      ok,
      get(key, fallback = null) {
        if (!ok) return fallback;
        try {
          const raw = GM_getValue(key, null);
          if (raw === null || raw === undefined) return fallback;
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        if (!ok) return;
        try {
          GM_setValue(key, JSON.stringify(value));
        } catch (err) {
          console.warn("[Neo Timers] shared store write failed", err);
        }
      },
    };
  })();

  // ------------------------------------------------------------------ config

  const DEFAULTS = {
    corner: "bottom-left",
    notify: true,
    beep: true,
    beepGain: 0.08,
    flashTitle: true,
    // Hide rows that are still counting down, leaving only what is ready.
    readyOnly: false,
    // Make the Quest Log row wait for the NeoPass tab as well as Daily
    // Quests. Off, because NeoPass quests are mostly logging in to two phone
    // games and plenty of people never touch them - and a row that can only
    // be finished by something you do not do is a row that says Ready for
    // ever.
    questlogNeoPass: false,
    // Rows past this are scrolled rather than drawn down the whole screen.
    maxRows: 12,
    // Point the rows whose own page is broken at the handler that still
    // works. Off means the row links to the real page, broken or not.
    useBypass: true,
    // Drop the names and let each activity's icon stand for it, which halves
    // the panel's width. The name is still in the row's tooltip.
    compact: false,
    // Open a row in its own tab, leaving whatever you were reading alone.
    newTab: true,
    // {trackerId: {minute, day}} — a window that has to be told to us, with
    // the NST day it was told for. See the Symol Hole.
    hourlyWindows: {},
    // Tracker ids, in the order you dragged them into. Empty means
    // DEFAULT_ORDER, which is Jellyneo's dailies list in its own order;
    // anything not listed there (a tracker added in an update) keeps its
    // registry place at the end rather than jumping to the top.
    order: [],
  };

  const SETTINGS_KEY = "np_timers_settings";
  const STATE_KEY = "np_timers_state";
  const LEGACY_SPRINGS_KEY = "np_healing_springs_state";
  // The Quest Log's two tabs, each read on its own visit - see
  // rememberQuestTab. Its own key rather than a field on the state above,
  // because that entry is deleted whenever the row goes back to Ready and
  // what the other tab said has to outlive that.
  const QUESTLOG_KEY = "np_timers_questlog";
  const TAG = "[Neo Timers]";

  // --------------------------------------------------------------- registry
  //
  // One entry per activity. `path` is matched against the start of the URL's
  // pathname, lowercased, so "/faerieland/caverns/" covers index.phtml and
  // anything else under it.
  //
  //   type: "interval" → `mins` is the cooldown
  //         "daily"    → resets at midnight NST
  //         "window"   → `windows` are [startHour, endHour) in NST
  //   used / refused: result-text patterns, for the few pages that state the
  //         outcome plainly. Without them a row is detected from your click.
  //   on: on by default, before you touch the settings (the Default button
  //       in the settings footer puts this set back).
  //   action: the control that counts as doing it, matched against a button's
  //       text, value or href. Without one, any button or action link in the
  //       page body counts.
  //   paths: further addresses the same activity answers on, matched the same
  //       way as path. The Fruit Machine has two.
  //   textOnly: only the page's own words mark this row. Nothing you click on
  //       it counts, because one go is not the whole thing - see Dice-A-Roo.
  //   pageOnly: likewise for a row read by countdown() - nothing you click is
  //       evidence, because the page already states the whole position. The
  //       training schools.
  //   href: where the row links, when that is not `path`. The training schools
  //       match on their own address but answer on their status page.
  //   cadenceWords: what the settings list says about how often, for a row
  //       whose `mins` is a fallback rather than a cadence.
  //   breaks / breakWords: hours in the NST day when the activity is shut and
  //       the row cannot be done at all, as [startHour, endHour), plus the
  //       words for it. Both kings take three of them.
  //   settled(): read the page and answer whether the whole thing is finished
  //       - true, false, or null for "this page cannot tell". Only the Quest
  //       Log has one, because it is the only row where a single click is a
  //       fraction of the day rather than the day. It outranks everything
  //       else and it is the only source that can also un-finish a row. A
  //       string in place of true means finished, in the row's own words,
  //       which is how Faerie Quests says "no Fortune Cookie active" rather
  //       than claiming you did something. It may also keep its own notes
  //       between visits, as the Quest Log does: see "the Quest Log's day".
  //   counter(): read the day's allowance off the page as {used, total}, the
  //       site's own figure rather than a tally kept here. hideCount keeps
  //       that figure out of the clock column, leaving the row to read Ready
  //       until it reaches the total.
  //   resetsIn / resetsAt / spanWords / everyWords: an allowance that does not
  //       run on the NST day. Only the Wishing Well does not: its seven wishes
  //       run to the next grant rather than to midnight, so it brings its own
  //       clock and the words to describe it. Everything else defaults to
  //       midnight NST and "a day".

  // The line that ends a day of Dice-A-Roo or Scorchy Slots. Taken from the
  // refresher's BORED_PATTERNS in this same folder, which is led by a line
  // captured off a real bored page: "Im SO BORED of Dice-A-Roo... let's play
  // something else!" - no apostrophe, and "SO" with a single o, which an
  // earlier guess at this got wrong. The vowel is left stretchable and the
  // pronoun optional in case the rendering varies, and the bare word is
  // there because Scorchy Slots' own wording has never been captured.
  const BORED_RE =
    /(?:\bi'?m\s+|\bis\s+)?so+\s+bored\s+of\b|\bbored\b|let'?s play something else/i;

  const MIN = 1;
  const HOUR = 60;
  const DAY = 24 * HOUR;

  const TRACKERS = [
    // ---- cooldowns ------------------------------------------------------
    {
      id: "springs",
      name: "Healing Springs",
      path: "/faerieland/springs.phtml",
      type: "interval",
      mins: 30,
      on: true,
      // The faerie states the outcome, so this one is read rather than
      // guessed. "No healing powers today" still burns the half hour, which is
      // why it counts as a visit; the refusal keeps any timer already running.
      //
      // These patterns are result sentences only. "hit points" used to be in
      // here and was the bug behind a timer that started on arrival: the idle
      // page lists every pet's hit points, so merely opening the springs read
      // as a heal.
      used: /(has|have) been fully healed|fully healed your|no healing powers|given you (a|an|some)[^.]{0,40}(potion|healing)/i,
      refused: /once every half|every half an hour|already visited|come back later/i,
      // Only this control counts as doing it. Without it, any click in the
      // page body would start the half hour — including a click on one of
      // your own pets.
      action: /heal/i,
    },
    {
      id: "poogle",
      name: "Poogle Racing",
      path: "/faerieland/poogleracing.phtml",
      type: "interval",
      mins: 15,
    },
    {
      id: "mediocrity",
      name: "Wheel of Mediocrity",
      path: "/prehistoric/mediocrity.phtml",
      type: "interval",
      mins: 40,
      on: true,
    },
    {
      id: "meteor",
      name: "Meteor",
      path: "/moon/meteor.phtml",
      type: "interval",
      mins: 1 * HOUR,
      note: "Hourly, but only one prize a day.",
    },
    {
      id: "symol",
      name: "Symol Hole",
      path: "/medieval/symolhole.phtml",
      // Both a window and a cooldown, and the window is not knowable from
      // here. Per Jellyneo: every hour has the same 4-minute prize window
      // that day (e.g. XX:57:00–XX:59:59), the minute changes daily, some
      // days have none at all, and the window never wraps past :59:59. An
      // attempt inside it starts a cooldown of exactly one hour; an attempt
      // outside it does nothing at all, and the page reads the same either
      // way. So the minute is a setting you fill in from Jellyneo's guide,
      // dated, and forgotten again the next NST day rather than quietly
      // going stale.
      type: "window",
      hourly: 4,
      cooldownMins: 60,
      note: "4 minutes every hour; the minute changes daily (Jellyneo publishes it).",
      guide: "https://www.jellyneo.net/?go=symolhole",
      // How today's window reads on that page, and how to tell whether the
      // page is actually today's: "November 20th Hourly Prize Window:" sits
      // right above "XX:57:00 to XX:59:59".
      guideWindow: /XX:(\d{2}):\d{2}\s*(?:to|[\u2013\u2014-])\s*XX:\d{2}:\d{2}/i,
      guideDate: /([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)\s+Hourly Prize Window/,
      guideNone: /no (?:valid )?window (?:at all )?today|prizes cannot be won today/i,
      action: /enter|jump|dive|cannonball|bellyflop|climb/i,
    },
    {
      id: "excitement",
      name: "Wheel of Excitement",
      path: "/faerieland/wheel.phtml",
      type: "interval",
      mins: 2 * HOUR,
      on: true,
    },
    {
      id: "misfortune",
      name: "Wheel of Misfortune",
      path: "/halloween/wheel/",
      type: "interval",
      mins: 2 * HOUR,
    },
    {
      id: "hauntedkiosk",
      name: "Haunted Fairgrounds Scratchcard",
      path: "/halloween/scratch.phtml",
      type: "interval",
      mins: 2 * HOUR,
    },
    {
      id: "buriedtreasure",
      name: "Buried Treasure",
      path: "/pirates/buriedtreasure/",
      type: "interval",
      mins: 3 * HOUR,
      on: true,
    },
    {
      id: "desertkiosk",
      name: "Desert Scratchcard Kiosk",
      path: "/desert/sc/kiosk.phtml",
      type: "interval",
      mins: 4 * HOUR,
    },
    {
      id: "gravedanger",
      name: "Grave Danger",
      path: "/halloween/gravedanger/",
      type: "interval",
      // Only the fallback now, for a timer started by a click rather than
      // read: an adventure lasts anywhere from four to ten hours, and four is
      // the earliest it could possibly be back. `countdown` below is what
      // normally sets this row, and this figure is used only when the page
      // could not be read at all.
      mins: 4 * HOUR,
      note: "Four to ten hours \u2014 the page's own countdown is read when you visit.",
      on: true,
      // Grave Danger is the one activity that prints how long is left, so
      // there is no need to assume the shortest adventure and then be wrong
      // by up to six hours. Two readings of the same number, best first:
      //
      //   GDActive.target is the server timestamp the page's own counter
      //   counts down to, and GD.offset is its correction for a browser clock
      //   that disagrees with the server (0 on the page this was read from).
      //   Both are plain numbers in an inline script, so neither needs the
      //   page's own objects to be reachable - which matters, because this
      //   script runs with a grant and so has its own window.
      //
      //   #gdRemaining is the rendered form of it: "2 hours, 9 minutes, 35
      //   seconds". Second because that is the English of it, and the account
      //   sets the language - a number does not need translating.
      //
      // Returns milliseconds left, 0 if the Petpet is home and the row should
      // read ready, or null if neither could be found - a layout change, say -
      // in which case nothing is written and the watchers below carry on as
      // they did before.
      countdown() {
        const src = [...document.scripts].map((el) => el.textContent || "").join("\n");
        const target = src.match(/GDActive[\s\S]{0,400}?target:\s*"?(\d{9,12})"?/);
        if (target) {
          const offset = src.match(/GD\s*=\s*\{[\s\S]{0,300}?offset:\s*(-?\d+)/);
          const ms = (Number(target[1]) - Number(offset?.[1] || 0)) * 1000 - Date.now();
          // A timestamp that puts the end more than a day out is not this
          // adventure, whatever it is, and is not worth storing.
          if (ms > 0 && ms <= 24 * 60 * 60_000) return ms;
        }
        const said = document.getElementById("gdRemaining")?.textContent || "";
        const hms = said.match(/(\d+)\D+(\d+)\D+(\d+)/);
        if (hms) {
          return (Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])) * 1000;
        }
        // No countdown anywhere, but the page is offering the Petpet picker:
        // nothing is out, so whatever we were holding has expired.
        if (document.getElementById("gdSelection")) return 0;
        return null;
      },
    },
    // The one row here whose cadence nobody states the same way twice. It is
    // per pet and counted from that pet's last catch rather than from
    // midnight; Jellyneo's dailies list simply calls it "(Random)", The
    // Daily Neopets says the wait is random but "usually in the 12 to 24
    // hour range", and SunnyNeo says a pet is back "as minimum as 2 hours to
    // at most 24". Twelve is the figure this counts from: the low end of the
    // range the two guides agree on, so the row is sometimes green early and
    // is not green late, and fishing early costs an empty net rather than a
    // missed day.
    //
    // `refused` is what the page says when you fish before your pet is ready
    // - the catch comes up empty with "Maybe you should be more patient" -
    // which is the one thing the page does tell us: the wait is still
    // running. It says nothing about how much is left, so a timer already
    // stored beats it (see the refused branch in watchForVisit).
    {
      id: "fishing",
      name: "Ye Olde Fishing Vortex",
      path: "/water/fishing.phtml",
      type: "interval",
      mins: 12 * HOUR,
      on: true,
      note: "Per pet, counted from its last catch \u2014 anywhere from 12 to 24 hours, so this counts the earliest.",
      refused: /more patient/i,
    },
    {
      id: "icekiosk",
      name: "Ice Caves Scratchcard Kiosk",
      path: "/winter/kiosk.phtml",
      type: "interval",
      mins: 6 * HOUR,
    },
    {
      id: "strength",
      name: "Test Your Strength",
      path: "/halloween/strtest/",
      type: "interval",
      mins: 6 * HOUR,
      on: true,
    },
    {
      id: "expellibox",
      name: "Qasalan Expellibox",
      // Jellyneo's link for this one points at an NC giveaway page; the
      // Expellibox itself is here.
      path: "/desert/expellibox.phtml",
      type: "interval",
      mins: 7 * HOUR + 7 * MIN,
      on: true,
      // The lever is one of the dailies whose own page no longer works. Its
      // handler does, and it lives on ncmall.neopets.com — a different origin,
      // so nothing there can be watched from here (see the comment on
      // BYPASS_NOTE). The click on the row's link is what marks it.
      bypass: "https://ncmall.neopets.com/games/giveaway/process_giveaway.phtml",
    },
    {
      id: "illusen",
      name: "Illusen's Glade",
      path: "/medieval/earthfaerie.phtml",
      type: "interval",
      mins: 12 * HOUR,
    },
    {
      id: "jhudora",
      name: "Jhudora's Bluff",
      path: "/faerieland/darkfaerie.phtml",
      type: "interval",
      mins: 12 * HOUR,
    },
    {
      id: "shrine",
      name: "Coltzan's Shrine",
      path: "/desert/shrine.phtml",
      type: "interval",
      mins: 13 * HOUR,
      on: true,
    },
    {
      id: "braintree",
      name: "Brain Tree Quests",
      path: "/halloween/braintree.phtml",
      type: "interval",
      mins: 24 * HOUR,
    },
    {
      id: "hiddentower",
      name: "Hidden Tower",
      path: "/faerieland/hiddentower",
      type: "interval",
      mins: 24 * HOUR,
      note: "One purchase every 24 hours.",
    },
    {
      id: "magmapool",
      name: "Magma Pool",
      path: "/magma/pool.phtml",
      type: "interval",
      mins: 8 * DAY,
      note: "Also has a per-account minute each day — this is the 8-day wait.",
    },

    // ---- midnight NST ---------------------------------------------------
    { id: "trudy", name: "Trudy's Surprise", path: "/trudys_surprise.phtml", type: "daily", on: true },
    { id: "tombola", name: "Tombola", path: "/island/tombola.phtml", type: "daily", on: true },
    // Two pages, one activity. Jellyneo's dailies list links the Fruit
    // Machine at /desert/fruitmachine.phtml, and that is what this row links
    // to, but Neopets' own premium Dailies widget links it at
    // /desert/fruit/index.phtml - one of the two redirects to the other. A
    // row that knew only the first saw nothing at all once the page it
    // landed on was the second: no tracker matched, so no watcher was armed
    // and a spin was never recorded. Claiming both pages costs nothing and
    // works whichever way the redirect goes.
    {
      id: "fruitmachine",
      name: "Fruit Machine",
      path: "/desert/fruitmachine.phtml",
      paths: ["/desert/fruit/"],
      type: "daily",
      on: true,
    },
    { id: "applebobbing", name: "Apple Bobbing", path: "/halloween/applebobbing.phtml", type: "daily" },
    { id: "anchor", name: "Anchor Management", path: "/pirates/anchormanagement.phtml", type: "daily" },

    // Ten bets a round, and the round is not the day: Jellyneo's guide has the
    // pirates eating from 1:45pm NST, and says that since July 2026 the finish
    // has been "somewhat random, ranging day-to-day anywhere between 2:15pm and
    // 7:00pm NST". Betting is shut while they eat, and a fresh round opens
    // after, so a day can hold the end of one round and the start of the next.
    //
    // None of which this row has to work out, because the bet page carries the
    // server's own answer. #fc-bet-form holds data-bets-placed - the count for
    // the round in front of you, which foodclub.js re-stamps from the reply to
    // every bet and which a new round starts at zero. So the row is read, not
    // counted and not clicked: any bets placed is a yes, none is a no, and the
    // no is what brings the row back when the round turns over without waiting
    // for midnight.
    //
    // Page-read only, like the Quest Log and the well: a settled() stops the
    // chain before the click and submit watchers. That is the point here
    // rather than a side effect - the tabs are AJAX over tab.php, so an armed
    // request watcher would count opening "Place a Bet" as placing one, and an
    // armed click watcher would count the tab link, which is a link to this
    // same path with a query on it.
    {
      id: "foodclub",
      name: "Food Club",
      path: "/pirates/foodclub.phtml",
      // The bet tab, since that is the one page here that can answer the
      // question. The overview can only say whether betting is open at all.
      href: "/pirates/foodclub.phtml?tab=bet",
      type: "daily",
      // On, unlike the three training schools: a row nobody can see is not an
      // added row, and this one was asked for by name.
      on: true,
      note: "Ten bets a round. The row reads the bet page's own count for the round in front of you, so it comes back when a new round opens \u2014 which is any time from about 2:15pm NST \u2014 and not only at midnight. Winnings keep for seven days.",
      resetsAt: "midnight NST, or sooner when the bet page shows a new round",
      settled() {
        // The count the server put on the form, for this round. Read by
        // attribute rather than by any wording, because it is a number the
        // page's own script trusts enough to re-stamp after every bet.
        const form = document.getElementById("fc-bet-form");
        const placed = Number(form?.getAttribute("data-bets-placed"));
        if (form && Number.isFinite(placed)) {
          if (placed <= 0) return false;
          return `${placed} bet${placed === 1 ? "" : "s"} in for this round`;
        }
        // Any other tab, where there is no form to read. #fc-app carries
        // data-bets-on, and a zero means the pirates are eating: there is
        // nothing to place until the next round, so the row stands down with
        // those words rather than claiming you bet. If you forgot, it says
        // betting is closed, which is the true and useful thing to say.
        const app = document.getElementById("fc-app");
        if (app && app.getAttribute("data-bets-on") === "0") {
          return "betting is closed for this round";
        }
        // Betting is open and this page cannot say whether yours are in. Not
        // a no \u2014 a no here would wipe a reading taken on the bet page.
        return null;
      },
    },
    // The shore is the day whether or not it gives you anything, and on a day
    // it gives you nothing there is nothing on the page to click: a find shows
    // as an object poking out of the sand and collecting it is a click, which
    // is what this row used to be detected from, so an empty visit left the
    // row saying Ready all day. The caption is what settles it instead -
    // SunnyNeo quotes it as "A deserted shore stretches along in front of you,
    // but there's nothing of interest to be found today." Matched on the
    // middle of that sentence, so the apostrophe and the surrounding words
    // are not load-bearing. The found caption ("something buried in the
    // sand") is deliberately not matched: at that point the day is still
    // yours to take, and the click takes it.
    {
      id: "forgottenshore",
      name: "Forgotten Shore",
      path: "/pirates/forgottenshore.phtml",
      type: "daily",
      used: /nothing of interest/i,
    },
    { id: "desertedtomb", name: "Deserted Tomb", path: "/worlds/geraptiku/tomb.phtml", type: "daily" },
    { id: "omelette", name: "Giant Omelette", path: "/prehistoric/omelette.phtml", type: "daily", on: true },
    { id: "jelly", name: "Giant Jelly", path: "/jelly/jelly.phtml", type: "daily", on: true },
    { id: "lunar", name: "Lunar Temple", path: "/shenkuu/lunar/", type: "daily" },
    { id: "neggcave", name: "Mysterious Negg Cave", path: "/shenkuu/neggcave/", type: "daily" },
    { id: "darkcave", name: "Dark Cave", path: "/magma/darkcave.phtml", type: "daily" },
    { id: "quarry", name: "Moltara Quarry", path: "/magma/quarry.phtml", type: "daily" },
    { id: "council", name: "Council Chamber", path: "/altador/council.phtml", type: "daily" },
    // Both kings leave the throne three times a day and the page shows an
    // empty one with a sign on it, so Ready was a lie for three hours out of
    // every twenty-four and a visit in one of them achieved nothing. The hours
    // are below, and the page's own words are matched as well: between them
    // the row stands down whether or not you have been to look.
    //
    // Hagan's three are agreed on by Jellyneo and SunnyNeo alike. Skarl's
    // middle one is not: Jellyneo says 12:00-1:00 PM NST (and its quest log
    // says the Skarl joke quest cannot be done then), SunnyNeo says 1-2PM. The
    // narrower claim is the one taken, because an hour wrongly called Ready
    // costs a wasted click that the "back in an hour" line below then catches,
    // whereas an hour wrongly called shut costs a joke that was there to tell.
    {
      id: "wiseking",
      name: "Wise Old King",
      path: "/medieval/wiseking.phtml",
      type: "daily",
      note: "Once a day. He studies 8\u20139am, 1\u20132pm and 7\u20138pm NST, and the throne is empty through it.",
      breaks: [[8, 9], [13, 14], [19, 20]],
      breakWords: "off studying",
      // SunnyNeo quotes the empty-throne page as "It's time for King Hagan's
      // daily studying session. He's off reading Brightvale Maps at the
      // moment. You should try back in an hour or so."
      notyet: /daily studying session|try back in an hour/i,
    },
    {
      id: "grumpyking",
      name: "Grumpy Old King",
      path: "/medieval/grumpyking.phtml",
      type: "daily",
      note: "Twice a day. He eats 8\u20139am, 12\u20131pm and 7\u20138pm NST, and the throne is empty through it.",
      breaks: [[8, 9], [12, 13], [19, 20]],
      breakWords: "out to lunch",
      // And Skarl's as "King Skarl has gone to feast on some Chunky Meaty
      // Stew. You should try back in an hour or so. He might be in a better
      // mood with a full stomach." The stew is presumably not the only dish.
      notyet: /gone to feast|better mood with a full stomach|try back in an hour/i,
    },
    {
      id: "marrow",
      name: "Guess the Marrow's Weight",
      path: "/medieval/guessmarrow.phtml",
      type: "daily",
      // Your guess is once a day, but the day does not begin at midnight: the
      // competition starts on the hour at a random time (seen anywhere from
      // 1am to 10pm NST) and ends early the moment ten people have guessed
      // right. So "ready" here only ever means "worth a look", and the three
      // messages below are what the page actually says.
      randomStart: true,
      note: "One guess a day. The competition starts on a random hour (1am\u201310pm NST) and ends once ten people guess right.",
      used: /you have had your guess for today|competition has already been won/i,
      notyet: /competition has not started yet|marrows take a while to grow/i,
    },
    { id: "crossword", name: "Faerie Crossword", path: "/games/crossword/", type: "daily" },
    { id: "dailypuzzle", name: "Daily Puzzle", path: "/community/", type: "daily" },
    { id: "kikopop", name: "Kiko Pop", path: "/worlds/kiko/kpop/", type: "daily" },

    // Neither of these is done by doing it once: you play until the pet says
    // it is bored of the game, which takes a few hundred plays and is the
    // only thing that ends the day. So the row is marked by the page's own
    // words and by nothing else - `textOnly` keeps the request and click
    // watchers off, since a play is not a visit to record and arming them
    // would tick the row off on the first roll.
    //
    // The day itself resets at midnight NST, like every other row in this
    // section, and the manual tick still works if you played elsewhere.
    {
      id: "dicearoo",
      name: "Dice-A-Roo",
      path: "/games/dicearoo.phtml",
      paths: ["/games/play_dicearoo.phtml"],
      type: "daily",
      on: true,
      note: "Played until the pet is bored of it \u2014 the row is marked by that line, and the day resets at midnight NST.",
      used: BORED_RE,
      textOnly: true,
    },
    {
      id: "slots",
      name: "Scorchy Slots",
      path: "/games/slots.phtml",
      type: "daily",
      on: true,
      note: "Played until the pet is bored of it \u2014 the row is marked by that line, and the day resets at midnight NST.",
      used: BORED_RE,
      textOnly: true,
    },
    // Left over from The Void Within and still paying out after the plot
    // closed. Jellyneo lists it as "up to twice per day" - the second go is a
    // Premium subscription or watching an advert - so one row cannot be the
    // whole truth here: it counts the first play and says the rest in its note.
    { id: "lostinthedark", name: "Lost in the Dark", path: "/games/lostinthedark/", type: "daily", on: true, note: "Once a day \u2014 twice with Premium, or by watching an advert." },
    { id: "grundo", name: "Blue Grundo Plushie", path: "/faerieland/tdmbgpop.phtml", type: "daily" },
    { id: "caverns", name: "Faerie Caverns", path: "/faerieland/caverns/", type: "daily", note: "Up to twice a day." },
    { id: "bank", name: "Bank Interest", path: "/bank.phtml", type: "daily", on: true },

    // The Quest Log is not a daily you do once; it is five quests, a bonus, a
    // streak and a second tabful of NeoPass quests, and it is finished when
    // every reward on both tabs has been claimed. A click or an AJAX call
    // would tick the row off on the first claim of six, which is why the
    // hub's own AJAX is in NOISE_RE and why this row reads the page instead.
    //
    // Read from the DOM rather than from window.__questLogConfig: that object
    // is the page as it was served, and the Vue app deep-clones it, so it
    // never changes as you claim. The rendered hub does, on both paths - a
    // Premium auto-claim leaves the card in place with ql-quest-claimed on
    // it, and a manual claim splices the card out of the list altogether.
    {
      id: "questlog",
      name: "Quest Log",
      path: "/questlog/",
      type: "daily",
      on: true,
      note: "Finished when the hub says you have earned the day's bonus. The setting can make it wait for the NeoPass tab as well.",
      settled() {
        const tab = activeQuestTab();
        if (!tab) return null;
        if (tab === "neopass") {
          const group = activeQuestGroupLabel();
          // "" is a tab with no groups, which is this row's business; a named
          // group has to be the dailies one. See activeQuestGroupLabel.
          if (group && !/dail/i.test(group)) return null;
        }
        const earned = questBonusEarned();
        if (earned === null) return null;
        const seen = rememberQuestTab(tab, earned);
        // Daily Quests is the row. NeoPass only joins in when asked.
        if (!seen.daily) return false;
        return settings.questlogNeoPass ? !!seen.neopass : true;
      },
    },
    { id: "lab", name: "Lab Ray", path: "/lab.phtml", type: "daily", on: true },
    { id: "petpetlab", name: "Petpet Lab Ray", path: "/petpetlab.phtml", type: "daily" },

    // ---- the training schools -------------------------------------------
    // Not dailies at all: a course runs from an hour to several days, and what
    // the row is for is the moment it ends. All three read the same way - see
    // trainingCountdown - and all three link to their status page rather than
    // their course list, because the status page is the one that answers.
    //
    // `mins` is only the fallback for a hand-tick, and an hour is the shortest
    // course the cheapest school sells; the next visit replaces the guess with
    // the page's own figure.
    //
    // All three start switched off. There are three schools and a pet trains
    // at one of them - whichever its level allows - so turning them all on put
    // two rows in the panel that nobody was ever going to act on.
    {
      id: "training",
      name: "Training School",
      path: "/island/training.phtml",
      href: "/island/training.phtml?type=status",
      type: "interval",
      mins: 1 * HOUR,
      cadenceWords: "as long as the course takes",
      pageOnly: true,
      note: "Mystery Island, paid in codestones. Ready when a course is finished or no pet is on one; the clock is the first pet to finish.",
      countdown: trainingCountdown,
    },
    {
      id: "ninjatraining",
      name: "Secret Ninja Training School",
      path: "/island/fight_training.phtml",
      href: "/island/fight_training.phtml?type=status",
      type: "interval",
      mins: 1 * HOUR,
      cadenceWords: "as long as the course takes",
      pageOnly: true,
      note: "The school for pets past level 250, paid in codestones. Ready when a course is finished or no pet is on one; the clock is the first pet to finish.",
      countdown: trainingCountdown,
    },
    {
      id: "academy",
      name: "Swashbuckling Academy",
      path: "/pirates/academy.phtml",
      href: "/pirates/academy.phtml?type=status",
      type: "interval",
      mins: 1 * HOUR,
      cadenceWords: "as long as the course takes",
      pageOnly: true,
      note: "Cap'n Threelegs', paid in dubloons. Ready when a course is finished or no pet is on one; the clock is the first pet to finish.",
      countdown: trainingCountdown,
    },
    { id: "coincidence", name: "The Coincidence", path: "/space/coincidence.phtml", type: "daily" },
    { id: "mystic", name: "Island Mystic", path: "/island/mystichut.phtml", type: "daily" },
    { id: "haiku", name: "Haiku Generator", path: "/island/haiku/", type: "daily" },
    { id: "pickyourown", name: "Pick Your Own", path: "/medieval/pickyourown", type: "daily" },
    { id: "lottery", name: "Neopian Lottery", path: "/games/lottery.phtml", type: "daily" },
    { id: "extravagance", name: "Wheel of Extravagance", path: "/desert/extravagance.phtml", type: "daily" },
    { id: "knowledge", name: "Wheel of Knowledge", path: "/medieval/knowledge.phtml", type: "daily" },
    { id: "monotony", name: "Wheel of Monotony", path: "/prehistoric/monotony/", type: "daily" },
    { id: "starlight", name: "Wheel of Starlight", path: "/premium/wheel.phtml", type: "daily" },
    { id: "ticketbooth", name: "Tyrannian Ticket Booth", path: "/prehistoric/ticketbooth.phtml", type: "daily" },
    { id: "shopofoffers", name: "Rich Slorg (Shop of Offers)", path: "/shop_of_offers.phtml", type: "daily" },
    { id: "tyrannianticket", name: "Tyrannian Battleground", path: "/prehistoric/battleground/", type: "daily" },

    // ---- fixed NST windows ----------------------------------------------
    // ---- per-day allowances ---------------------------------------------
    // Counted rather than timed: twenty tries a day, so the row shows how many
    // are gone instead of a countdown, and only starts counting down once the
    // allowance is spent. Both of these are Deserted Fairground games whose
    // own pages are Flash and dead; their handlers still work.
    // The Battledome has no cooldown at all: what resets at midnight NST is
    // the item drops. It is the only allowance here whose figure does not
    // have to be guessed at - the arena prints "1/20" under "Items won in
    // the Battledome today" - so this row shows the site's own number rather
    // than a tally of clicks, the way Grave Danger shows the site's own
    // clock. `uses` is only the fallback for a row that has never been read:
    // fifteen is the base allowance, and Premium adds five, which is why the
    // total is taken from the page rather than fixed here.
    {
      id: "dome",
      name: "Battledome",
      path: "/dome/",
      type: "allowance",
      uses: 15,
      on: true,
      note: "15\u201320 item drops a day (Premium adds 5), reset at midnight NST.",
      // The figure is read, but not printed where the clock goes. "1/20" in
      // that column read as a countdown to something and is not one: nothing
      // about the Battledome is rationed by it, and the only moment the
      // number matters is the one where it reaches the cap and the drops stop
      // - which the row already says in words. So the row reads Ready until
      // used reaches the total the page itself gives (15 without Premium, 20
      // with), and the running figure stays in the tooltip.
      hideCount: true,
      counter() {
        // The page's own object first: arena.phtml exposes it as
        // window.battleDomeLimits(), and a number needs no parsing. This
        // script runs with grants and so has its own window, which is why it
        // has to be reached through unsafeWindow.
        try {
          const live = typeof unsafeWindow !== "undefined" && unsafeWindow.battleDomeLimits?.();
          if (live && Number(live.TotalPrizesPerday) > 0) {
            return {
              used: Number(live.PrizesEarnedToday),
              total: Number(live.TotalPrizesPerday),
            };
          }
        } catch {
          /* the page has no such function, or will not hand it over */
        }
        // Failing that, the figure as printed beside the counter's label.
        const said = document.getElementById("prizeLimits")?.textContent || "";
        const m = said.match(/(\d+)\s*\/\s*(\d+)/);
        if (!m) return null;
        const used = Number(m[1]);
        const total = Number(m[2]);
        // A total of zero, or a tally wildly past it, is not this counter.
        if (!total || total > 100 || used > total + 5) return null;
        return { used, total };
      },
    },

    {
      id: "cocoshy",
      name: "Coconut Shy",
      path: "/halloween/coconutshy.phtml",
      type: "allowance",
      uses: 20,
      bypass: "https://www.neopets.com/halloween/process_cocoshy.phtml?coconut=4",
      bypassPath: "/halloween/process_cocoshy.phtml",
      note: "20 throws a day, 100 NP each.",
      // Captured from the handler's own answer, which is the whole page when
      // you follow the direct link:
      //   points=0&totalnp=535591&success=0&error=Oi%21+No+more+throws%2C+
      //   you%27ve+had+yer+lot.
      // Matched against that raw body, where the spaces are "+", so every
      // gap below is [+\s] rather than a space - the same pattern then works
      // whether or not something has decoded it first.
      spent: /no[+\s]more[+\s]throws|had[+\s]yer[+\s]lot/i,
    },
    {
      id: "corkgun",
      name: "Cork Gun Gallery",
      path: "/halloween/corkgun.phtml",
      type: "allowance",
      uses: 20,
      bypass: "https://www.neopets.com/halloween/process_corkgun.phtml",
      bypassPath: "/halloween/process_corkgun.phtml",
      note: "20 shots a day.",
      // Captured like the other two, and the plainest of the three:
      //   totalnp=560786&success=99&error=No+more+shots+today.
      // Note the success=99 - not the 0 the other two send - which is why
      // the wording is what stands this row down and the success field is
      // only ever used to avoid counting a play that did not happen.
      spent: /no[+\s]more[+\s]shots[+\s]today/i,
    },
    {
      id: "bagatelle",
      name: "Bagatelle",
      path: "/halloween/bagatelle.phtml",
      type: "allowance",
      uses: 20,
      bypass: "https://www.neopets.com/halloween/process_bagatelle.phtml",
      bypassPath: "/halloween/process_bagatelle.phtml",
      note: "20 plays a day, 50 NP each.",
      // Captured the same way:
      //   points=0&totalnp=532786&success=0&error=Hey%2C+kid%2C+why+don%27t+
      //   you+let+somebody+else+play%3F
      spent: /let[+\s]somebody[+\s]else[+\s]play/i,
    },

    // Seven wishes rather than twenty, and the only allowance here that is not
    // a day: see msUntilWellGrant for the two grant times it runs to instead.
    // Like the Battledome it is read rather than counted - the well prints
    // "Wish Count: N", which is the server's own figure and moves for a wish
    // made in another tab or refused by the form, neither of which a count of
    // clicks here would see.
    {
      id: "wishingwell",
      name: "Wishing Well",
      path: "/wishing.phtml",
      paths: ["/process_wishing.phtml"],
      // Once a window, not seven times. This was an allowance counting the
      // well's own "Wish Count: N" towards seven, and the tally was both more
      // than the row needed and wrong in practice: seven is the well's limit,
      // but a window's worth of wishing is one errand, and "3/7" on the row
      // was reporting a number nobody was going to act on. Whether the window
      // has been used at all is the thing worth knowing.
      type: "daily",
      on: true,
      note: "One errand a twelve-hour window (the well allows seven wishes, 21 NP each). It grants and wipes its slate at about 8am and 8pm NST, which is when this row comes back.",
      // Not midnight, like every other daily here: the well's day is the
      // twelve hours to its next grant. See msUntilWellGrant.
      resetsIn: msUntilWellGrant,
      resetsAt: "the next grant, about 8am or 8pm NST",
      spanWords: "this window",
      settled() {
        // The well's own figure, read as a yes or no rather than as a tally.
        // It belongs to the window and is wiped at the grant, so any count at
        // all means this window has been used, and a zero means it has not -
        // which is the one thing a click can never tell us, a wiped slate
        // looking exactly like a window nobody has touched.
        //
        // Read off the whole page rather than the <b> it is printed in, since
        // nothing promises the tag.
        //
        // Page-read and nothing else - a settled() stops the chain before the
        // click and submit watchers, here as on the Quest Log, which is why
        // this row carries no `action`. The well's own page always prints the
        // count, so the only visit this cannot read is the one a wish lands
        // on, and that page is not where you find out how the window is
        // going: the next look at the well is, and it says so.
        const m = (document.body?.textContent || "").match(/Wish\s*Count:\s*(\d+)/i);
        if (!m) return null;
        return Number(m[1]) > 0;
      },
    },

    // A Faerie Quest is normally a Random Event, which is why no row here
    // tracks one - a countdown to something with no schedule is a made-up
    // number. The Fortune Cookie is the exception: it is bought from the NC
    // Mall and gives one quest a day for a week, which is a day's allowance
    // like any other, and the quests page carries the cookie's own banner
    // saying whether today's has been taken.
    {
      id: "faeriequest",
      name: "Faerie Quests",
      path: "/quests.phtml",
      type: "daily",
      on: true,
      note: "A Faerie Quest Fortune Cookie gives one quest a day. This row is that banner's own answer, and says so when no cookie is active.",
      settled() {
        // The cookie's banner, which the quests page carries only while a
        // cookie is live. Its absence is an answer rather than a failure to
        // read: no cookie, nothing to accept, and the row stands down for the
        // day with those words rather than claiming you did something.
        //
        // The banner is skinned per cookie type (lq_faeriequest here, and
        // lq_faeriequest_dlx for the deluxe one), so the class is deliberately
        // not matched - only the shared wrapper, on a path that is the faerie
        // quests page anyway.
        //
        // Buy a cookie later the same day and this is briefly wrong: the row
        // is already stood down and nothing will say otherwise until you open
        // the page, which then reads the new banner and puts the row back. The
        // alternative - a row that says Ready to everyone who owns no cookie,
        // every day, for ever - is wrong far more often.
        if (!document.querySelector(".fc-banner-header")) {
          return "no Fortune Cookie, so nothing to accept";
        }
        // "Accept Today's Quest" is rendered only while today's quest can
        // still be claimed, so its presence is the whole reading. The page's
        // own script intercepts that button and posts to accept.php without a
        // reload, replacing the banner with a fresh copy - which the re-read
        // picks up a few seconds later.
        if (document.getElementById("fq-fc-accept")) return false;
        return "today's quest has been accepted";
      },
    },

    {
      id: "snowager",
      name: "Snowager",
      path: "/winter/snowager.phtml",
      type: "window",
      windows: [[6, 7], [14, 15], [22, 23]],
      on: true,
    },
    {
      id: "deadlydice",
      name: "Deadly Dice",
      path: "/worlds/deadlydice.phtml",
      type: "window",
      windows: [[0, 1]],
    },
  ];

  // The order the panel lists rows in before you drag anything, taken from
  // the same Jellyneo dailies list the cadences came from (read 2026-11-24).
  // The registry above is grouped by kind, which is how it is read and
  // maintained but not how anyone does their dailies; this is the running
  // order of an actual dailies run, so it is the better default. Ids not
  // named here - the ones Jellyneo does not list, and anything added in a
  // later update - keep their registry place at the end rather than jumping
  // to the top, and a dragged order in the settings beats this entirely.
  const DEFAULT_ORDER = [
    "bank", "questlog", "faeriequest", "dome", "trudy", "grundo", "fishing",
    "anchor",
    "foodclub", "applebobbing", "shrine", "council", "desertedtomb", "shopofoffers",
    "caverns", "lostinthedark", "forgottenshore", "fruitmachine", "jelly",
    "omelette", "gravedanger", "tombola", "springs", "neggcave", "wiseking",
    "grumpyking", "lottery", "marrow", "dicearoo", "slots", "kikopop",
    "expellibox", "strength", "buriedtreasure", "cocoshy", "bagatelle",
    "wishingwell", "lab", "petpetlab", "training", "ninjatraining",
    "academy", "excitement", "knowledge",
    "mediocrity", "misfortune", "monotony", "extravagance", "starlight",
    "hauntedkiosk", "icekiosk",
  ];
  // Jellyneo picks an item image for every daily on its list, and they are all
  // served from images.neopets.com — the same host the page is already loading
  // art from — so the panel borrows them rather than inventing its own icon
  // set. Paths are relative to IMG_HOST; a missing one simply leaves the row
  // without a picture (see the onerror in renderRows).
  //
  // Qasalan Expellibox is the one hand-picked entry: Jellyneo's row for it
  // links to an NC giveaway page, so the id could not be matched by URL, and
  // its scarab is filled in here by name.
  const IMG_HOST = "https://images.neopets.com";
  const ICONS = {
    wishingwell: "items/stamp_neo_well.gif",
    dome: "items/bd_spirit_blade.gif",
    dicearoo: "items/fur_dice_gold.gif",
    slots: "games/clicktoplay/icon_8.gif",
    fishing: "items/vor_evilcarp.gif",
    springs: "items/mag_healing_striped.gif",
    poogle: "items/toy_poogle_blue.gif",
    mediocrity: "items/toy_action_plesio.gif",
    meteor: "items/bd_meteor_rock.gif",
    symol: "items/symol_brown.gif",
    excitement: "items/toy_faerie_light.gif",
    misfortune: "items/gar_wheelmisfortune.gif",
    hauntedkiosk: "items/bd_sssidney_tickets.gif",
    buriedtreasure: "items/mall_jjpb_treasurechesttrinket.gif",
    desertkiosk: "items/scr_coltzans_cash.gif",
    gravedanger: "items/boo_zombiehandbook.gif",
    icekiosk: "items/toy_kiosk_plushie.gif",
    strength: "items/gar_testyourstrength.gif",
    expellibox: "items/bat_desert_scarab.gif",
    illusen: "items/toy_faerie_illusen.gif",
    jhudora: "items/toy_faerie_jhudora.gif",
    shrine: "items/bd_desert_deathmask.gif",
    braintree: "items/toy_brain1.gif",
    hiddentower: "items/fyora_supreme_doll.gif",
    magmapool: "items/bg_magma_pool.gif",
    trudy: "items/boo_defender_mynci.gif",
    tombola: "items/toy_squeezy_tombola.gif",
    fruitmachine: "items/food_desert3.gif",
    applebobbing: "items/spf_slimy_apple.gif",
    anchor: "items/fur_pirate_anchor.gif",
    foodclub: "items/fatboyburger.gif",
    forgottenshore: "items/bg_forgotten_shore.gif",
    desertedtomb: "items/bd_ger_goldtalisman.gif",
    omelette: "items/om_sausage_pepperoni1.gif",
    jelly: "items/jel_cornupepper_whole.gif",
    lunar: "items/fur_lunar_chart.gif",
    neggcave: "items/gif_fony14_fg_darkmagic.gif",
    darkcave: "items/mmat_moltite.gif",
    quarry: "items/mmat_obsidian.gif",
    council: "items/toy_kingaltador_figure.gif",
    wiseking: "items/usuki_hagan.gif",
    grumpyking: "items/toy_plushie_skarl.gif",
    marrow: "items/marrow_veg.gif",
    crossword: "items/fbo_library_tales.gif",
    dailypuzzle: "events/500neopoints.gif",
    kikopop: "items/foo_kiko_carmelpopcorn.gif",
    lostinthedark: "items/gwl_empty_lantern.gif",
    grundo: "items/plu_TDMBGPOP_replica.gif",
    caverns: "items/bg_faerie_caverns.gif",
    bank: "items/ltoo_scorch_bank.gif",
    questlog: "items/toy_hannah_action.gif",
    faeriequest: "items/mall_fortcookie_4.gif",
    training: "items/codestone3.gif",
    ninjatraining: "items/codestone12.gif",
    academy: "items/dubloon2.gif",
    lab: "items/labmap_09.gif",
    petpetlab: "items/petpetlab_soot.gif",
    coincidence: "items/rpp_reu2014_robotassispetpet.gif",
    mystic: "items/toy_plushie_mystic.gif",
    haiku: "items/toy_plushie_rorru.gif",
    pickyourown: "items/4clover.gif",
    lottery: "games/clicktoplay/icon_58.gif",
    extravagance: "items/sta_wheel_of_extravagance.gif",
    knowledge: "items/toy_bv_wheelofknowledge.gif",
    monotony: "items/toy_monotony_plushie.gif",
    starlight: "items/185mjdi5jd.gif",
    ticketbooth: "items/ticket_mmband.gif",
    shopofoffers: "items/mall_roamingwindslorg.gif",
    tyrannianticket: "items/bd_tyweof2013_itsashovel.gif",
    cocoshy: "items/spo_coconut_15.gif",
    bagatelle: "items/gar_bagatelle.gif",
    corkgun: "items/can_box_fruitbeans.gif",
    snowager: "items/toy_snowager_plushie.gif",
    deadlydice: "items/bd_vonroo_dice.gif",
  };

  const BY_ID = new Map(TRACKERS.map((t) => [t.id, t]));

  // ------------------------------------------------------------------ store

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`${TAG} could not persist ${key}`, err);
    }
  }

  let settings = (() => {
    const stored = readJSON(SETTINGS_KEY, null);
    if (stored) return { ...DEFAULTS, enabled: {}, alerts: {}, ...stored };
    // First run: the default set, with alerts on for everything in it.
    const enabled = {};
    const alerts = {};
    TRACKERS.forEach((t) => {
      if (t.on) {
        enabled[t.id] = true;
        alerts[t.id] = true;
      }
    });
    return { ...DEFAULTS, enabled, alerts };
  })();

  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
  }

  function isOn(id) {
    const stored = settings.enabled[id];
    // A tracker added to this script after you last saved your settings has no
    // entry at all, which is not the same as being turned off: it predates the
    // choice. So it falls back to whether it is in the default set, and a row
    // added in an update shows up instead of hiding until you go looking for
    // it. Turning it off writes false, which is an answer and is kept.
    // Unless the map is empty, which is the one state that says you turned
    // everything off on purpose: the None button writes it, and falling back
    // to the default set there would put eighteen rows back in an empty panel.
    // (A first run is not this case - it writes the default set out.)
    if (stored === undefined) return !emptied() && !!BY_ID.get(id)?.on;
    return !!stored;
  }

  // Did you clear the list rather than simply never having answered? The None
  // button now writes a false per tracker, so an empty map is either that
  // button from a version before this one or a store that has never been
  // written at all.
  function emptied() {
    return !Object.keys(settings.enabled || {}).length;
  }

  function alertsOn(id) {
    return !!settings.alerts[id];
  }

  // {id: {endTime, src}} — when each tracked thing comes back, and how that
  // was established. Window rows
  // are not stored at all: their hours are the same for everybody and the
  // clock alone answers them.
  function readStates() {
    return readJSON(STATE_KEY, {}) || {};
  }

  function writeStates(states) {
    writeJSON(STATE_KEY, states);
  }

  // A daily is "done" until the next midnight NST; a cooldown is done until
  // its interval is up. Window rows are pure clock and are never marked.
  //
  // `src` is how this was established — see SOURCE_RANK. A running timer is
  // only overwritten by an equal or better source, so the page's own text or
  // request wins over a stray click, and a click that lands after them does
  // not restart the clock from scratch.
  function markDone(id, src = "manual", why = "") {
    const t = BY_ID.get(id);
    if (!t) return;
    // A plain window row has nothing to record; one with a cooldown does.
    if (t.type === "window" && !t.cooldownMins) return;
    const states = readStates();
    const prev = liveTimer(id);
    if (t.type !== "allowance" && prev) {
      const better = (SOURCE_RANK[src] || 0) >= (SOURCE_RANK[prev.src] || 0);
      if (!better) return;
    }
    // An allowance is a tally, not a clock: each detected play spends one of
    // the day's tries, and the stored endTime is only there to throw the
    // tally away at midnight NST.
    if (t.type === "allowance") {
      // The game has already said you are out. Nothing counted after that
      // means anything, and overwriting it would put the row back to ready.
      if (prev && prev.spent) return;
      const count = Math.min(t.uses, (prev?.count || 0) + 1);
      states[id] = {
        endTime: prev ? prev.endTime : Date.now() + resetIn(t),
        count,
        src,
      };
      writeStates(states);
      console.info(`${TAG} ${id}: ${count}/${t.uses} used (${src})`);
      return;
    }
    const until =
      t.type === "daily"
        ? resetIn(t)
        : (t.cooldownMins || t.mins) * 60_000;
    states[id] = { endTime: Date.now() + until, src };
    // The row's own account of why it is standing down, where the source
    // label would be too vague to be useful. Only settled() sets one.
    if (why) states[id].why = why;
    writeStates(states);
    console.info(`${TAG} ${id}: marked done (${why || src})`);
  }

  // The activity has said exactly when it will be back, rather than leaving
  // us to add its shortest cooldown to the clock. Same store and the same
  // source ranking as markDone - only the end time is a reading rather than
  // an assumption.
  function markUntil(id, endTime, src = "page") {
    if (!BY_ID.get(id)) return;
    const states = readStates();
    const prev = states[id];
    if (prev && prev.endTime > Date.now()) {
      const better = (SOURCE_RANK[src] || 0) >= (SOURCE_RANK[prev.src] || 0);
      if (!better) return;
      // The page says the same thing on every visit, and a few seconds of
      // difference is the clock moving rather than news. Without this, every
      // load of the page writes the store and logs a line.
      if (prev.src === src && Math.abs(prev.endTime - endTime) < 5000) return;
    }
    states[id] = { endTime, src };
    writeStates(states);
    console.info(`${TAG} ${id}: ${formatShort(endTime - Date.now())} left, read from the page`);
  }

  // The activity prints its own tally, so the count is a reading rather than
  // a guess. Stored like any other allowance - the endTime is only there to
  // throw the day away at midnight NST - with the total the page gave and a
  // src of "page", which is what the row reads to know the figure can be
  // shown as it stands.
  function markCounted(id, used, total) {
    const t = BY_ID.get(id);
    if (!t || t.type !== "allowance") return;
    const states = readStates();
    const fresh = liveTimer(id);
    // The page says the same thing on every read, and this one is re-read
    // every few seconds; without this the store and the log would churn.
    if (fresh && fresh.src === "page" && fresh.count === used && fresh.total === total) return;
    states[id] = {
      endTime: fresh ? fresh.endTime : Date.now() + resetIn(t),
      count: used,
      total,
      spent: used >= total,
      src: "page",
    };
    writeStates(states);
    console.info(`${TAG} ${id}: ${used}/${total} taken today, read from the page`);
  }

  // The day's allowance is gone, said by the game itself rather than counted
  // up to. This is the only thing that stands an allowance row down now: the
  // tally was a guess (a click that did not land, a handler page reloaded, a
  // play made in another tab) and it was being printed as though it were a
  // number the site had given us.
  function markSpent(id) {
    const t = BY_ID.get(id);
    if (!t || t.type !== "allowance") return;
    const states = readStates();
    states[id] = {
      endTime: Date.now() + resetIn(t),
      count: t.uses,
      spent: true,
      src: "text",
    };
    writeStates(states);
    console.info(`${TAG} ${id}: the game says the day's tries are gone`);
  }

  // Not "done" — "not open yet". Stored the same way so one row renders both,
  // but it expires at the next hour rather than at midnight, and it never
  // claims you have had your go.
  function markRetry(id, src = "text") {
    const states = readStates();
    states[id] = { endTime: Date.now() + msUntilNstHour(), kind: "retry", src };
    writeStates(states);
    console.info(`${TAG} ${id}: not started yet, checking again next hour`);
  }

  function clearDone(id) {
    const states = readStates();
    delete states[id];
    writeStates(states);
  }

  // The Healing Springs script stored its one timer under its own key; carry
  // it over so upgrading does not lose a half hour already part-served.
  (function migrate() {
    const old = readJSON(LEGACY_SPRINGS_KEY, null);
    if (!old || typeof old.endTime !== "number") return;
    const states = readStates();
    if (!states.springs && old.endTime > Date.now()) {
      states.springs = { endTime: old.endTime, src: old.exact ? "text" : "click" };
      writeStates(states);
    }
    try {
      localStorage.removeItem(LEGACY_SPRINGS_KEY);
    } catch {
      /* private mode */
    }
  })();

  // -------------------------------------------------------------- NST clock
  //
  // Neopian Standard Time is America/Los_Angeles. Everything below works from
  // the current NST wall clock rather than from a UTC offset, so the two
  // daylight-saving days are off by an hour for one day and correct after.

  function nstParts(when = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const got = {};
    for (const p of fmt.formatToParts(when)) got[p.type] = p.value;
    const h = Number(got.hour) % 24;
    return { h, m: Number(got.minute), s: Number(got.second) };
  }

  function nstSecondsIntoDay() {
    const { h, m, s } = nstParts();
    return h * 3600 + m * 60 + s;
  }

  // The marrow starts on the hour, so "not started yet" is worth exactly one
  // wait: until the next hour turns over.
  // Which NST day it is, as a plain key. A window typed in yesterday is not
  // today's window, and silently keeping it would be worse than asking again.
  function nstDateKey(when = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  }

  // Is this row shut right now, and if so for how long? `breaks` are
  // [startHour, endHour) in NST, like `windows`, and all of them end on the
  // hour, which is also where markRetry's clock lands.
  function msUntilBreakEnds(t) {
    if (!t.breaks) return 0;
    const secs = nstSecondsIntoDay();
    for (const [from, to] of t.breaks) {
      if (secs >= from * 3600 && secs < to * 3600) return (to * 3600 - secs) * 1000;
    }
    return 0;
  }

  function msUntilNstHour() {
    return (3600 - (nstSecondsIntoDay() % 3600)) * 1000;
  }

  function msUntilNstMidnight() {
    return (86400 - nstSecondsIntoDay()) * 1000;
  }

  // The Wishing Well's two grant times. Jellyneo: wishes are granted twice a
  // day, twelve hours apart, at around 8:00 AM and 8:00 PM NST — the well's
  // own page claiming four times a day is wrong — and as they are granted
  // every ungranted wish from the previous twelve hours is wiped and the well
  // starts clean. So the seven run to the next of those hours: not to midnight
  // like every other allowance here, and not to twelve hours after your first
  // wish either.
  //
  // The slack is for the drift. That 8:00 was read in February 2026 and moves
  // a few seconds later every day, which by now is a quarter of an hour or so
  // that nobody is publishing, so the row comes back a little late rather than
  // promising wishes that have not been granted yet. The Wishing Well script
  // in this same folder holds its own count three times as long, because there
  // being early spends 22 NP on a refusal; here it only draws a row.
  const WELL_GRANT_HOURS = [8, 20];
  const WELL_GRANT_SLACK = 15 * 60_000;

  function msUntilWellGrant() {
    const secs = nstSecondsIntoDay();
    const marks = WELL_GRANT_HOURS.map((h) => h * 3600 + WELL_GRANT_SLACK / 1000);
    for (const mark of marks) if (secs < mark) return (mark - secs) * 1000;
    return (86400 - secs + marks[0]) * 1000;
  }

  // A row's own day, and the words for it: three defaults in one place, so
  // every row that does run on the NST day says nothing about any of this.
  //
  // These began as allowance-only, because the Wishing Well's seven wishes
  // were the only thing here not running to midnight. The well is now a plain
  // once-a-window row and still does not run to midnight, so the daily path
  // asks the same three questions.
  function resetIn(t) {
    return t.resetsIn ? t.resetsIn() : msUntilNstMidnight();
  }
  function resetAt(t) {
    return t.resetsAt || "midnight NST";
  }
  function spanOf(t) {
    return t.spanWords || "today";
  }
  function allowanceEvery(t) {
    return t.everyWords || `${t.uses} a day`;
  }

  // A window that repeats every hour, given the minute it starts on. It is
  // clipped at the end of the hour rather than wrapping, which is how the
  // game behaves.
  function hourlyWindowStatus(startMin, lengthMin) {
    const intoHour = nstSecondsIntoDay() % 3600;
    const from = startMin * 60;
    const to = Math.min(from + lengthMin * 60, 3600);
    if (intoHour >= from && intoHour < to) {
      return { open: true, ms: (to - intoHour) * 1000 };
    }
    const wait = intoHour < from ? from - intoHour : 3600 - intoHour + from;
    return { open: false, ms: wait * 1000 };
  }

  // Where the guide leaves what it read, for the panel on the other site.
  const sharedWindowKey = (id) => `window:${id}`;

  // Accepts what Jellyneo actually prints — "XX:57:00 to XX:59:59" — as well
  // as ":57", "57:00" or plain "57", so the line can simply be pasted in.
  // "none" records that today has no window at all, which happens.
  function parseWindowInput(raw) {
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return undefined; // nothing given: clear it
    if (/^(none|no|-|n\/a)$/.test(text)) return "none";
    // First mm:ss-looking pair wins; a bare number is the minute itself.
    // Anything with no digits at all is rejected rather than read as zero,
    // which is what "wat" used to come out as.
    const pair = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})/);
    const digits = text.replace(/[^\d]/g, "");
    if (!pair && !digits) return undefined;
    const minute = pair ? Number(pair[1]) : Number(digits);
    return Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : undefined;
  }

  // The window someone typed in for today, or null if nobody has yet (or if
  // what they typed was for a previous day).
  function todaysWindow(t) {
    const today = nstDateKey();
    // What the guide saw today wins: it came from the page that publishes it.
    const shared = SHARED.get(sharedWindowKey(t.id));
    if (shared && shared.day === today) {
      if (shared.minute === "none") return "none";
      const m = Number(shared.minute);
      if (Number.isInteger(m) && m >= 0 && m <= 59) return m;
    }
    const stored = settings.hourlyWindows?.[t.id];
    if (!stored || stored.day !== today) return null;
    if (stored.minute === "none") return "none";
    const minute = Number(stored.minute);
    return Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : null;
  }

  // For a window row: how long until it opens, or how long it stays open.
  function windowStatus(windows) {
    const now = nstSecondsIntoDay();
    for (const [from, to] of windows) {
      const a = from * 3600;
      const b = to * 3600;
      if (now >= a && now < b) return { open: true, ms: (b - now) * 1000 };
    }
    let best = Infinity;
    for (const [from] of windows) {
      const a = from * 3600;
      const wait = a > now ? a - now : 86400 - now + a;
      best = Math.min(best, wait);
    }
    return { open: false, ms: best * 1000 };
  }

  // ------------------------------------------------------------------- rows

  // One row's current state, for both the panel and the alert check.
  // Some dailies' own pages are Flash and have been dead for years, while the
  // handler they used to post to still works and still pays out. Those rows
  // can point at the handler instead; `useBypass` in the settings turns that
  // off and sends them back to the real page.
  const BYPASS_NOTE = "direct link \u2014 opening it plays it";

  function usingBypass(t) {
    return !!(settings.useBypass && t.bypass);
  }

  const SOURCE_LABEL = {
    text: "read from the page",
    request: "from the page's own request",
    click: "from your click",
    refused: "the page turned you away \u2014 a full wait assumed",
    bypass: "you opened the direct link",
    manual: "you marked it done",
    page: "the page's own countdown",
    settled: "the page says it is finished",
  };

  // The stored timer for a row, or null when there is none or it has already
  // run out. Every reader of the store wants exactly this - an expired entry
  // is not information, it is yesterday - and the test was written out six
  // times with six different variable names for it.
  function liveTimer(id) {
    const held = readStates()[id];
    return held && held.endTime > Date.now() ? held : null;
  }

  // What a row says right now: ready or not, how long is left, and the words
  // for why. One function per kind of row, because they have nothing in common
  // beyond the shape they return - a daily reads the store and the clock, an
  // allowance reads a tally, a window is arithmetic - and reading one of them
  // used to mean scrolling past the other three.
  // The three training schools, which all print the same two lines per pet on
  // their status page:
  //
  //     Time till course finishes :
  //     6 hrs, 0 minutes, 0 seconds
  //
  // or, once the time is up, "Course Finished!" beside a Complete Course!
  // button.
  //
  // More than one pet can be on a course at once, so this is a reading of all
  // of them rather than of one timer:
  //
  //   - a finished course, or no pet on a course at all, and the row is ready:
  //     either way the school wants you now, to collect or to start;
  //   - otherwise it counts down to the first pet to finish, because that is
  //     the next time there is anything to do.
  //
  // Answered only on the status page. The courses page lists what can be
  // studied rather than who is studying, so it knows neither, and null leaves
  // whatever the panel is already holding alone.
  function trainingCountdown() {
    if (!/type=status/i.test(location.search)) return null;
    const said = document.body?.innerText || "";
    // Something to collect outranks every countdown beside it.
    if (/course\s+finished/i.test(said)) return 0;
    const waits = [
      ...said.matchAll(
        /till\s+course\s+finishes\s*:?\s*(\d+)\s*hrs?\D+(\d+)\s*minutes?\D+(\d+)\s*seconds?/gi,
      ),
    ].map((m) => (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
    if (waits.length) return Math.min(...waits);
    // A pet is listed as studying but its countdown did not parse - the school
    // has been restyled, or it says the time some other way. Saying nothing is
    // right here: reporting the row ready would throw away a real timer.
    //
    // Matched on the whole per-pet heading, "<name> (Level 323) is currently
    // studying Strength", and not on "currently studying" alone: the page that
    // says nobody is training says it as "No Neopets are currently studying a
    // course", which the looser pattern read as a pet whose clock had gone
    // missing - so the one state this function exists to report, the row being
    // ready, was the one it refused to report.
    if (/\(Level\s+\d+\)\s*is\s+currently\s+studying/i.test(said)) return null;
    // Nobody studying, so there is a course to start.
    return 0;
  }

  function rowState(t) {
    if (t.type === "daily") return dailyRowState(t);
    if (t.type === "allowance") return allowanceRowState(t);
    if (t.type === "window") return t.hourly ? hourlyRowState(t) : windowRowState(t);
    return intervalRowState(t);
  }

  function dailyRowState(t) {
    const done = liveTimer(t.id);
    if (done) {
      if (done.kind === "retry") {
        return {
          ready: false,
          ms: done.endTime - Date.now(),
          label: t.breakWords
            ? `${t.breakWords} \u2014 back at the top of the hour`
            : "hasn't started yet \u2014 it begins on the hour",
          kind: "daily",
        };
      }
      return {
        ready: false,
        ms: done.endTime - Date.now(),
        label: (done.why || `done ${spanOf(t)} (${SOURCE_LABEL[done.src] || "marked"})`)
          + ` \u2014 resets at ${resetAt(t)}`,
        kind: "daily",
      };
    }
    // Not marked today - but the activity itself may be shut, which is not
    // the same thing as waiting for you, and is worth knowing without going
    // to look. This needs no visit and no stored state: it is the clock.
    const shut = msUntilBreakEnds(t);
    if (shut) {
      return {
        ready: false,
        ms: shut,
        label: `${t.breakWords} \u2014 back at the top of the hour`,
        kind: "daily",
      };
    }
    // A daily you did on another device reads as ready until you tick it
    // off, which is the honest answer: the site does not say.
    return {
      ready: true,
      ms: 0,
      label: t.randomStart
        ? "worth a look \u2014 it may not have started, or may be over"
        : `not done yet ${spanOf(t)}`,
      kind: "daily",
    };
  }

  function allowanceRowState(t) {
    const live = liveTimer(t.id);
    // Only the game's own refusal ends the day. The row used to print the
    // running tally - "6/20" - which read like something the site had told
    // us and was not: it counted openings of the handler page, so a reload,
    // a play in another tab or a click that never landed all moved it. A
    // number that is wrong in both directions is worse than no number, so
    // the row just says Ready until the answer says you are out.
    // A figure the site printed, which is the one allowance tally worth
    // putting on the row: it is the site's own count, not this script's
    // guess at one, so it goes in the clock's place as "3/20".
    if (live && live.src === "page" && live.total) {
      if (live.count < live.total) {
        return {
          ready: true,
          ms: 0,
          // undefined rather than the figure for a row that does not want
          // it on the clock; timeText falls through to "Ready".
          text: t.hideCount ? undefined : `${live.count}/${live.total}`,
          label: `${live.count} of ${spanOf(t)}'s ${live.total} taken`
            + " \u2014 read from the page",
          kind: "allowance",
        };
      }
      return {
        ready: false,
        ms: live.endTime - Date.now(),
        label: `${spanOf(t)}'s ${live.total} are gone`
          + ` \u2014 resets at ${resetAt(t)}`,
        kind: "allowance",
      };
    }
    if (live && live.spent) {
      return {
        ready: false,
        ms: live.endTime - Date.now(),
        label: "the game says you are out of tries"
          + ` \u2014 resets at ${resetAt(t)}`,
        kind: "allowance",
      };
    }
    const used = live?.count || 0;
    return {
      ready: true,
      ms: 0,
      label: allowanceEvery(t)
        + (used ? ` \u2014 ${used} counted so far, roughly` : "")
        + " \u2014 the row stands down when the game says you are out",
      kind: "allowance",
    };
  }

  // The Symol Hole: a window whose four minutes are not knowable from here, so
  // the row has a state for "you have not told me yet" as well as open, shut
  // and cooling down.
  function hourlyRowState(t) {
    const cooling = liveTimer(t.id);
    if (cooling) {
      return {
        ready: false,
        ms: cooling.endTime - Date.now(),
        label: "you have had your hour's try \u2014 the cooldown is exactly an hour",
        kind: "window",
      };
    }
    const minute = todaysWindow(t);
    if (minute === "none") {
      return {
        ready: false,
        ms: msUntilNstMidnight(),
        text: "none",
        label: "no prize window at all today \u2014 nothing to catch",
        kind: "window",
      };
    }
    if (minute === null) {
      return {
        ready: false,
        // Not ready, but waiting on you rather than on a clock - which is
        // why it is listed even when the panel is set to show only what is
        // ready. See the filter in render().
        needsYou: true,
        ms: 0,
        text: "set",
        label:
          "today's 4-minute window is not set \u2014 it changes daily, and " +
          "Jellyneo publishes it; put the minute in the settings",
        kind: "window",
      };
    }
    const w = hourlyWindowStatus(minute, t.hourly);
    return w.open
      ? {
          ready: true,
          ms: w.ms,
          label: `window open for ${formatShort(w.ms)} (:${String(minute).padStart(2, "0")} each hour)`,
          kind: "window",
        }
      : {
          ready: false,
          ms: w.ms,
          label: `until the :${String(minute).padStart(2, "0")} window`,
          kind: "window",
        };
  }

  function windowRowState(t) {
    const w = windowStatus(t.windows);
    return w.open
      ? { ready: true, ms: w.ms, label: `open for ${formatShort(w.ms)}`, kind: "window" }
      : { ready: false, ms: w.ms, label: "until it opens", kind: "window" };
  }

  function intervalRowState(t) {
    const held = liveTimer(t.id);
    if (!held) return { ready: true, ms: 0, label: "ready", kind: "interval" };
    return {
      ready: false,
      ms: held.endTime - Date.now(),
      label: SOURCE_LABEL[held.src] || "marked done",
      kind: "interval",
    };
  }

  // Every tracker in the order the settings list is in, which is the order the
  // panel lists them in too. The panel used to sort itself - ready first, then
  // soonest - and that was the right default and the wrong thing to keep once
  // the order became yours to set: a drag that the panel then re-sorted away
  // would be a control that does nothing. Ready rows are already the green
  // ones, and the collapsed pill still names the soonest whatever the order.
  function orderedTrackers() {
    const order = Array.isArray(settings.order) ? settings.order : [];
    const rank = new Map(order.map((id, i) => [id, i]));
    // Three tiers, in this order: what you dragged, then DEFAULT_ORDER's
    // dailies-run order, then whatever the registry happens to list. The
    // offsets keep the tiers from interleaving - a tracker Jellyneo does not
    // list cannot land in the middle of the ones it does.
    const base = order.length;
    const place = (t) => {
      if (rank.has(t.id)) return rank.get(t.id);
      const i = DEFAULT_ORDER.indexOf(t.id);
      if (i >= 0) return base + i;
      return base + DEFAULT_ORDER.length + TRACKERS.indexOf(t);
    };
    return [...TRACKERS].sort((a, b) => place(a) - place(b));
  }

  // What the panel lists, in the order it lists them. Two groups, and they
  // are ordered on different things.
  //
  // What is ready sits at the top, in the order you dragged it into. These
  // are the rows you are about to go and do, so their order is a running
  // order and nothing else could sort them: "ready" carries no clock to
  // compare.
  //
  // Everything else follows, strictly soonest first, and your order has no
  // say in it at all. A row that is counting down is not something you are
  // choosing between; it is a wait, and the only question it answers is how
  // long. (An earlier pass bucketed these to the minute so the midnight
  // cohort kept your order - the seconds between those rows being nothing
  // but the order you happened to tick them off in. Dropped on purpose: the
  // waiting half of the panel is now a plain clock, top to bottom.)
  //
  // place() is still the last tiebreak below, for two rows whose wait is
  // equal to the millisecond. It keeps the sort stable rather than leaving
  // the pair to swap about.
  function sortForPanel(rows) {
    const place = new Map(orderedTrackers().map((t, i) => [t.id, i]));
    return [...rows].sort((a, b) => {
      if (a.st.ready !== b.st.ready) return a.st.ready ? -1 : 1;
      if (!a.st.ready && a.st.ms !== b.st.ms) return a.st.ms - b.st.ms;
      return place.get(a.t.id) - place.get(b.t.id);
    });
  }

  function activeTrackers() {
    return orderedTrackers().filter((t) => isOn(t.id));
  }

  // --------------------------------------------------------------- detection

  function matchTracker() {
    const path = location.pathname.toLowerCase();
    // Longest path wins, so "/magma/quarry.phtml" is not shadowed by a shorter
    // prefix somebody adds later.
    let best = null;
    let bestLen = 0;
    for (const t of TRACKERS) {
      // A handler page (process_cocoshy.phtml and friends) belongs to its
      // activity just as much as the activity's own page does, and so does a
      // second address for the same activity (`paths`, see the Fruit
      // Machine).
      for (const candidate of [t.path, t.bypassPath, ...(t.paths || [])]) {
        if (!candidate || !path.startsWith(candidate)) continue;
        if (candidate.length > bestLen) {
          best = t;
          bestLen = candidate.length;
        }
      }
    }
    return best;
  }

  // A page that states its outcome (Healing Springs). Everything else falls
  // through to the click watcher below.
  function classifyByText(t) {
    const scope =
      document.querySelector(".content") ||
      document.querySelector("#content") ||
      document.body;
    const text = scope.innerText || "";
    if (t.notyet && t.notyet.test(text)) return "notyet";
    if (t.refused && t.refused.test(text)) return "refused";
    if (t.used && t.used.test(text)) return "used";
    return "idle";
  }

  // Clicks in the site's own furniture are not the activity.
  const CHROME_SELECTOR = [
    "#navtop__2020",
    "#navbottom__2020",
    ".nav-profile-dropdown__2020",
    ".nav-alerts-dropdown__2020",
    ".navsub-left__2020",
    ".navsub-right__2020",
    ".footer__2020",
    ".premium-widget__2024",
    "#nphs",
    "#nptm",
    "#nptm-settings",
  ].join(",");

  // Requests the site fires by itself on every page: the nav's notification
  // poll, the Quest Log pane refreshing when its dropdown opens or closes, the
  // beta-popup opt-out check, bookmarking. None of them is you doing a daily,
  // and the Quest Log ones would otherwise tick Quest Log off the moment you
  // opened /questlog/.
  const NOISE_RE = new RegExp(
    [
      "/np-templates/ajax/notifications\\.php",
      "/np-templates/ajax/questlog/(retrievePaneQuests|updateQuestPane|muteAlerts)\\.php",
      "/np-templates/ajax/optout-beta-popup\\.php",
      "/np-templates/ajax/safetydeposit/",
      "/bookmark_me\\.phtml",
      "pin-status",
      "/premium/settings/dailies/",
    ].join("|"),
    "i",
  );

  // Anything the page loads while it is still assembling itself is the page,
  // not you. Nothing you can click happens this fast.
  const BOOTSTRAP_MS = 1500;

  // How a visit was established, worst to best. A better source may overwrite
  // a worse one for the same activity; the reverse is ignored, so a stray
  // click cannot downgrade a reading taken from the page's own text.
  // "page" outranks even a manual tick: a figure the site printed beats both
  // a guess and your memory of when you last went.
  const SOURCE_RANK = {
    refused: 1, click: 1, request: 2, bypass: 3, text: 3, manual: 4,
    // Both of these are the site's own account of the row - a countdown it
    // printed, or its own data read back - so they outrank your memory.
    page: 5, settled: 5,
  };

  // A link that performs the action rather than just navigating: it carries a
  // query string, or it is a javascript:/# control. A plain link to another
  // page is somebody leaving, and leaving is not doing.
  function isActionLink(el, t) {
    const href = el.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) {
      return true;
    }
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return false;
    }
    if (url.origin !== location.origin) return false;
    if (!url.pathname.toLowerCase().startsWith(t.path)) return false;
    return !!url.search;
  }

  // Does this element look like the activity's own control? Only asked of
  // trackers that name one (`action`), and matched against the text, value
  // and href — "Heal my Pets!" is a submit's value, not its text.
  function isActionControl(el, t) {
    if (!t.action) return true;
    const label = [
      el.innerText || "",
      el.value || "",
      el.getAttribute("href") || "",
      el.getAttribute("name") || "",
      el.getAttribute("alt") || "",
    ].join(" ");
    return t.action.test(label);
  }

  // ----------------------------------------------------- the Quest Log's day
  //
  // The hub is two tabs - Daily Quests and NeoPass - each with its own set of
  // quests and its own bonus, and it can only ever show you one of them. So
  // "the day is finished" is a reading taken twice, once on each, and these
  // four keep the halves: which tab is in front of us, which group within it,
  // what its bonus line says, and what has been seen today.

  // The tab, as "daily" or "neopass", or null before the app has rendered.
  //
  // Read off the label rather than the tab id. The ids are the site's own
  // (2 and 3 today, and the config calls 3 the neoPassTabId), but a label is
  // at least the thing the page shows you.
  function activeQuestTab() {
    const el = document.querySelector(".questlog-tabs .questlog-tab.tab-active");
    if (!el) return null;
    const label = el.textContent || "";
    if (/neopass/i.test(label)) return "neopass";
    if (/quest|dail/i.test(label)) return "daily";
    return null;
  }

  // The group inside that tab, by label, or "" where the tab is one
  // undivided list. The NeoPass tab is split into NeoPass Dailies and
  // NeoPass Weeklies, and the bonus above the quests belongs to whichever of
  // them is showing - so a row about today has to know which it is reading.
  // Weeklies are a week's work and have no business holding a daily row open.
  //
  // The active group carries no class of its own. What marks it is the
  // absence of a tabindex: the hub makes every *other* group focusable so you
  // can switch to it (`v-bind="group.active ? {} : { tabindex: 0 }"`). That is
  // the only signal the page offers, so it is the one used.
  function activeQuestGroupLabel() {
    const groups = [...document.querySelectorAll(".questlog-groups .ql-group")];
    if (!groups.length) return "";
    const live = groups.find((g) => !g.hasAttribute("tabindex"));
    return live ? live.textContent || "" : "";
  }

  // Does the tab in front of us say its day is done? This is the hub's own
  // sentence, above the quests:
  //
  //   "You've completed all your quests and earned your bonus!"
  //
  // against "Complete all quests shown before they expire to earn a bonus!"
  // while any are outstanding.
  //
  // Scoped to #QuestLogBonusRewards deliberately: the streak block beside it
  // carries a near-identical sentence - "...completed all your quests 7 days
  // in a row and earned your bonus!" - which is about the week, not today.
  //
  // Note what this does and does not say. It is the quests being complete,
  // not the rewards being collected: the line appears as soon as the bonus is
  // ready to claim. For a Premium account those are the same moment (rewards
  // auto-claim), and for everybody else this is the more useful of the two -
  // the work is what the row is tracking, and an unclaimed reward is not a
  // reason to go and do anything.
  //
  // Where a tab has no bonus block at all, its quest cards are the fallback:
  // an unclaimed card, or an unclaimed bonus or streak reward, and the tab is
  // not finished.
  function questBonusEarned() {
    const bonus = document.getElementById("QuestLogBonusRewards");
    if (bonus) return /earned your bonus/i.test(bonus.textContent || "");
    const box = document.getElementById("QuestLogQuests");
    if (!box) return null;
    let left = document.querySelectorAll(".ql-bonus-claim").length;
    for (const card of box.querySelectorAll(".questlog-quest")) {
      if (!card.classList.contains("ql-quest-claimed")) left += 1;
    }
    return left === 0;
  }

  // What has been seen today, per tab, kept against the NST date so it is
  // thrown away with the quests it describes.
  function rememberQuestTab(tab, finished) {
    const today = nstDateKey();
    const stored = readJSON(QUESTLOG_KEY, null);
    const fresh = stored && stored.day === today;
    const seen = fresh ? stored : { day: today, daily: false, neopass: false };
    // Written only on a change, or this would rewrite the store every few
    // seconds for as long as the hub is open.
    if (!fresh || seen[tab] !== finished) {
      seen[tab] = finished;
      writeJSON(QUESTLOG_KEY, seen);
      console.info(
        `${TAG} questlog: the ${tab} tab says its quests are`
        + ` ${finished ? "done" : "not done"} today`,
      );
    }
    return seen;
  }

  // Jumping in outside the prize window does not start a cooldown, and the
  // page says the same thing either way \u2014 so neither does this. Asked at
  // the moment of the attempt, not at page load: the window may be set (or
  // may open) while the page sits there.
  function insideWindow(t) {
    if (!t.hourly) return true;
    const minute = todaysWindow(t);
    if (minute === null || minute === "none") return false;
    return hourlyWindowStatus(minute, t.hourly).open;
  }

  function markInWindow(t, src) {
    if (insideWindow(t)) markDone(t.id, src);
  }

  // How a visit is detected, in order of how good the evidence is.
  //
  // The readers come first and each answers one question: can I settle this
  // row from what is on the page? The first one that can stops the chain,
  // because everything after it is weaker evidence about the same thing - and
  // because arming a click watcher on a page that has already told us the
  // answer is how a row gets marked by the wrong thing.
  //
  // Only when none of them can does the row fall back to watching what you
  // do: the page's own requests, a form, a click. Those three share a piece
  // of mutable state (when the control was last clicked) and so stay together
  // in watchForAction.
  function watchForVisit(t) {
    if (t.type === "window" && !t.cooldownMins) return;
    if (readCountdown(t)) return;
    if (readCounter(t)) return;
    if (readSettled(t)) return;
    if (readBypassPage(t)) return;
    if (readPageText(t)) return;
    // Rows the page reports on in full, where a click adds nothing: a training
    // school prints every pet's own countdown, so a click on Complete Course!
    // is the end of the old timer rather than the start of a new one, and the
    // next visit will say what the new one is.
    if (t.pageOnly) return;
    watchForAction(t);
  }

  // 0. The page states how long is left. Only Grave Danger does, and it is
  //    better evidence than anything below, which all work backwards from
  //    something you did; this works forwards from what the site says is
  //    still to come. It is also the only source that fires on a visit
  //    where you did nothing at all - an adventure already running when you
  //    arrive is news whether or not this browser started it.
  function readCountdown(t) {
    if (!t.countdown) return false;
    const left = t.countdown();
    // The page has no countdown on it this time, which is not the same as a
    // countdown of zero: it says nothing, so the sources below get their turn.
    if (left === null) return false;
    if (left > 0) {
      markUntil(t.id, Date.now() + left, "page");
      // Nothing you can do while it is out there counts as a go, so the
      // request and click watchers are never armed.
      return true;
    }
    // It is back. A timer still held here over-ran (four hours was the
    // guess, and the adventure was longer), or the adventure ended some
    // other way; either way the row should say ready.
    clearDone(t.id);
    return false;
  }

  // 0b. The page states how many of the day's allowance are gone. The
  //     Battledome is the only one that does, and like the countdown above
  //     it is the site's own figure rather than a tally kept here.
  function readCounter(t) {
    if (!t.counter) return false;
    const read = () => {
      const got = t.counter();
      if (got) markCounted(t.id, got.used, got.total);
    };
    read();
    // Re-read, rather than read once: the counter is printed when a fight
    // ends, which can be a long while after the page loaded, and the page
    // never reloads around it. Five seconds costs one failed lookup and
    // keeps the row right by the time you glance at the panel.
    setInterval(read, 5000);
    // Nothing below is armed. A click in the arena is not a drop, and the
    // page is about to say what the real number is anyway.
    return true;

  }
  // 0c. The page says whether the day is finished, rather than leaving it
  //     to be inferred from something you did. Only the Quest Log does, and
  //     it is the only row where "you clicked a thing" is actively wrong:
  //     one claim out of six is not the day.
  //
  //     It answers both ways, which the sources below cannot. A row the
  //     page says is unfinished has its stored timer cleared, so ticking it
  //     off by hand and then opening the hub with a quest still unclaimed
  //     puts the row back - the page outranks your memory, as it does
  //     everywhere else (see SOURCE_RANK).
  function readSettled(t) {
    if (!t.settled) return false;
    const read = () => {
      const got = t.settled();
      const held = liveTimer(t.id);
      if (got === true || typeof got === "string") {
        // A string is a yes that brought its own words for the row.
        const why = typeof got === "string" ? got : "";
        // The page says the same thing on every read, and this is re-read
        // every few seconds; without this the store and the console would
        // churn for as long as the page is open.
        if (held && held.src === "settled" && (held.why || "") === why) return;
        markDone(t.id, "settled", why);
      } else if (got === false && held) {
        // Likewise: only when there is actually something to clear.
        clearDone(t.id);
      }
    };
    read();
    // Re-read, like the counter above: claiming happens over AJAX and the
    // hub never reloads around it, so the one reading taken at load time
    // would be the state before you claimed anything.
    setInterval(read, 5000);
    // Nothing below is armed - a click in the hub is not the day.
    return true;

  }
  // Arriving on the handler page means it has already run — the payout is
  // in the response you are looking at — so this is the action, not a
  // guess at one, however you got here.
  function readBypassPage(t) {
    if (!t.bypassPath) return false;
    if (!location.pathname.toLowerCase().startsWith(t.bypassPath)) return false;
    // The handler answers in its own words, and this page is that answer -
    // so for an allowance it is read rather than counted. "No more throws"
    // is the day over; a success=0 beside any other wording is a play that
    // did not happen and is not counted either.
    const said = document.body?.innerText || "";
    if (t.spent && t.spent.test(said)) {
      markSpent(t.id);
    } else if (!/success=0/i.test(said)) {
      markDone(t.id, "bypass");
    }
    return true;

  }
  // 1. The page says so. Only Healing Springs does today, but this is the
  //    only source that is actually evidence rather than inference.
  function readPageText(t) {
    if (!t.used && !t.refused && !t.notyet) return false;
    const verdict = classifyByText(t);
    if (verdict === "notyet") {
      // The page has told us the thing is not open. Nothing you do on it
      // this page-load is a go, so the request and click watchers below are
      // skipped entirely rather than left to misread a click.
      markRetry(t.id, "text");
      return true;
    }
    if (verdict === "used") {
      markInWindow(t, "text");
    } else if (verdict === "refused") {
      // A refusal says a cooldown is running but not how much is left, so a
      // timer already stored is better information than a fresh guess.
      if (!liveTimer(t.id)) markInWindow(t, "refused");
    }
    // The page's word is the only one that counts here: a row you play at
    // until it tells you to stop is not finished by a click on it.
    if (t.textOnly) return true;
    return false;
  }
  // Watching what you do, for the rows the page will not simply tell us
  // about. These three belong together: each of them writes or reads
  // `controlClickedAt`, which is how a request is tied to the click that
  // caused it, and splitting them would mean handing that around.
  function watchForAction(t) {
    const loadedAt = Date.now();
    // For a tracker with a named control, a request only counts as the action
    // if that control was clicked just before it \u2014 otherwise an unrelated
    // background call on the page would stand in for the deed.
    let controlClickedAt = 0;

    // 2. The site's own request. Most of H5 does its dailies over AJAX —
    //    collecting bank interest POSTs to process_bank.php, the quest and
    //    wheel pages post to their own endpoints — so a same-origin POST from
    //    this page, or an AJAX GET, is the action itself rather than a guess
    //    about one. Patched on the page's window (this script runs with
    //    @grant none, in the page's own context), restored on pagehide, and
    //    only ever reading the method and URL: the request goes through
    //    untouched, and nothing is ever sent by this script.
    const seen = (url, method) => {
      if (Date.now() - loadedAt < BOOTSTRAP_MS) return;
      let u;
      try {
        u = new URL(url, location.href);
      } catch {
        return;
      }
      if (u.origin !== location.origin) return; // analytics, ads, images
      if (NOISE_RE.test(u.pathname + u.search)) return;
      if (t.action && Date.now() - controlClickedAt > 10_000) return;
      const post = (method || "GET").toUpperCase() !== "GET";
      const ajax = /\/np-templates\/ajax\//i.test(u.pathname) || /\.php$/i.test(u.pathname);
      if (!post && !ajax) return;
      markInWindow(t, "request");
    };

    const realFetch = pageWindow.fetch;
    if (typeof realFetch === "function") {
      try {
        pageWindow.fetch = function (input, init) {
        try {
          const url = typeof input === "string" ? input : input?.url;
          seen(url, init?.method || input?.method);
        } catch {
          /* never let the watcher break the page's own request */
        }
          return realFetch.apply(this, arguments);
        };
      } catch (err) {
        // Some managers hand out a read-only view of the page's window.
        console.warn(`${TAG} cannot watch this page's requests`, err);
      }
    }

    const realOpen = pageWindow.XMLHttpRequest?.prototype?.open;
    if (typeof realOpen === "function") {
      try {
        pageWindow.XMLHttpRequest.prototype.open = function (method, url) {
          try {
            seen(url, method);
          } catch {
            /* as above */
          }
          return realOpen.apply(this, arguments);
        };
      } catch (err) {
        console.warn(`${TAG} cannot watch this page's XHRs`, err);
      }
    }

    window.addEventListener("pagehide", () => {
      try {
        if (typeof realFetch === "function") pageWindow.fetch = realFetch;
        if (typeof realOpen === "function") {
          pageWindow.XMLHttpRequest.prototype.open = realOpen;
        }
      } catch {
        /* nothing to undo if the patch never took */
      }
    });

    // 3. A form submitted to this page, which is how the classic pages act.
    document.addEventListener(
      "submit",
      (e) => {
        const form = e.target;
        if (!form || form.closest?.(CHROME_SELECTOR)) return;
        // With a named control, the form has to be the one carrying it.
        if (t.action) {
          const controls = [
            ...form.querySelectorAll("button, input[type=submit], input[type=image]"),
          ];
          if (!controls.some((c) => isActionControl(c, t))) return;
        }
        controlClickedAt = Date.now();
        markInWindow(t, "request");
      },
      { capture: true },
    );

    // 4. Last resort: a click on something that looks like the control. Only
    //    buttons and action links count — a plain link to another page used to
    //    count too, which meant leaving the Shrine marked you as having used
    //    it. Still the weakest source, and still labelled as such in the panel.
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target?.closest?.(
          "a[href], button, input[type=submit], input[type=image]",
        );
        if (!el || el.closest(CHROME_SELECTOR)) return;
        if (el.tagName === "A" && !isActionLink(el, t)) return;
        if (!isActionControl(el, t)) return;
        controlClickedAt = Date.now();
        markInWindow(t, "click");
      },
      { capture: true },
    );
  }

  // ------------------------------------------------------------------ alerts

  function fireNotification(names) {
    if (!settings.notify || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const title = names.length === 1 ? `${names[0]} is ready` : `${names.length} dailies are ready`;
    try {
      const n = new Notification(title, {
        body: names.join(", "),
        tag: "np-timers",
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
    if (!settings.beep) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = settings.beepGain;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.55);
      osc.onended = () => ctx.close();
    } catch (err) {
      console.warn(`${TAG} beep failed`, err);
    }
  }

  let titleFlasher = null;
  const realTitle = document.title;

  function startTitleFlash(count) {
    if (!settings.flashTitle) return;
    stopTitleFlash();
    let on = false;
    titleFlasher = setInterval(() => {
      on = !on;
      document.title = on ? `✨ ${count} ready!` : realTitle;
    }, 1500);
  }

  function stopTitleFlash() {
    if (!titleFlasher) return;
    clearInterval(titleFlasher);
    titleFlasher = null;
    document.title = realTitle;
  }

  // Both notifications and audio need a user gesture, and the settings
  // checkboxes are one — which is why the panel no longer carries a button
  // whose only job was to be clicked.
  function requestNotifyPermission() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    Notification.requestPermission()
      .then(render)
      .catch((err) => console.warn(`${TAG} permission request failed`, err));
  }

  function notifyPermissionText() {
    if (typeof Notification === "undefined") return "not supported in this browser";
    if (Notification.permission === "denied") return "blocked for this site";
    if (Notification.permission === "granted") return "allowed";
    return "your browser will ask";
  }

  // ------------------------------------------------------------------ styles

  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPTM Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPTM Museo", "Museo Sans Rounded", Verdana, sans-serif';

  // Same fonts and the same yellow button as the Safety Deposit Box's
  // "Remove 1" (template.css .button-default__2020 + .button-yellow__2020 plus
  // safetydeposit.css .sdb-remove1), copied declaration for declaration. The
  // font files come from images.neopets.com, which serves them with
  // `access-control-allow-origin: *`.
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
    /* Every inherited text property the page could be setting, restated here.
       Neopets' older game pages - Dice-A-Roo among them - carry
       "body { text-align: center }", which inherits into anything appended to
       the body. The panel already declared text-align, so it was fine; the
       settings sheet did not, and the whole dialog came up centred on those
       pages - headings, labels, hints and all. Declared on these three roots
       rather than on every descendant, because inheritance does the rest and a
       blanket rule on "#nptm *" would outrank the few elements that set their
       own alignment on purpose (the clocks, the buttons, the window field). */
    #nptm, #nptm-settings, #nptm-shade {
      box-sizing: border-box !important;
      font: 12px/1.45 ${MUSEO} !important; color: #333 !important;
      text-align: left !important; direction: ltr !important;
      letter-spacing: normal !important; word-spacing: normal !important;
      text-indent: 0 !important; text-transform: none !important;
      text-shadow: none !important; white-space: normal !important;
    }
    #nptm *, #nptm-settings * { box-sizing: border-box !important; }
    #nptm {
      position: fixed !important; z-index: 2147483646 !important;
      /* Narrow on purpose. The site's content column is 1000px and centred,
         so on a 1280px window there are 140px of margin each side: at this
         width the panel lives in that margin instead of lying over the page.
         Wider windows give it more room; narrower ones have none to give, and
         the corner can be moved in the settings. */
      width: 150px !important; text-align: left !important;
      border: 1px solid #27486d !important; border-radius: 10px !important;
      overflow: hidden !important; background: #fff !important;
      box-shadow: 0 2px 7px rgba(0,0,0,0.3) !important;
    }
    #nptm-head {
      display: flex !important; align-items: center !important;
      gap: 6px !important; padding: 4px 8px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important; font: 13pt/1.1 ${CAFETERIA} !important;
      cursor: pointer !important; user-select: none !important;
    }
    #nptm-title { flex: 1 1 auto !important; white-space: nowrap !important; }
    /* Collapsed, the head is the whole widget, so whatever it shows has to
       occupy the same space from second to second: fixed width, monospace,
       tabular figures. Otherwise 59:59 → 1:00:00 would make the pill jump,
       which is the one thing a collapsed panel should never do. */
    #nptm-mini {
      display: none !important; min-width: 54px !important;
      text-align: right !important;
      font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
    }
    /* The gear is drawn here rather than pulled from an icon font: one more
       stylesheet on every Neopets page, for one glyph, is a poor trade, and
       a drawn path cannot 404 or arrive late. */
    #nptm-gear {
      flex: none !important; display: flex !important; align-items: center !important;
      opacity: 0.85 !important; cursor: pointer !important;
      color: #fff !important; transition: opacity 0.12s ease, transform 0.25s ease !important;
    }
    #nptm-gear:hover { opacity: 1 !important; transform: rotate(45deg) !important; }
    #nptm-gear svg { display: block !important; }
    #nptm-body {
      background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
      padding: 4px 0 !important;
      max-height: 420px !important; overflow-y: auto !important;
      border-radius: 0 0 9px 9px !important;
    }
    /* Two lines per row — the name across the top, the clock under it. One
       line needs ~230px before the names stop fitting, and that width lies
       over the page; stacking buys the narrow panel at the cost of height,
       which the margin has plenty of. */
    .nptm-row {
      position: relative !important; cursor: pointer !important;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-areas: "link" "time" !important;
      align-items: center !important;
      gap: 0 !important; padding: 3px 7px 4px !important;
    }
    .nptm-link {
      grid-area: link !important; display: flex !important;
      align-items: center !important; gap: 5px !important;
      min-width: 0 !important; text-decoration: none !important;
    }
    .nptm-ico {
      flex: none !important; width: 14px !important; height: 14px !important;
      object-fit: contain !important; image-rendering: auto !important;
    }
    .nptm-row + .nptm-row { border-top: 1px solid #dce8f6 !important; }
    .nptm-name {
      min-width: 0 !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
      white-space: nowrap !important; color: #1b4f85 !important;
      cursor: pointer !important; text-decoration: none !important;
      font: 10.5px/1.4 ${MUSEO} !important;
    }
    .nptm-link:hover .nptm-name { text-decoration: underline !important; }
    /* Monospace with tabular figures, so a ticking second changes the digit
       and nothing else: proportional digits reflow the row every tick, which
       is what made the countdown jump about. min-width holds the column
       steady as rows move between m:ss and h:mm:ss. */
    /* The clock sits hard against the right-hand edge of its line, under the
       name. The hover ✓ lives at the far left of that line, which is empty
       anyway, so nothing has to be reserved here — the digits and the control
       never come near each other. (Icons-only is the exception: there the row
       is one line and the control does sit between the icon and the clock,
       which is why it keeps a left reserve of its own below.) */
    .nptm-time {
      grid-area: time !important; min-width: 46px !important;
      text-align: right !important;
      padding: 0 2px 0 0 !important;
      font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas,
            "DejaVu Sans Mono", monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
      letter-spacing: 0 !important; color: #1b4f85 !important;
    }
    /* Out of the layout entirely: laid over the row's bottom-right corner,
       invisible until the row is hovered. It is a control you want a few
       times a week, so it should not cost a column on every row forever —
       and with it gone, a window row (which has nothing to mark) needs no
       spacer to keep its clock in line. */
    .nptm-mark {
      position: absolute !important; left: 7px !important; bottom: 4px !important;
      width: 13px !important; height: 13px !important;
      display: flex !important; align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important; color: #7b8aa0 !important;
      background: none !important; border: 0 !important; padding: 0 !important;
      opacity: 0 !important; transition: opacity 0.12s ease !important;
    }
    .nptm-mark svg { display: block !important; }
    .nptm-row.is-ready .nptm-mark { color: #4e8f6d !important; }
    .nptm-row:hover .nptm-mark,
    .nptm-mark:focus,
    .nptm-mark:focus-visible { opacity: 1 !important; }
    .nptm-mark:hover { color: #1b4f85 !important; }
    /* Nothing hovers on a touch screen, so there it stays faintly visible
       rather than being unreachable. */
    @media (hover: none) {
      .nptm-mark { opacity: 0.55 !important; }
    }
    .nptm-row.is-ready .nptm-name,
    .nptm-row.is-ready .nptm-time { color: #156141 !important; }
    .nptm-row.is-ready { background: #e9f8ef !important; }
    #nptm-empty {
      padding: 8px 9px !important; color: #4a5a6a !important;
      font: 11px/1.4 ${MUSEO} !important;
    }
    .nptm-btn {
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
    .nptm-btn:hover, .nptm-btn:focus {
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    .nptm-btn:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    .nptm-btn--sm { width: auto !important; font-size: 9pt !important; padding: 2px 10px 5px !important; }
    /* Icons-only. One line per row, the icon doing the naming, which takes
       the panel from 150px down to 104 — narrow enough to keep clear of the
       page on a laptop screen. The full name stays in the row's tooltip, and
       the icon is the link, so there is no smaller target to hit. */
    /* One line has to hold the icon, a clear gap on either side of the ✓,
       and up to h:mm:ss of digits — 126px is what that adds up to. (104 ran
       the longest clocks into the tick; 118 left them touching it.) */
    #nptm[data-compact="1"] { width: 126px !important; }
    #nptm[data-compact="1"] .nptm-time { padding-left: 22px !important; }
    #nptm[data-compact="1"] .nptm-row {
      grid-template-columns: auto minmax(0, 1fr) !important;
      grid-template-areas: "link time" !important;
      padding: 2px 7px 3px !important;
    }
    #nptm[data-compact="1"] .nptm-name { display: none !important; }
    #nptm[data-compact="1"] .nptm-ico {
      width: 22px !important; height: 22px !important;
    }
    #nptm[data-compact="1"] .nptm-link:hover .nptm-ico {
      filter: brightness(1.12) saturate(1.25) !important;
    }
    /* One line to sit against now, so the tick centres — and it sits in the
       gap between the icon and the clock rather than past the clock. */
    #nptm[data-compact="1"] .nptm-mark {
      /* 38 rather than 33: at 33 the tick sat 4px from the icon and read as
         part of it. This leaves a clear gap on both sides, and the clock's
         22px of left padding keeps the digits off its other flank. */
      left: 38px !important; bottom: 50% !important;
      transform: translateY(50%) !important;
    }

    #nptm[data-any-ready="1"] #nptm-head {
      background: linear-gradient(#2fa86f, #1d774f) !important;
      border-bottom-color: #14543a !important;
    }
    #nptm[data-collapsed="1"] #nptm-body { display: none !important; }
    #nptm[data-collapsed="1"] { width: auto !important; }
    #nptm[data-collapsed="1"] #nptm-head { padding: 4px 7px !important; }
    #nptm[data-collapsed="1"] #nptm-title { display: none !important; }
    #nptm[data-collapsed="1"] #nptm-mini { display: inline !important; }

    /* ---- settings page ---- */
    #nptm-shade {
      position: fixed !important; inset: 0 !important;
      background: rgba(0,0,0,0.45) !important; z-index: 2147483646 !important;
    }
    #nptm-settings {
      position: fixed !important; z-index: 2147483647 !important;
      top: 50% !important; left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: min(560px, 94vw) !important; max-height: 86vh !important;
      display: flex !important; flex-direction: column !important;
      background: #fff !important; border: 1px solid #27486d !important;
      border-radius: 10px !important; overflow: hidden !important;
      box-shadow: 0 6px 24px rgba(0,0,0,0.45) !important;
    }
    #nptm-settings header {
      display: flex !important; align-items: center !important;
      padding: 7px 12px !important; color: #fff !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      font: 18pt/1.15 ${CAFETERIA} !important;
    }
    #nptm-settings header span { flex: 1 1 auto !important; }
    #nptm-close {
      display: flex !important; align-items: center !important;
      cursor: pointer !important; padding: 2px !important;
      background: none !important; border: 0 !important; color: #fff !important;
      opacity: 0.85 !important; transition: opacity 0.12s ease !important;
    }
    #nptm-close:hover { opacity: 1 !important; }
    #nptm-close svg { display: block !important; }
    #nptm-settings .nptm-scroll {
      overflow-y: auto !important; padding: 10px 12px !important;
      background: #f6f9fd !important;
    }
    #nptm-settings h4 {
      margin: 12px 0 4px !important; padding: 0 !important;
      font: 14pt/1.2 ${CAFETERIA} !important; color: #1b4f85 !important;
      border-bottom: 1px solid #cfe0f2 !important;
    }
    #nptm-settings h4:first-child { margin-top: 0 !important; }
    .nptm-opt {
      display: flex !important; align-items: center !important; gap: 8px !important;
      padding: 3px 2px !important; font: 12px/1.4 ${MUSEO} !important;
    }
    .nptm-opt .nptm-ico { margin-right: -2px !important; }
    .nptm-opt input[type=checkbox] {
      width: 14px !important; height: 14px !important; margin: 0 !important; flex: none !important;
    }
    .nptm-opt .nptm-opt-name { flex: 1 1 auto !important; color: #22303f !important; }
    .nptm-opt .nptm-opt-when { color: #6a7a8c !important; font-size: 11px !important; }
    /* An off-site link, in a panel where every other link goes to Neopets:
       blue, underlined, and with the arrow that says a new tab. It stands in
       for a clock on the one row that has no time to show until you have been
       and read it. */
    .nptm-off {
      color: #2367B5 !important; text-decoration: underline !important;
      white-space: nowrap !important;
      font: 10px/1.4 ${MUSEO} !important;
    }
    .nptm-off:hover { color: #14407a !important; }
    /* Reorder handle in the settings list. */
    .nptm-grip {
      flex: none !important; display: flex !important; align-items: center !important;
      cursor: grab !important; color: #9aabbd !important; padding: 0 1px !important;
    }
    .nptm-grip:active { cursor: grabbing !important; }
    .nptm-grip svg { display: block !important; }
    .nptm-opt.is-dragging { opacity: 0.45 !important; background: #e3eef9 !important; }
    .nptm-opt.nptm-sortable { border-radius: 4px !important; }
    #nptm-settings .nptm-guide {
      flex: none !important; color: #2367B5 !important;
      font: 11px/1.4 ${MUSEO} !important; text-decoration: underline !important;
      white-space: nowrap !important;
    }
    #nptm-settings .nptm-min {
      width: 58px !important; flex: none !important;
      font: 12px/1.3 ${MUSEO} !important; text-align: center !important;
      border: 1px solid #b7c9dd !important; border-radius: 5px !important;
      padding: 2px 4px !important; background: #fff !important; color: #22303f !important;
    }
    .nptm-bell {
      flex: none !important; cursor: pointer !important; background: none !important;
      border: 0 !important; padding: 0 2px !important; font-size: 12px !important;
      opacity: 0.3 !important;
    }
    .nptm-bell.is-on { opacity: 1 !important; }
    #nptm-settings footer {
      display: flex !important; gap: 8px !important; justify-content: flex-end !important;
      padding: 9px 12px !important; background: #eaf2fb !important;
      border-top: 1px solid #cfe0f2 !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("nptm-style")) return;
    const style = document.createElement("style");
    style.id = "nptm-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------- guide mode
  //
  // The script also runs on the guide that publishes the Symol Hole's daily
  // window, where it does one thing: read today's window off the page and
  // hang it on that page's own links back to Neopets, as a fragment the
  // Neopets side picks up on arrival. Click through from the guide and the
  // window comes with you — nothing is typed, and nothing is fetched behind
  // your back, because the only page read is the one you opened yourself.
  //
  // A fragment rather than a query string: it never reaches a server, not
  // Neopets' and not anyone else's. It carries a number from 0 to 59, which
  // the other side validates before storing; the worst a forged link can do
  // is show you the wrong four minutes.

  const GUIDE_HOSTS = /(^|\.)jellyneo\.net$/i;
  const HASH_PREFIX = "nptm-window-";

  function guideMode() {
    const text = document.body?.innerText || "";
    for (const t of TRACKERS.filter((x) => x.guide && x.guideWindow)) {
      // The guide's own address, loosely: its path, and every query
      // parameter it names present with the same value. Loose rather than
      // exact so a tracking parameter or a different order still matches the
      // page a reader is actually on.
      const guideUrl = new URL(t.guide);
      if (!location.pathname.startsWith(guideUrl.pathname)) continue;
      const here = new URLSearchParams(location.search);
      let sameQuery = true;
      for (const [k, v] of guideUrl.searchParams) {
        if (here.get(k) !== v) sameQuery = false;
      }
      if (!sameQuery) continue;

      // Is this today's page? The guide stamps a date on the window, and a
      // cached or bookmarked copy of yesterday's would otherwise be read as
      // gospel.
      let fresh = true;
      const dated = t.guideDate && text.match(t.guideDate);
      if (dated) {
        const onPage = new Date(`${dated[1]} ${dated[2]}, ${new Date().getFullYear()}`);
        const todayNst = nstDateKey();
        const pageKey = Number.isNaN(onPage.getTime())
          ? null
          : `${onPage.getFullYear()}-${String(onPage.getMonth() + 1).padStart(2, "0")}-${String(onPage.getDate()).padStart(2, "0")}`;
        fresh = pageKey === todayNst;
      }

      const found = text.match(t.guideWindow);
      const none = t.guideNone && t.guideNone.test(text);
      const value = found ? String(Number(found[1])) : none ? "none" : null;
      if (!value || !fresh) {
        if (!fresh) console.info(`${TAG} guide page is not today's; left alone`);
        continue;
      }

      // The point of running here: the window is recorded as soon as the
      // page is open, with no click. The decorated links below are the
      // fallback for a manager that gives no shared storage.
      SHARED.set(sharedWindowKey(t.id), { minute: value, day: nstDateKey() });

      let decorated = 0;
      for (const link of document.querySelectorAll('a[href*="neopets.com"]')) {
        const href = link.getAttribute("href") || "";
        if (!href.toLowerCase().includes(t.path)) continue;
        link.href = `${href.split("#")[0]}#${HASH_PREFIX}${t.id}=${value}`;
        decorated++;
      }
      console.info(
        `${TAG} guide: ${t.name} window ${value}` +
          (SHARED.ok ? " saved for the panel" : "") +
          `; ${decorated} link(s) carry it too`,
      );
      showGuideBadge(t, value, decorated);
    }
  }

  // A line on the guide saying what will travel, so this is visible rather
  // than a surprise on the other end.
  function showGuideBadge(t, value, decorated) {
    if (!decorated && !SHARED.ok) return;
    if (document.getElementById("nptm-guide-badge")) return;
    const anchor = [...document.querySelectorAll("p, h3, span")].find((el) =>
      t.guideWindow.test(el.textContent || ""),
    );
    if (!anchor) return;
    const badge = document.createElement("div");
    badge.id = "nptm-guide-badge";
    badge.style.cssText =
      "margin:8px auto;padding:5px 9px;max-width:420px;border-radius:7px;" +
      "border:1px solid #27486d;background:#eaf2fb;color:#1b4f85;" +
      "font:12px/1.4 Verdana,sans-serif;text-align:center;";
    const known =
      value === "none"
        ? "no window today"
        : `today's :${String(value).padStart(2, "0")} window`;
    badge.textContent = SHARED.ok
      ? `Dailies panel: ${known} \u2014 noted, nothing else to do.`
      : `Dailies panel: open the ${t.name} from this page and ${known} comes with you.`;
    anchor.insertAdjacentElement("afterend", badge);
  }

  // The other half, on Neopets: take the window off the fragment, keep it for
  // today, and tidy the address bar.
  function consumeWindowHash() {
    const m = location.hash.match(new RegExp(`${HASH_PREFIX}([a-z0-9]+)=([a-z0-9]+)`, "i"));
    if (!m) return;
    const t = BY_ID.get(m[1]);
    if (!t || !t.hourly) return;
    const raw = m[2].toLowerCase();
    const value = raw === "none" ? "none" : Number(raw);
    if (value !== "none" && !(Number.isInteger(value) && value >= 0 && value <= 59)) {
      return;
    }
    settings.hourlyWindows = settings.hourlyWindows || {};
    settings.hourlyWindows[t.id] = { minute: value, day: nstDateKey() };
    saveSettings();
    console.info(`${TAG} ${t.id}: window ${value} taken from the guide link`);
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch {
      /* some pages block it; the fragment is harmless either way */
    }
  }

  // ------------------------------------------------------------------- panel

  // An eight-tooth gear, hole punched by the even-odd rule: the first
  // subpath is the hub, the second the body.
  const GEAR_SVG =
    '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path fill="currentColor" fill-rule="evenodd" d="' +
    "M8 10.1a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2z" +
    "M14 8.75V7.25l-1.73-.29a4.5 4.5 0 0 0-.5-1.2l1.02-1.43-1.12-1.12-1.43 1.02" +
    "a4.5 4.5 0 0 0-1.2-.5L8.75 2h-1.5l-.29 1.73a4.5 4.5 0 0 0-1.2.5L4.33 3.21" +
    "L3.21 4.33l1.02 1.43a4.5 4.5 0 0 0-.5 1.2L2 7.25v1.5l1.73.29c.1.42.27.82.5 1.2" +
    "l-1.02 1.43 1.12 1.12 1.43-1.02c.38.23.78.4 1.2.5L7.25 14h1.5l.29-1.73" +
    "c.42-.1.82-.27 1.2-.5l1.43 1.02 1.12-1.12-1.02-1.43c.23-.38.4-.78.5-1.2L14 8.75z" +
    '"/></svg>';

  // Six dots, the usual shorthand for a drag handle.
  const GRIP_SVG =
    '<svg width="9" height="13" viewBox="0 0 9 13" aria-hidden="true">' +
    '<g fill="currentColor">' +
    '<circle cx="2" cy="2.5" r="1.1"/><circle cx="7" cy="2.5" r="1.1"/>' +
    '<circle cx="2" cy="6.5" r="1.1"/><circle cx="7" cy="6.5" r="1.1"/>' +
    '<circle cx="2" cy="10.5" r="1.1"/><circle cx="7" cy="10.5" r="1.1"/>' +
    "</g></svg>";

  // Stroked rather than typographic: ✓ and ✕ render at wildly different
  // weights and baselines across fonts, and at 11px that is the difference
  // between a control and a smudge.
  const stroke = (d, size, width) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}"` +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const CHECK_SVG = stroke("M3.2 8.6 6.3 11.7 12.8 4.6", 11, 2.2);
  const CROSS_SVG = stroke("M4.4 4.4 11.6 11.6M11.6 4.4 4.4 11.6", 11, 2.2);
  const CLOSE_SVG = stroke("M4 4 12 12M12 4 4 12", 14, 2);

  let panel = null;
  let body = null;
  let mini = null;
  let ticker = null;
  let lastReady = new Set();

  // One <img> per row, or nothing at all if the art has moved: a broken image
  // icon in a 16px slot looks worse than a blank one.
  function iconFor(t) {
    const img = document.createElement("img");
    img.className = "nptm-ico";
    img.alt = "";
    img.loading = "lazy";
    img.src = `${IMG_HOST}/${ICONS[t.id] || ""}`;
    img.addEventListener("error", () => img.remove());
    return img;
  }

  function formatShort(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function buildPanel() {
    injectStyle();
    const [vertical, horizontal] = settings.corner.split("-");
    panel = document.createElement("div");
    panel.id = "nptm";
    // Far enough from the corner that it reads as sitting on the page rather
    // than wedged into the window's edge.
    panel.style.setProperty(vertical, "25px", "important");
    panel.style.setProperty(horizontal, "23px", "important");
    panel.dataset.collapsed = settings.collapsed ? "1" : "0";
    panel.dataset.compact = settings.compact ? "1" : "0";

    // No icon and a short word: at 104px the icons-only panel has barely
    // enough head room for the title and the gear.
    const head = document.createElement("div");
    head.id = "nptm-head";

    const title = document.createElement("span");
    title.id = "nptm-title";
    title.textContent = "Dailies";
    head.appendChild(title);

    mini = document.createElement("span");
    mini.id = "nptm-mini";
    head.appendChild(mini);

    const gear = document.createElement("span");
    gear.id = "nptm-gear";
    gear.innerHTML = GEAR_SVG;
    gear.title = "Settings";
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      openSettings();
    });
    head.appendChild(gear);

    head.addEventListener("click", () => {
      settings.collapsed = panel.dataset.collapsed !== "1";
      panel.dataset.collapsed = settings.collapsed ? "1" : "0";
      saveSettings();
      render();
    });
    panel.appendChild(head);

    body = document.createElement("div");
    body.id = "nptm-body";
    panel.appendChild(body);

    document.body.appendChild(panel);
  }

  // The rows are built once and then updated in place, once a second. They
  // used to be thrown away and rebuilt on every tick, which worked but made
  // the hover ✓ flash: a freshly created button starts at opacity 0 with a
  // fade, so under the cursor it blinked back in every second. Only a change
  // in which rows there are, what order they are in, or whether one is ready
  // (the ✓/✕ swap) rebuilds the list now; the ticking clock is a text write.
  let rowCache = new Map();
  let rowsKey = "";

  function rowsSignature(rows) {
    return (
      (settings.compact ? "c" : "n") +
      (settings.newTab ? "t" : "-") +
      (settings.useBypass ? "b" : "-") +
      "|" +
      rows
        .map(
          ({ t, st }) =>
            `${t.id}${st.ready ? "+" : "-"}${needsGuideFirst(t) ? "?" : ""}`,
        )
        .join(",")
    );
  }

  function markTitle(t, st) {
    if (t.type === "allowance") {
      return st.ready
        ? `Out of tries \u2014 stand this down until ${resetAt(t)}`
        : "Not out after all \u2014 put it back to ready";
    }
    return st.ready
      ? "I just did this \u2014 start the timer"
      : "Not done after all \u2014 clear this timer";
  }

  function timeText(st) {
    if (st.text) return st.text;
    if (st.kind === "window" && st.ready) return "Open";
    return st.ready ? "Ready" : formatShort(st.ms);
  }

  // A Symol Hole row with no window set yet sends you to the guide instead
  // of the hole: the hole is no use until you know the four minutes, and
  // arriving via the guide's own link sets them on the way through.
  function needsGuideFirst(t) {
    return !!(t.hourly && t.guide && todaysWindow(t) === null);
  }

  function rowHref(t) {
    if (needsGuideFirst(t)) return t.guide;
    if (usingBypass(t)) return t.bypass;
    // `href` for the rows whose own answer is on a different page from the one
    // `path` matches: a training school's status page rather than its courses.
    return t.href || t.path;
  }

  function linkTitle(t, st, direct) {
    return [
      t.name,
      t.note,
      direct ? BYPASS_NOTE : "",
      needsGuideFirst(t) ? "opens Jellyneo \u2014 today's window is not set yet" : "",
      st.label,
    ]
      .filter(Boolean)
      .join(" \u00b7 ");
  }

  function buildRow({ t, st }) {
    const row = document.createElement("div");
    row.className = "nptm-row" + (st.ready ? " is-ready" : "");

    // Icon and name are one link, so with the names switched off the icon
    // is still the whole target rather than a picture beside a dead space.
    const link = document.createElement("a");
    link.className = "nptm-link";
    const direct = usingBypass(t) && !needsGuideFirst(t);
    link.href = rowHref(t);
    link.title = linkTitle(t, st, direct);
    if (settings.newTab) {
      link.target = "_blank";
      // noopener is the point here: the new tab gets no handle on this one.
      link.rel = "noopener noreferrer";
    }
    link.appendChild(iconFor(t));
    const name = document.createElement("span");
    name.className = "nptm-name";
    name.textContent = t.name;
    link.appendChild(name);
    // Following a bypass link IS the play — the handler acts on the GET —
    // so the click is recorded here. It is the only way the Expellibox can
    // be noticed at all: its handler is on ncmall.neopets.com, a separate
    // origin this script neither runs on nor can read.
    if (direct) link.addEventListener("click", () => markDone(t.id, "bypass"));
    row.appendChild(link);

    // The one row that has nothing to count. Until today's four minutes are
    // known the Symol Hole has no time to show, and it used to print "set" -
    // an instruction in the clock's place, in the clock's own colour, which
    // said neither where to go nor that it was leaving Neopets. The link that
    // answers it goes there instead, marked as off-site.
    const time = document.createElement("span");
    time.className = "nptm-time";
    const guideHere = needsGuideFirst(t);
    if (guideHere) {
      const off = document.createElement("a");
      off.className = "nptm-off";
      off.href = t.guide;
      off.target = "_blank";
      off.rel = "noopener noreferrer";
      off.textContent = "Jellyneo \u2197";
      off.title = `Today's ${t.name} window, published daily \u2014 opens Jellyneo in a new tab`;
      time.appendChild(off);
    } else {
      time.textContent = timeText(st);
    }
    row.appendChild(time);

    // Per-row manual control: the escape hatch for every detection guess.
    // A plain window row is plain clock, so there is nothing to correct.
    let mark = null;
    if (t.type !== "window" || t.cooldownMins) {
      mark = document.createElement("button");
      mark.className = "nptm-mark";
      mark.type = "button";
      mark.innerHTML = st.ready ? CHECK_SVG : CROSS_SVG;
      mark.title = markTitle(t, st);
      mark.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // `ready` is read at click time from the row's own state, not from
        // the st captured when this row was built a while ago.
        const nowReady = rowState(t).ready;
        // An allowance is not a timer you start; it is a day you are out of.
        if (t.type === "allowance") {
          if (nowReady) markSpent(t.id);
          else clearDone(t.id);
        } else if (nowReady) {
          markDone(t.id, "manual");
        } else {
          clearDone(t.id);
        }
        render();
      });
      row.appendChild(mark);
    }

    // The clock is as much a handle as the name is, so a click anywhere in
    // the row that is not the ✓ goes where the link goes — including its
    // new-tab setting and, for a bypass row, the play it records.
    row.addEventListener("click", (e) => {
      if (e.target.closest("a, .nptm-mark")) return;
      link.click();
    });

    return { row, link, time, mark, guideHere };
  }

  function renderRows(rows) {
    const key = rowsSignature(rows);

    if (key !== rowsKey) {
      body.textContent = "";
      rowCache = new Map();
      rowsKey = key;

      if (!rows.length) {
        const empty = document.createElement("div");
        empty.id = "nptm-empty";
        empty.textContent = activeTrackers().length
          ? "Nothing ready yet."
          : "Nothing tracked \u2014 open the settings to pick some.";
        body.appendChild(empty);
        return;
      }

      for (const entry of rows) {
        const built = buildRow(entry);
        rowCache.set(entry.t.id, built);
        body.appendChild(built.row);
      }
      return;
    }

    // Same rows, same order: write the numbers and the hover text, and leave
    // every element (and its hover state) exactly where it is.
    for (const { t, st } of rows) {
      const built = rowCache.get(t.id);
      if (!built) continue;
      // Not the rows holding a link instead of a clock: writing text here
      // would throw the link away. A row crossing into or out of that state
      // changes the signature above and is rebuilt, so this cannot go stale.
      if (!built.guideHere) {
        const text = timeText(st);
        if (built.time.textContent !== text) built.time.textContent = text;
      }
      const title = linkTitle(t, st, usingBypass(t));
      if (built.link.title !== title) built.link.title = title;
      if (built.mark) {
        const mt = markTitle(t, st);
        if (built.mark.title !== mt) built.mark.title = mt;
      }
    }
  }

  function render() {
    if (!panel) buildPanel();

    // `needsYou` survives the ready-only filter. Symol Hole with no window
    // set yet is the case: it is not ready, it is not counting down to
    // anything either, and it is waiting on you to go and read today's minute
    // off Jellyneo - so a list of what wants doing that leaves it out is
    // hiding the one row you could act on.
    const rows = sortForPanel(
      activeTrackers()
        .map((t) => ({ t, st: rowState(t) }))
        .filter(({ st }) => !settings.readyOnly || st.ready || st.needsYou),
    );

    const ready = rows.filter(({ st }) => st.ready);
    panel.dataset.anyReady = ready.length ? "1" : "0";
    panel.dataset.compact = settings.compact ? "1" : "0";
    // Collapsed, the pill is one number for the whole panel, so it is the
    // soonest of the waiting rows rather than the first row in your order.
    const waiting = rows.filter(({ st }) => !st.ready);
    mini.textContent = ready.length
      ? `${ready.length} ready`
      : waiting.length
        ? formatShort(Math.min(...waiting.map(({ st }) => st.ms)))
        : "—";

    body.style.setProperty(
      "max-height",
      `${Math.max(3, settings.maxRows) * (settings.compact ? 28 : 32) + 8}px`,
      "important",
    );
    renderRows(rows);

    // Alert on the transition into ready, for rows whose bell is on — never on
    // first sight of a row that was already ready when the page loaded.
    const nowReady = new Set(ready.map(({ t }) => t.id));
    const fresh = [...nowReady].filter((id) => !lastReady.has(id) && alertsOn(id));
    // `ticker` is only set after the first paint, so a row that was already
    // ready when the page loaded is not announced — only a transition this
    // tab actually watched happen.
    if (fresh.length && ticker) {
      const names = fresh.map((id) => BY_ID.get(id).name);
      fireNotification(names);
      fireBeep();
      if (document.hidden) startTitleFlash(nowReady.size);
    }
    lastReady = nowReady;

  }

  // ---------------------------------------------------------------- settings

  let shade = null;
  let sheet = null;

  function closeSettings() {
    shade?.remove();
    sheet?.remove();
    shade = null;
    sheet = null;
  }

  function cadenceText(t) {
    // For the rows with no cadence to state. A training course runs from an
    // hour to several days depending on the stat and the pet, so "every hour"
    // would be a number this script made up.
    if (t.cadenceWords) return t.cadenceWords;
    if (t.type === "allowance") return t.everyWords || `${t.uses} times a day`;
    if (t.randomStart) return "once a day, random start hour";
    if (t.type === "daily") return `resets at ${resetAt(t)}`;
    if (t.type === "window") {
      if (t.hourly) {
        const m = todaysWindow(t);
        if (m === "none") return "no window today";
        return m === null
          ? `${t.hourly} minutes an hour, at a minute that changes daily`
          : `:${String(m).padStart(2, "0")} each hour, ${t.hourly} minutes`;
      }
      return t.windows.map(([a, b]) => `${a}:00–${b}:00 NST`).join(", ");
    }
    const h = Math.floor(t.mins / 60);
    const m = t.mins % 60;
    if (t.mins >= DAY) return `every ${Math.round(t.mins / DAY)} days`;
    if (h && m) return `every ${h}h ${m}m`;
    if (h) return `every ${h} hour${h > 1 ? "s" : ""}`;
    return `every ${m} minutes`;
  }

  function openSettings() {
    if (sheet) return;
    injectStyle();

    shade = document.createElement("div");
    shade.id = "nptm-shade";
    shade.addEventListener("click", closeSettings);
    document.body.appendChild(shade);

    sheet = document.createElement("div");
    sheet.id = "nptm-settings";
    sheet.appendChild(buildSettingsHeader());

    const scroll = document.createElement("div");
    scroll.className = "nptm-scroll";

    // Global options first: they change what the panel does, not what it lists.
    const globals = document.createElement("div");
    const gHead = document.createElement("h4");
    gHead.textContent = "Panel";
    scroll.appendChild(gHead);
    scroll.appendChild(globals);
    buildGlobalOptions(globals);
    buildWindowFields(globals);
    buildCornerPicker(globals);

    buildTrackerList(scroll);
    sheet.appendChild(scroll);
    sheet.appendChild(buildSettingsFooter());

    document.body.appendChild(sheet);
  }

  // Save, rebuild the sheet, repaint the panel. The sheet is rebuilt rather
  // than patched because its list is built from orderedTrackers() once, so
  // reopening is how a changed order comes back.
  function applyAndReopen() {
    saveSettings();
    closeSettings();
    openSettings();
    render();
  }


  // The sheet's own furniture: a title and the one control that closes it.
  function buildSettingsHeader() {
    const header = document.createElement("header");
    const hTitle = document.createElement("span");
    hTitle.textContent = "Timers to track";
    header.appendChild(hTitle);
    const close = document.createElement("button");
    close.id = "nptm-close";
    close.type = "button";
    close.innerHTML = CLOSE_SVG;
    close.addEventListener("click", closeSettings);
    header.appendChild(close);
    return header;
  }

  // The options that change what the panel does rather than what it lists.
  function buildGlobalOptions(globals) {
    const addGlobal = (key, label, hint, onEnable) => {
      const row = document.createElement("label");
      row.className = "nptm-opt";
      const hintText = () => (typeof hint === "function" ? hint() : hint || "");
      const whenEl = hint ? document.createElement("span") : null;
      if (whenEl) whenEl.className = "nptm-opt-when";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!settings[key];
      box.addEventListener("change", () => {
        settings[key] = box.checked;
        saveSettings();
        if (key === "flashTitle" && !box.checked) stopTitleFlash();
        // This change event is a user gesture, which is the only moment a
        // browser will hand over notification permission or let audio start —
        // so the permission prompt and the test beep live here now.
        if (box.checked && onEnable) onEnable();
        if (whenEl) whenEl.textContent = hintText();
        // This one changes what the rows below it say about themselves, so the
        // page is rebuilt in place rather than left describing the old answer.
        if (key === "useBypass" && sheet) {
          const keepScroll = sheet.querySelector(".nptm-scroll")?.scrollTop || 0;
          closeSettings();
          openSettings();
          const back = sheet?.querySelector(".nptm-scroll");
          if (back) back.scrollTop = keepScroll;
        }
        render();
      });
      row.appendChild(box);
      const name = document.createElement("span");
      name.className = "nptm-opt-name";
      name.textContent = label;
      row.appendChild(name);
      if (whenEl) {
        whenEl.textContent = hintText();
        row.appendChild(whenEl);
      }
      globals.appendChild(row);
    };
    addGlobal(
      "notify",
      "Desktop notification when something is ready",
      notifyPermissionText,
      requestNotifyPermission,
    );
    addGlobal("beep", "Beep when something is ready", null, fireBeep);
    addGlobal("flashTitle", "Flash the tab title", "while the tab is hidden");
    addGlobal("readyOnly", "Only list what is ready", "hide running countdowns");
    addGlobal(
      "questlogNeoPass",
      "Quest Log waits for NeoPass too",
      "both tabs' bonuses, not just Daily Quests",
    );
    addGlobal("newTab", "Open links in a new tab");
    addGlobal(
      "compact",
      "Icons only, no names",
      "narrower panel; names move to the tooltip",
    );
    addGlobal(
      "useBypass",
      "Use direct links where the real page is broken",
      "Coconut Shy, Bagatelle, Expellibox",
    );
  }

  function buildWindowFields(globals) {
    // A field per tracker whose window has to be told to us, with a link to
    // wherever it is published. Only the Symol Hole has one; it is built from
    // the registry so a second would need no new code here.
    //
    // It cannot be fetched for you: jellyneo.net serves no
    // access-control-allow-origin header, so the browser blocks a read of it
    // from neopets.com, and the alternative — GM_xmlhttpRequest — would move
    // this script into the manager's sandbox and cost it the page-context
    // access the request-watching detection depends on. Pasting the line is
    // the next best thing, so the field takes Jellyneo's own wording.
    for (const t of TRACKERS.filter((x) => x.hourly)) {
      const row = document.createElement("div");
      row.className = "nptm-opt";

      const label = document.createElement("span");
      label.className = "nptm-opt-name";
      label.textContent = `${t.name} window`;
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "nptm-min";
      input.placeholder = ":57";
      input.title =
        'Paste Jellyneo\'s line ("XX:57:00 to XX:59:59"), or just the minute. ' +
        '"none" for a day with no window.';
      const current = todaysWindow(t);
      if (current === "none") input.value = "none";
      else if (current !== null) input.value = `:${String(current).padStart(2, "0")}`;

      const hint = document.createElement("span");
      hint.className = "nptm-opt-when";
      const describe = () => {
        const m = todaysWindow(t);
        if (m === "none") return "no window today";
        if (m === null) return "paste today's line, or click through from";
        const end = Math.min(m + t.hourly, 60) - 1;
        return `:${String(m).padStart(2, "0")}:00\u2013:${String(end).padStart(2, "0")}:59 every hour today`;
      };

      input.addEventListener("change", () => {
        const parsed = parseWindowInput(input.value);
        settings.hourlyWindows = settings.hourlyWindows || {};
        if (parsed === undefined) {
          delete settings.hourlyWindows[t.id];
          SHARED.set(sharedWindowKey(t.id), null);
          input.value = "";
        } else {
          // Dated, so tomorrow it asks again instead of running on yesterday's.
          settings.hourlyWindows[t.id] = { minute: parsed, day: nstDateKey() };
          SHARED.set(sharedWindowKey(t.id), { minute: parsed, day: nstDateKey() });
          input.value =
            parsed === "none" ? "none" : `:${String(parsed).padStart(2, "0")}`;
        }
        saveSettings();
        hint.textContent = describe();
        render();
      });
      row.appendChild(input);

      hint.textContent = describe();
      row.appendChild(hint);

      if (t.guide) {
        const guide = document.createElement("a");
        guide.className = "nptm-guide";
        guide.href = t.guide;
        guide.target = "_blank";
        guide.rel = "noopener noreferrer";
        guide.textContent = "Jellyneo \u2197";
        guide.title = "Today's window, published daily";
        row.appendChild(guide);
      }

      globals.appendChild(row);
    }
  }

  // Which corner the panel sits in. A select rather than four radios: it
  // is one answer out of four and nobody compares them.
  function buildCornerPicker(globals) {
    const cornerRow = document.createElement("label");
    cornerRow.className = "nptm-opt";
    const cornerName = document.createElement("span");
    cornerName.className = "nptm-opt-name";
    cornerName.textContent = "Corner";
    cornerRow.appendChild(cornerName);
    const cornerSel = document.createElement("select");
    for (const c of ["bottom-left", "bottom-right", "top-left", "top-right"]) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c.replace("-", " ");
      if (settings.corner === c) opt.selected = true;
      cornerSel.appendChild(opt);
    }
    cornerSel.addEventListener("change", () => {
      settings.corner = cornerSel.value;
      saveSettings();
      // Rebuilt rather than repositioned, so the old corner's offsets go away.
      panel?.remove();
      panel = null;
      render();
    });
    cornerRow.appendChild(cornerSel);
    globals.appendChild(cornerRow);
  }

  function buildTrackerList(scroll) {
    // One list, in your order, each row a checkbox plus its own bell.
    //
    // It used to be a section per category - Freebies, Wheels, Quests and the
    // rest - which sorted sixty rows into a shape nobody was looking for: the
    // question in front of this list is "is this one on", and a category is no
    // help answering it twice. One list in one order is also the only thing
    // you can drag within, and dragging is what sets the panel's order.
    const listHead = document.createElement("h4");
    listHead.textContent = "Dailies";
    scroll.appendChild(listHead);

    const list = document.createElement("div");
    list.id = "nptm-list";
    scroll.appendChild(list);

    // The dragged row moves through the list as you go, so the list itself
    // is the preview. Dropping just writes down what it already shows.
    const drag = { row: null };
    const commitOrder = () => {
      settings.order = [...list.children].map((el) => el.dataset.id);
      saveSettings();
      render();
    };
    list.addEventListener("dragover", (e) => {
      if (drag.row) e.preventDefault();
    });
    list.addEventListener("drop", (e) => {
      if (drag.row) e.preventDefault();
    });

    for (const t of orderedTrackers()) {
      list.appendChild(buildTrackerOption(t, { list, drag, commitOrder }));
    }
  }

  // One row of that list: a drag handle, the checkbox, the activity's icon
  // and name, when it comes back, and its own alert bell.
  //
  // `drag` is a holder rather than a plain variable because the dragged row
  // has to be reachable from every other row's dragover handler, and a row
  // is built one at a time.
  function buildTrackerOption(t, { list, drag, commitOrder }) {
    const row = document.createElement("div");
    row.className = "nptm-opt nptm-sortable";
    row.dataset.id = t.id;

    // The handle, not the whole row: a row is mostly a checkbox and a
    // label, and starting a drag from either of those fights the thing
    // they are for.
    const grip = document.createElement("span");
    grip.className = "nptm-grip";
    grip.innerHTML = GRIP_SVG;
    grip.title = "Drag to reorder \u2014 the panel follows this order";
    grip.draggable = true;
    grip.addEventListener("dragstart", (e) => {
      drag.row = row;
      row.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", t.id);
        } catch {
          /* some browsers refuse the payload; the drag still works */
        }
      }
    });
    // Fires on a drop and on a cancelled drag alike, and by then the list
    // is already in whatever order you left it in, so one handler writes
    // both outcomes down.
    grip.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      drag.row = null;
      commitOrder();
    });
    row.appendChild(grip);

    row.addEventListener("dragover", (e) => {
      if (!drag.row || drag.row === row) return;
      e.preventDefault();
      const box = row.getBoundingClientRect();
      const below = e.clientY > box.top + box.height / 2;
      list.insertBefore(drag.row, below ? row.nextSibling : row);
    });

    row.appendChild(iconFor(t));

    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = `nptm-on-${t.id}`;
    box.checked = isOn(t.id);
    box.addEventListener("change", () => {
      settings.enabled[t.id] = box.checked;
      if (box.checked && settings.alerts[t.id] === undefined) {
        settings.alerts[t.id] = true;
      }
      saveSettings();
      bell.className = "nptm-bell" + (alertsOn(t.id) ? " is-on" : "");
      render();
    });
    row.appendChild(box);

    const label = document.createElement("label");
    label.className = "nptm-opt-name";
    label.htmlFor = box.id;
    label.textContent = t.name;
    row.appendChild(label);

    const when = document.createElement("span");
    when.className = "nptm-opt-when";
    // The cadence only. There was a second clause here saying how the row
    // gets detected ("watches the page's own requests" and the like),
    // which answered a question about the script rather than about the
    // daily: sixty rows each explaining their own plumbing, in a list
    // whose job is picking what to track. Where detection matters it is
    // already on the row in the panel, in its tooltip, as what the timer
    // was actually set from.
    when.textContent = cadenceText(t);
    row.appendChild(when);

    const bell = document.createElement("button");
    bell.type = "button";
    bell.className = "nptm-bell" + (alertsOn(t.id) ? " is-on" : "");
    bell.textContent = "\u{1F514}";
    bell.title = "Alert when this one is ready";
    bell.addEventListener("click", () => {
      settings.alerts[t.id] = !alertsOn(t.id);
      saveSettings();
      bell.className = "nptm-bell" + (alertsOn(t.id) ? " is-on" : "");
    });
    row.appendChild(bell);
    return row;
  }

  // Default, Default order, None and Done. The first three all end the
  // same way - save, redraw the sheet, redraw the panel - which is what
  // applyAndReopen is.
  function buildSettingsFooter() {
    const footer = document.createElement("footer");
    const mkBtn = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nptm-btn nptm-btn--sm";
      b.textContent = text;
      b.addEventListener("click", fn);
      return b;
    };
    footer.appendChild(
      mkBtn("Default", () => {
        settings.enabled = {};
        settings.alerts = {};
        TRACKERS.forEach((t) => {
          if (t.on) {
            settings.enabled[t.id] = true;
            settings.alerts[t.id] = true;
          }
        });
        applyAndReopen();
      }),
    );
    footer.appendChild(
      mkBtn("Default order", () => {
        // The order only, leaving on and off alone - the two are separate
        // questions and the Default button beside this one answers the other.
        // This empties the list rather than writing DEFAULT_ORDER into it, so
        // the panel goes back to following that list: a tracker added in a
        // later update then lands where Jellyneo puts it, instead of at the
        // end of a copy of the list made today.
        settings.order = [];
        applyAndReopen();
      }),
    );
    footer.appendChild(
      mkBtn("None", () => {
        // Explicit falses rather than an empty map: an absent entry now means
        // "added since you last looked" and falls back to the default set, so
        // clearing the map would quietly turn the defaults back on.
        settings.enabled = {};
        TRACKERS.forEach((t) => {
          settings.enabled[t.id] = false;
        });
        applyAndReopen();
      }),
    );
    footer.appendChild(mkBtn("Done", closeSettings));
    return footer;
  }

  // --------------------------------------------------------------------- wire

  window.addEventListener("storage", (e) => {
    if (e.key === STATE_KEY) render();
    if (e.key === SETTINGS_KEY) {
      settings = { ...DEFAULTS, enabled: {}, alerts: {}, ...(readJSON(SETTINGS_KEY, {}) || {}) };
      panel?.remove();
      panel = null;
      render();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) stopTitleFlash();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet) closeSettings();
  });

  function start() {
    // On the guide site the script is a reader, not a panel.
    if (GUIDE_HOSTS.test(location.hostname)) {
      guideMode();
      return;
    }

    consumeWindowHash();
    const here = matchTracker();
    if (here && isOn(here.id)) {
      watchForVisit(here);
      console.info(`${TAG} on ${here.name}`);
    }
    render();
    // Derived from stored timestamps rather than accumulated ticks, so a
    // throttled or suspended tab still shows the right number when read.
    ticker = setInterval(render, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

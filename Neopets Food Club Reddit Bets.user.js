// ==UserScript==
// @name         # Neopets Food Club Reddit Bets
// @namespace    local-advisor-fork
// @version      1.0
// @description  A panel on the Food Club page with one button to today's "Food Club Bets" post on r/neopets. It finds the post by date and opens it in a new tab when you click; it never places, picks or collects a bet.
// @author       Austin Ryder
// @match        *://www.neopets.com/pirates/foodclub.phtml*
// @match        *://neopets.com/pirates/foodclub.phtml*
// @grant        GM_xmlhttpRequest
// @connect      www.reddit.com
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Food%20Club%20Reddit%20Bets.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Food%20Club%20Reddit%20Bets.user.js
// ==/UserScript==
//
// WHY
//
// Food Club is the one daily where the work is done somewhere else. Working
// out ten bets from twenty pirates' strengths, weights, allergies and the
// day's courses is an afternoon's arithmetic, and r/neopets posts the answer
// every day under the "Food Club" flair, titled by date:
//
//   Food Club Bets November 27, 2026
//
// So the only thing missing from the Food Club page is a link to that day's
// post. This is that link, as a button, in the corner.
//
// FINDING THE POST
//
// Two routes, and the fallback is the one that is guaranteed:
//
//   - The subreddit's own new-posts listing (new.json), read once a day and
//     filtered to the Food Club flair and a title carrying today's NST date.
//     Found, the button goes straight to the post. This is the listing rather
//     than Reddit's search because search indexes on a delay of its own, and
//     a post made an hour ago is exactly the one being asked for.
//   - If that read fails or turns nothing up, the button falls back to a
//     Reddit search for the exact title, and the second link goes to the
//     flair feed, which is live and has the day's post at the top of it.
//
// The listing read is the part that cannot be promised. Reddit refuses
// unauthenticated JSON to anything it does not take for a browser - this was
// tried from a terminal while the script was written and came back 403 with a
// page of HTML - and whether it answers a GM_xmlhttpRequest from your browser
// is between Reddit and your browser. Nothing here depends on it: a failure
// is one console line, and the button still works. If it does answer, the
// panel names the post it found so you can see what you are about to open.
//
// NST, NOT YOUR CLOCK
//
// The date in the title is the Neopian one, so it is read off US Pacific
// rather than off wherever you are sitting. Past midnight NST in Europe, a
// local date would ask for tomorrow's post, which does not exist yet.
//
// SCOPE, and the ground rule
//
// Display only, per the README: it draws a panel and, when you click the
// button, opens a Reddit tab. It does not place a bet, pick a pirate, read
// your balance, collect winnings or submit anything on either site. The one
// request it makes is a GET of a public subreddit listing, with nothing of
// yours in it.

(function () {
  "use strict";

  const SUB = "neopets";
  const FLAIR = "Food Club";
  // The live feed: the flair filter on the subreddit itself, which is what a
  // person would open. Linked as the second row, and the honest answer
  // whenever the day's post cannot be named.
  const FLAIR_URL =
    `https://www.reddit.com/r/${SUB}/?f=flair_name%3A%22${encodeURIComponent(FLAIR)}%22`;
  const LISTING_URL = `https://www.reddit.com/r/${SUB}/new.json?limit=100&raw_json=1`;

  // How long to leave a failed or empty lookup alone. Today's post is not up
  // yet for part of every day, and asking Reddit on every Food Club page load
  // for the rest of that day would be rude and no more likely to work.
  const RECHECK_MS = 15 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 12000;

  const TAG = "[Food Club bets]";
  const STORE_KEY = "foodclubReddit.found";

  // ------------------------------------------------------------------ the day

  // The Neopian date, in the form the post titles use: "November 27, 2026".
  function nstDateWords(when = new Date()) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(when);
  }

  // The same date, short, for the panel's own line.
  function nstDateShort(when = new Date()) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
    }).format(when);
  }

  const today = nstDateWords();

  // A title is today's if it carries today's date. Matched loosely on purpose:
  // the comma before the year, double spaces and a trailing "(Round 10067)"
  // are all things a human title has had, and none of them change which day it
  // is about.
  function titleIsFor(title, words) {
    const [month, dayComma, year] = words.split(" ");
    const day = dayComma.replace(",", "");
    const re = new RegExp(`${month}\\s+0?${day}(st|nd|rd|th)?,?\\s+${year}`, "i");
    return re.test(title);
  }

  function looksLikeBets(post) {
    const flair = (post.link_flair_text || "").trim();
    if (flair && flair.toLowerCase() === FLAIR.toLowerCase()) return true;
    // A post that lost its flair, or was never given one, is still the post if
    // it is titled like one.
    return /food\s*club\s*bets/i.test(post.title || "");
  }

  function searchUrl(words) {
    const q = `subreddit:${SUB} title:"Food Club Bets ${words}"`;
    return `https://www.reddit.com/search/?q=${encodeURIComponent(q)}&sort=new`;
  }

  // ---------------------------------------------------------------- the store

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  function save(entry) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(entry));
    } catch (err) {
      // Nothing is lost but the politeness: without a store, the lookup runs
      // again on the next Food Club page instead of once a day.
      console.warn(`${TAG} cannot remember today's post`, err);
    }
  }

  // --------------------------------------------------------------- the lookup

  function fetchListing() {
    return new Promise((done, fail) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        fail(new Error("no GM_xmlhttpRequest; the button uses the search link"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: LISTING_URL,
        timeout: FETCH_TIMEOUT_MS,
        // Nothing identifying is sent: no headers of ours, no account, no
        // referrer beyond what the browser would send for a plain GET.
        onload: (res) => {
          if (res.status !== 200) {
            fail(new Error(`Reddit answered ${res.status}`));
            return;
          }
          try {
            done(JSON.parse(res.responseText));
          } catch {
            // What Reddit serves a request it does not like is an HTML page,
            // which lands here rather than as a status.
            fail(new Error("Reddit answered with something that is not JSON"));
          }
        },
        onerror: () => fail(new Error("the request to Reddit failed")),
        ontimeout: () => fail(new Error("the request to Reddit timed out")),
      });
    });
  }

  // The newest Food Club bets post, and today's if it is there. Both are
  // useful: "today's is not up yet, yesterday's is" is a real answer and the
  // panel says it.
  function pickPost(json) {
    const kids = json?.data?.children || [];
    let newest = null;
    for (const kid of kids) {
      const post = kid?.data;
      if (!post || !looksLikeBets(post)) continue;
      if (titleIsFor(post.title || "", today)) {
        return { post, isToday: true };
      }
      if (!newest) newest = post;
    }
    return newest ? { post: newest, isToday: false } : null;
  }

  async function lookUp() {
    const held = load();
    if (held.date === today && held.url) {
      show({ url: held.url, title: held.title, isToday: true });
      return;
    }
    if (held.checkedAt && Date.now() - held.checkedAt < RECHECK_MS) {
      show(null, held.why || "");
      return;
    }

    setNote("looking on Reddit…");
    try {
      const found = pickPost(await fetchListing());
      if (!found) {
        const why = "no Food Club post on the last hundred";
        save({ checkedAt: Date.now(), why });
        show(null, why);
        return;
      }
      const url = `https://www.reddit.com${found.post.permalink}`;
      if (found.isToday) {
        save({ date: today, url, title: found.post.title, checkedAt: Date.now() });
      } else {
        // Remembered as a miss, so tomorrow's first look tries again, but
        // shown anyway: the newest post is the best there is right now.
        save({ checkedAt: Date.now(), why: "today's is not up yet" });
      }
      show({ url, title: found.post.title, isToday: found.isToday });
    } catch (err) {
      const why = "Reddit did not answer";
      console.warn(`${TAG} ${err.message}; the button falls back to a search`);
      save({ checkedAt: Date.now(), why });
      show(null, why);
    }
  }

  // ---------------------------------------------------------------- the panel
  //
  // House style, per .claude/skills/neopets-panel-style: the site's own two
  // fonts from images.neopets.com, the #2367B5 header that turns Meridell
  // green once today's post has been found, and the Safety Deposit Box's
  // yellow button. 150px, because the site's content column is 1000px and
  // centred, so at that width the panel sits in the window's margin rather
  // than over the page - and the post title, the one thing here that can be
  // long, gets its own line and an ellipsis rather than making it wider.

  const FONT_HOST = "https://images.neopets.com/js/fonts";
  const CAFETERIA = '"NPFC Cafeteria", "Cafeteria", "Arial Bold", sans-serif';
  const MUSEO = '"NPFC Museo", "Museo Sans Rounded", Verdana, sans-serif';

  const CSS = `
    @font-face {
      font-family: "NPFC Cafeteria"; font-display: swap;
      src: url("${FONT_HOST}/cafeteria-black.ttf") format("truetype");
    }
    @font-face {
      font-family: "NPFC Museo"; font-style: normal; font-display: swap;
      src: url("${FONT_HOST}/museosansrounded-500.woff") format("woff"),
           url("${FONT_HOST}/museosansrounded-500.ttf") format("truetype");
    }
    #npfc {
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
    #npfc * { box-sizing: border-box !important; }
    #npfc [hidden] { display: none !important; }
    #npfc-head {
      display: flex !important; align-items: center !important;
      gap: 6px !important; padding: 4px 8px !important;
      background: linear-gradient(#5b9bd9, #2367B5) !important;
      border-bottom: 1px solid #27486d !important;
      color: #fff !important; font: 13pt/1.1 ${CAFETERIA} !important;
      user-select: none !important;
    }
    #npfc[data-found="1"] #npfc-head {
      background: linear-gradient(#2fa86f, #1d774f) !important;
      border-bottom-color: #14543a !important;
    }
    #npfc-title {
      flex: 1 1 auto !important; white-space: nowrap !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
    }
    #npfc-day {
      flex: none !important; font: 10.5px/1.4 ${MUSEO} !important;
      opacity: 0.9 !important;
    }
    #npfc-body {
      background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
      padding: 6px 8px 8px !important; border-radius: 0 0 9px 9px !important;
    }
    #npfc-label {
      color: #4a5a6a !important; font: 11px/1.4 ${MUSEO} !important;
      margin: 0 0 1px !important;
    }
    /* Two lines of title, then an ellipsis. One line cut most of these titles
       off at "Food Club Bets Novem", which told you nothing you did not
       already know; three made the panel taller than the thing it links to. */
    #npfc-post {
      color: #1b4f85 !important; font: 11px/1.35 ${MUSEO} !important;
      display: -webkit-box !important; -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important; overflow: hidden !important;
      margin: 0 0 6px !important; min-height: 15px !important;
    }
    #npfc-note {
      color: #6a7a8c !important; font: 10.5px/1.35 ${MUSEO} !important;
      margin: 0 0 6px !important;
    }
    #npfc-btn {
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
    #npfc-btn:hover, #npfc-btn:focus {
      background: linear-gradient(#ffff54, #ffd328) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,84,1),
                  inset 0 -3px 2px 3px rgba(234,143,9,1),
                  inset 0 2px 0 1px rgba(255,255,243,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    #npfc-btn:active {
      background: linear-gradient(#ebb233, #f6e250) !important;
      box-shadow: inset 0 0 0 1px rgba(235,178,51,1),
                  inset 0 -1px 2px 3px rgba(196,124,25,1),
                  inset 0 2px 0 1px rgba(253,249,220,1),
                  0 0 0 2px rgba(0,0,0,1) !important;
    }
    /* An off-site link on a Neopets page: blue, underlined, with the arrow
       that says a new tab. */
    #npfc-feed {
      display: block !important; margin: 6px 0 0 !important;
      text-align: center !important;
      color: #2367B5 !important; text-decoration: underline !important;
      font: 10px/1.4 ${MUSEO} !important;
    }
    #npfc-feed:hover { color: #14407a !important; }
  `;

  let panel = null;
  let elDay = null;
  let elPost = null;
  let elNote = null;
  let btn = null;

  function injectStyles() {
    if (document.getElementById("npfc-style")) return;
    const style = document.createElement("style");
    style.id = "npfc-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function build() {
    injectStyles();

    panel = document.createElement("div");
    panel.id = "npfc";

    const head = document.createElement("div");
    head.id = "npfc-head";
    const title = document.createElement("span");
    title.id = "npfc-title";
    // Where the bets come from, not what the script is: on the Food Club page
    // the game is not the thing in doubt.
    title.textContent = "Reddit bets";
    elDay = document.createElement("span");
    elDay.id = "npfc-day";
    elDay.textContent = nstDateShort();
    elDay.title = `${today} NST`;
    head.appendChild(title);
    head.appendChild(elDay);
    panel.appendChild(head);

    const body = document.createElement("div");
    body.id = "npfc-body";

    const label = document.createElement("div");
    label.id = "npfc-label";
    label.textContent = "Today's post";
    body.appendChild(label);

    elPost = document.createElement("div");
    elPost.id = "npfc-post";
    body.appendChild(elPost);

    elNote = document.createElement("div");
    elNote.id = "npfc-note";
    elNote.hidden = true;
    body.appendChild(elNote);

    btn = document.createElement("button");
    btn.id = "npfc-btn";
    btn.type = "button";
    btn.textContent = "Open";
    body.appendChild(btn);

    const feed = document.createElement("a");
    feed.id = "npfc-feed";
    feed.href = FLAIR_URL;
    feed.target = "_blank";
    feed.rel = "noopener noreferrer";
    feed.textContent = "All Food Club posts ↗";
    body.appendChild(feed);

    panel.appendChild(body);
    (document.body || document.documentElement).appendChild(panel);
  }

  function setNote(text) {
    if (!panel) build();
    elNote.textContent = text || "";
    elNote.hidden = !text;
  }

  // The one place the button's destination is decided, so there is never a
  // state in which it does nothing: with a post, it opens the post; without
  // one, it opens a search for the title today's post would have.
  function show(found, why) {
    if (!panel) build();

    const url = found ? found.url : searchUrl(today);
    const isToday = !!found && found.isToday;

    panel.dataset.found = isToday ? "1" : "0";
    elPost.textContent = found ? found.title : "—";
    elPost.title = found ? found.title : "";

    if (isToday) {
      setNote("");
    } else if (found) {
      setNote(`today's is not up yet — this is the newest one`);
    } else {
      setNote(`${why || "not found"} — the button searches Reddit for it`);
    }

    btn.textContent = isToday ? "Open today's bets" : found ? "Open newest" : "Search Reddit";
    btn.title = url;
    btn.onclick = () => window.open(url, "_blank", "noopener,noreferrer");
  }

  // ------------------------------------------------------------------- the go

  // The panel is drawn with the fallback already wired, before anything is
  // asked of Reddit: the button works from the first frame, and the lookup
  // only ever improves it.
  function run() {
    build();
    show(null, "");
    setNote("looking on Reddit…");
    lookUp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();

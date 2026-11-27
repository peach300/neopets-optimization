// ==UserScript==
// @name         # Neopets Food Club Reddit Bets
// @namespace    local-advisor-fork
// @version      2.2
// @description  A panel on the Food Club page with one button to the "Food Club" flair feed on r/neopets, where the day's bets are posted, and the NST date its title will carry. It never places, picks or collects a bet.
// @author       Austin Ryder
// @match        *://www.neopets.com/pirates/foodclub.phtml*
// @match        *://neopets.com/pirates/foodclub.phtml*
// @grant        none
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
// So the only thing missing from the Food Club page is a way over to those
// posts. This is that, as a button, in the corner.
//
// WHY IT IS A FEED AND NOT THE POST ITSELF
//
// Version 1 tried to name the day's post and link straight to it, two ways,
// and both were wrong:
//
//   - Reading the subreddit's own listing (new.json). Reddit does not answer
//     unauthenticated requests for it. This was known to be a risk when it was
//     written - a terminal got 403 and a page of HTML - and the hope was that
//     the same request from a logged-in browser would fare better. It does
//     not, so there is nothing to read and nothing to name.
//   - Falling back to a Reddit search for the exact title. The search term
//     did not work: `subreddit:neopets title:"Food Club Bets November 27,
//     2026"` turns up nothing useful, so the fallback was a button that
//     reliably opened a page of no results.
//
// What does work is the thing a person would do: open the flair feed, which
// is live, needs nothing read and has the day's post at the top of it. One
// click instead of none, which is the whole job.
//
// WHAT IS LEFT OF IT
//
// A name, a date and a button. The found-post line and the note about the
// feed's order are gone: both were read once and then stood there being read
// again every day after, which is a lot of panel for a link.
//
// The date stays, because it is the one piece the feed does not give you:
// the titles are all alike apart from the date, so knowing which to look for
// is how you tell today's post from the one above it that is still
// yesterday's. It is the Neopian date, read off US Pacific rather than off
// wherever you are sitting: past midnight NST in Europe a local date would
// have you looking for tomorrow's post, which does not exist yet.
//
// SCOPE, and the ground rule
//
// Display only, per the README: it draws a panel and, when you click the
// button, opens a Reddit tab. It makes no requests of its own - the one thing
// it does to another site is open a public page in a new tab, when you ask it
// to - and it does not place a bet, pick a pirate, read your balance, collect
// winnings or submit anything on either site.

(function () {
  "use strict";

  // Version 1 remembered the post it had found under this key. Nothing is
  // looked up any more, so the key is dead weight in the site's storage;
  // cleared on the first load of this version rather than left behind.
  try {
    localStorage.removeItem("foodclubReddit.found");
  } catch {
    /* private mode */
  }

  const SUB = "neopets";
  const FLAIR = "Food Club";
  // The live feed: the flair filter on the subreddit itself, which is what a
  // person would open, and now the only destination there is.
  const FLAIR_URL =
    `https://www.reddit.com/r/${SUB}/?f=flair_name%3A%22${encodeURIComponent(FLAIR)}%22`;

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

  // ---------------------------------------------------------------- the panel
  //
  // House style, per .claude/skills/neopets-panel-style: the site's own two
  // fonts from images.neopets.com, the #2367B5 header and the Safety Deposit
  // Box's yellow button. 150px, because the site's content column is 1000px
  // and centred, so at that width the panel sits in the window's margin
  // rather than over the page.
  //
  // No green state: the panel has nothing to find out and so is never more or
  // less ready than it was on load. Green is for a row that has an answer.

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
    #npfc-title {
      flex: 1 1 auto !important; white-space: nowrap !important;
      overflow: hidden !important; text-overflow: ellipsis !important;
    }
    #npfc-body {
      background: #eaf2fb !important; border-top: 1px solid #bcd3ec !important;
      padding: 6px 8px 8px !important; border-radius: 0 0 9px 9px !important;
    }
    /* The date the day's post will be titled by, which is what you match by
       eye once the feed is open. Centred over the button rather than set
       left, because with nothing else in the body a left-set line reads as
       the start of a sentence that never arrives. */
    #npfc-date {
      color: #1b4f85 !important; font: 11.5px/1.35 ${MUSEO} !important;
      text-align: center !important; margin: 0 0 6px !important;
      white-space: nowrap !important; overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    #npfc-btn {
      /* Flex rather than the house style's block, because the label now has
         the off-site arrow beside it and the two have to centre as one thing.
         text-align is left in place for the same reason it is everywhere
         else here: it is what the page would otherwise impose. */
      display: flex !important; align-items: center !important;
      justify-content: center !important; gap: 5px !important;
      width: 100% !important; margin: 0 !important;
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
    /* Lifted by 2px: Cafeteria sits high in its box (which is why the button
       is padded 3px over 7px), so an arrow centred on the flex line reads as
       sitting below the letters rather than with them. */
    #npfc-icon {
      display: block !important; flex: none !important;
      margin-bottom: 2px !important;
    }
  `;

  // The off-site arrow: a box with one corner open and an arrow leaving
  // through it, which is the shape every site uses for "this opens somewhere
  // else". Inline SVG rather than a glyph or an icon font, per the house
  // style - it inherits the button's own colour and cannot arrive late or
  // 404 into an empty square.
  function offSiteIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.id = "npfc-icon";
    svg.setAttribute("viewBox", "0 0 24 24");
    // 11px against an 11pt label: the arrow is a note about the button, not
    // half of it.
    svg.setAttribute("width", "11");
    svg.setAttribute("height", "11");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    // The three sides of the box that are drawn, left open at the top right.
    const box = document.createElementNS(NS, "path");
    box.setAttribute("d", "M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5");
    svg.appendChild(box);
    // The arrow through the gap: the shaft, then the corner it points into.
    const shaft = document.createElementNS(NS, "path");
    shaft.setAttribute("d", "M10 14 21 3");
    svg.appendChild(shaft);
    const head = document.createElementNS(NS, "path");
    head.setAttribute("d", "M15 3h6v6");
    svg.appendChild(head);
    return svg;
  }

  function injectStyles() {
    if (document.getElementById("npfc-style")) return;
    const style = document.createElement("style");
    style.id = "npfc-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function build() {
    if (document.getElementById("npfc")) return;
    injectStyles();

    const today = nstDateWords();

    const panel = document.createElement("div");
    panel.id = "npfc";

    const head = document.createElement("div");
    head.id = "npfc-head";
    const title = document.createElement("span");
    title.id = "npfc-title";
    // Where the bets come from, not what the script is: on the Food Club page
    // the game is not the thing in doubt.
    title.textContent = "Food Club Bets";
    head.appendChild(title);
    panel.appendChild(head);

    const body = document.createElement("div");
    body.id = "npfc-body";

    const date = document.createElement("div");
    date.id = "npfc-date";
    date.textContent = today;
    // The only place the panel says which clock that date is on. It is in the
    // tooltip rather than on the line because "November 27, 2026 NST" is
    // wider than the panel, and the three letters are the part you can work
    // out from the other sixteen.
    date.title = `${today} NST`;
    body.appendChild(date);

    const btn = document.createElement("button");
    btn.id = "npfc-btn";
    btn.type = "button";
    const word = document.createElement("span");
    word.textContent = "Reddit";
    btn.appendChild(word);
    btn.appendChild(offSiteIcon());
    btn.title = FLAIR_URL;
    // window.open rather than a link, so the one control in the panel is the
    // site's own button and not a button-shaped anchor.
    btn.onclick = () => window.open(FLAIR_URL, "_blank", "noopener,noreferrer");
    body.appendChild(btn);

    panel.appendChild(body);
    (document.body || document.documentElement).appendChild(panel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build, { once: true });
  } else {
    build();
  }
})();

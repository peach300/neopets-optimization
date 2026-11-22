// ==UserScript==
// @name         # Neopets Scarab 21 Advisor
// @namespace    local-advisor-fork
// @version      1.1
// @description  Ranks every legal column for the drawn card: exact immediate points plus a simulated expected final score with error bars. Advisory only -- it never clicks, submits, navigates or starts/ends a game. You make every move.
// @author       Austin Ryder
// @contributor  Decision engine by @willnjohnson (Scarab 21 Autoplayer, GF 576515); advisory-only fork
// @match        https://www.neopets.com/games/scarab21/scarab21.phtml*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Scarab%2021%20Advisor.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Scarab%2021%20Advisor.user.js
// ==/UserScript==
//
// NOTE ON UPDATES: @downloadURL / @updateURL are deliberately omitted. The upstream
// script is a full autoplayer; leaving them in place would let Tampermonkey silently
// replace this advisory fork with the automating original.
//
// Scarab 21 reloads the page after each card placement, so one evaluation per page
// load is exactly one evaluation per decision. There is no loop and no timer.
//
// NOTE ON PRECISION: two changes to the upstream engine, both load-bearing.
//
//  1. Upstream's rollout policy scanned columns 0..4 and compared with a strict `>`,
//     so equal-weight moves always broke toward the lowest column index. This biased
//     the simulated fill order and produced a persistent ~10pt expected-score spread
//     between columns that were in fact identical -- a spread that did NOT shrink
//     with more rollouts (measured: 10.1pt at 300 rollouts, 9.7pt at 20000). The
//     column order is now shuffled per card, after which the spread behaves like
//     real Monte Carlo error (6.9 / 3.2 / 1.7 / 0.9pt at 300 / 1k / 5k / 20k).
//
//  2. Even with that fixed, genuine differences between columns are often smaller
//     than the residual error, so a bare "best column" claim would be false
//     confidence. The panel therefore shows each column's error bar, says plainly
//     when columns cannot be separated, and breaks statistical ties on exact
//     immediate points -- arithmetic that carries no error at all.

(function () {
  "use strict";

  // CONFIG
  const CONFIG = {
    bestColor: "#1a9850",      // recommended column
    runnerUpColor: "#fdae61",  // legal but worse
    illegalColor: "#d73027",   // cannot legally receive the card
    outlineWidth: "4px",
    rollouts: 2000,   // ~150-250ms; see NOTE ON PRECISION in the header
    tieSigmas: 2,      // EV gaps smaller than this many combined SEs are called a tie
  };

  // ======================================================================
  // DECISION ENGINE -- unchanged from the upstream autoplayer.
  // Pure computation: reads a board, returns numbers. Touches nothing.
  // ======================================================================

  const ROLLOUTS = CONFIG.rollouts;

  /** Returns the best sum of a column's card values, treating aces optimally. */
  function calcFastSum(cards) {
    let sum = 0;
    let aces = 0;
    for (const v of cards) {
      sum += v;
      if (v === 1) aces++;
    }
    while (aces > 0 && sum + 10 <= 21) {
      sum += 10;
      aces--;
    }
    return sum;
  }

  function fastCanPlace(cards, cardVal) {
    return calcFastSum(cards) + cardVal <= 21;
  }

  function evaluateFastColumn(sizes, values, colIdx) {
    const sum = calcFastSum(values[colIdx].slice(0, sizes[colIdx]));
    const size = sizes[colIdx];
    if (sum === 21) {
      sizes[colIdx] = 0;
      return size >= 4 ? 15 : 10;
    }
    if (size === 5) {
      sizes[colIdx] = 0;
      return 5;
    }
    return 0;
  }

  function simulateFastPlayout(startingCol, currentCardVal, pool, sizes, values) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    values[startingCol][sizes[startingCol]] = currentCardVal;
    sizes[startingCol]++;
    let score = evaluateFastColumn(sizes, values, startingCol);

    for (const cardVal of pool) {
      let bestMove = -1;
      let bestWeight = -Infinity;

      // Columns are visited in random order. Upstream used a fixed 0..4 scan with a
      // strict `>` comparison, so equal-weight moves always broke toward column 0.
      // That biased every rollout's fill order and showed up as a persistent ~10pt
      // EV spread between columns that were in fact identical.
      const order = [0, 1, 2, 3, 4];
      for (let s = order.length - 1; s > 0; s--) {
        const t = Math.floor(Math.random() * (s + 1));
        const tv = order[s]; order[s] = order[t]; order[t] = tv;
      }
      for (const col of order) {
        const colCards = values[col].slice(0, sizes[col]);
        if (!fastCanPlace(colCards, cardVal)) continue;

        const currentSum = calcFastSum(colCards);
        const nextSum = currentSum + cardVal;
        const currentSize = sizes[col];
        let moveWeight = 0;

        if (nextSum === 11) moveWeight += 260;
        if (cardVal === 10 && (currentSum === 11 || (currentSize === 1 && values[col][0] === 1))) moveWeight += 350;
        if (cardVal === 10 && currentSum === 10) moveWeight -= 120;
        if (currentSum === 11 && cardVal !== 10) moveWeight -= 100;
        if (nextSum === 21) moveWeight += 150;
        if (currentSize + 1 === 5) moveWeight += 60;
        if (nextSum >= 12 && nextSum <= 16) moveWeight -= 40;

        if (moveWeight > bestWeight) {
          bestWeight = moveWeight;
          bestMove = col;
        }
      }

      if (bestMove === -1) break;

      values[bestMove][sizes[bestMove]] = cardVal;
      sizes[bestMove]++;
      score += evaluateFastColumn(sizes, values, bestMove);
    }

    return score;
  }

  /** Returns { mean, se } -- se is the standard error of the mean, used to
   *  decide whether two columns are actually distinguishable. */
  function simulateAverageScore(chosenCol, drawnValue, masterPool, baseSizes, baseValues) {
    let total = 0;
    let totalSq = 0;
    for (let rollout = 0; rollout < ROLLOUTS; rollout++) {
      const pool = masterPool.slice();
      const sizes = baseSizes.slice();
      const values = baseValues.map((col) => col.slice());
      const score = simulateFastPlayout(chosenCol, drawnValue, pool, sizes, values);
      total += score;
      totalSq += score * score;
    }
    const mean = total / ROLLOUTS;
    const variance = Math.max(0, totalSq / ROLLOUTS - mean * mean);
    return { mean, se: Math.sqrt(variance / ROLLOUTS) };
  }

  function buildMasterPool(columns, drawnMath) {
    const counts = new Array(11).fill(4);
    counts[10] = 16;

    for (const col of columns) {
      for (const card of col) {
        counts[card.math]--;
      }
    }
    counts[drawnMath]--;

    const pool = [];
    for (let v = 1; v <= 10; v++) {
      const n = Math.max(0, counts[v]);
      for (let i = 0; i < n; i++) pool.push(v);
    }
    return pool;
  }

  /**
   * Exact points scored immediately by placing `cardVal` into this column.
   * Pure arithmetic, no simulation -- this number has no error bar.
   */
  function immediatePoints(colCards, cardVal) {
    const after = colCards.concat([cardVal]);
    const sum = calcFastSum(after);
    if (sum === 21) return after.length >= 4 ? 15 : 10;
    if (after.length === 5) return 5;
    return 0;
  }

  /**
   * Ranks every column for the drawn card.
   * Returns [{ col (1-based), legal, mean, se, now, sum }] in board order,
   * where `now` is exact immediate points and `mean`/`se` are the simulated
   * expected final score and its standard error.
   */
  function rankColumns(drawnCard, columns) {
    const masterPool = buildMasterPool(columns, drawnCard.math);
    const baseSizes = columns.map((col) => col.length);
    const baseValues = columns.map((col) => {
      const arr = new Array(6).fill(0);
      col.forEach((c, i) => (arr[i] = c.math));
      return arr;
    });

    const results = [];
    for (let i = 0; i < 5; i++) {
      const colCards = baseValues[i].slice(0, baseSizes[i]);
      const sum = calcFastSum(colCards);

      if (!fastCanPlace(colCards, drawnCard.math)) {
        results.push({ col: i + 1, legal: false, mean: null, se: null, now: null, sum });
        continue;
      }
      const { mean, se } = simulateAverageScore(i, drawnCard.math, masterPool, baseSizes, baseValues);
      results.push({
        col: i + 1,
        legal: true,
        mean,
        se,
        now: immediatePoints(colCards, drawnCard.math),
        sum,
      });
    }
    return results;
  }

  /**
   * Picks a recommendation honestly.
   *
   * The simulated EVs for different columns are usually within noise of each
   * other, so "highest mean" alone is not a real signal. We take the set of
   * columns statistically tied with the leader (within `tieSigmas` combined
   * standard errors) and break that tie on exact immediate points, which carry
   * no error at all. `contested` reports whether the EV ranking was decisive.
   */
  function recommend(ranked) {
    const legal = ranked.filter((r) => r.legal);
    if (legal.length === 0) return { col: -1, contested: false, tied: [] };

    const leader = legal.reduce((a, b) => (b.mean > a.mean ? b : a));
    const tied = legal.filter((r) => {
      const combinedSe = Math.sqrt(r.se * r.se + leader.se * leader.se) || 0;
      return leader.mean - r.mean <= CONFIG.tieSigmas * combinedSe;
    });

    const pick = tied.reduce((a, b) => {
      if (b.now !== a.now) return b.now > a.now ? b : a;
      return b.mean > a.mean ? b : a;
    });

    return { col: pick.col, contested: tied.length > 1, tied };
  }

  // ======================================================================
  // BOARD READING -- read-only DOM queries.
  // ======================================================================

  const SELECTORS = {
    mainGameWrapper: ".contentModule .frame > div[style='padding:7px;']",
    drawnCardImage:
      "center > table > tbody > tr > td:first-child > table:nth-of-type(3) > tbody > tr > td:nth-child(2) > img",
    colPlayLinks: (colIndex) =>
      `center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td:nth-child(${colIndex}) > a`,
    cardColumnCell: (colIndex) =>
      `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex})`,
  };

  const getElement = (selector, context = document) => {
    try { return context.querySelector(selector); } catch { return null; }
  };

  function parseCardFromSrc(src) {
    const filename = src.substring(src.lastIndexOf("/") + 1, src.lastIndexOf(".gif"));
    const parts = filename.split("_");
    if (parts.length < 2) return null;

    const rawToken = parts[0].toLowerCase();
    const suitToken = parts[1].toLowerCase();

    let raw = 0;
    if (rawToken === "ace") raw = 14;
    else raw = parseInt(rawToken, 10);
    if (Number.isNaN(raw)) return null;

    const rank =
      rawToken === "ace"   ? "Ace"
      : rawToken === "jack"  ? "Jack"
      : rawToken === "queen" ? "Queen"
      : rawToken === "king"  ? "King"
      : rawToken;

    const math = raw === 14 ? 1 : raw >= 11 ? 10 : raw;
    return { raw, math, rank, suit: suitToken, src };
  }

  function getDrawnCardData(gameArea) {
    const cardImg = getElement(SELECTORS.drawnCardImage, gameArea);
    if (!cardImg) return null;
    return parseCardFromSrc(cardImg.getAttribute("src"));
  }

  function collectBoardState(gameArea) {
    const board = [];
    for (let col = 1; col <= 5; col++) {
      const cell = getElement(SELECTORS.cardColumnCell(col), gameArea);
      if (!cell) { board.push([]); continue; }
      const cards = Array.from(cell.querySelectorAll("img"))
        .map((img) => parseCardFromSrc(img.getAttribute("src")))
        .filter(Boolean);
      board.push(cards);
    }
    return board;
  }

  // ======================================================================
  // DISPLAY
  // Styles the real game's own arrow cells in place, rather than using
  // absolutely-positioned overlays with hardcoded pixel offsets. Nothing is
  // drawn over the links, so your clicks always land on the game's controls.
  // ======================================================================

  function markColumns(gameArea, ranked, bestCol) {
    ranked.forEach((r) => {
      const link = getElement(SELECTORS.colPlayLinks(r.col), gameArea);
      if (!link) return;
      const cell = link.parentElement;
      if (!cell) return;

      const color = !r.legal
        ? CONFIG.illegalColor
        : r.col === bestCol
          ? CONFIG.bestColor
          : CONFIG.runnerUpColor;

      cell.style.outline = `${CONFIG.outlineWidth} solid ${color}`;
      cell.style.outlineOffset = "-2px";

      const tag = document.createElement("div");
      tag.className = "scarab21-advisor-tag";
      tag.style.cssText =
        `font: bold 11px/1.3 Verdana, sans-serif;` +
        ` color: ${color}; text-align: center; margin-top: 2px;`;

      if (!r.legal) {
        tag.textContent = "bust";
      } else {
        const bits = [];
        if (r.now > 0) bits.push(`+${r.now} now`);
        bits.push(`~${r.mean.toFixed(0)}`);
        if (r.col === bestCol) bits.push("\u2605");
        tag.textContent = bits.join(" ");
      }
      cell.appendChild(tag);
    });
  }

  function renderPanel(gameArea, card, ranked, rec) {
    const legal = ranked.filter((r) => r.legal).sort((a, b) => b.mean - a.mean);

    const panel = document.createElement("div");
    panel.id = "scarab21-advisor-panel";
    panel.style.cssText =
      `margin: 10px auto; padding: 10px 14px; max-width: 540px;` +
      ` border: 2px solid ${CONFIG.bestColor}; border-radius: 6px;` +
      ` background: #f6fff6; font: 12px/1.5 Verdana, sans-serif; color: #222;`;

    const add = (text, css) => {
      const d = document.createElement("div");
      if (css) d.style.cssText = css;
      d.textContent = text;
      panel.appendChild(d);
      return d;
    };

    add(
      `Advisor \u2014 drawn: ${card.rank} of ${card.suit} (counts as ${card.math})`,
      "font-weight: bold; margin-bottom: 4px;"
    );

    if (rec.col === -1) {
      add("No legal column \u2014 every column would bust.",
          `color: ${CONFIG.illegalColor}; font-weight: bold;`);
    } else {
      const best = legal.find((r) => r.col === rec.col);
      add(
        `Recommended: column ${rec.col}` +
          (best.now > 0 ? ` \u2014 scores ${best.now} points immediately` : ""),
        "font-weight: bold;"
      );

      if (rec.contested) {
        const names = rec.tied.map((r) => r.col).join(", ");
        add(
          `Columns ${names} are within simulation noise of each other, so the ` +
            `expected-score ranking cannot separate them. Picked on exact ` +
            `immediate points instead.`,
          "margin-top: 4px; color: #8a6d00;"
        );
      } else {
        add("The expected-score gap here is larger than the simulation noise.",
            "margin-top: 4px; color: #555;");
      }
    }

    const rows = ranked
      .map((r) => {
        if (!r.legal) return `col ${r.col}: bust (at ${r.sum})`;
        const ci = (CONFIG.tieSigmas * r.se).toFixed(1);
        return `col ${r.col}: ${r.mean.toFixed(1)} \u00b1${ci}` +
               (r.now > 0 ? ` (+${r.now} now)` : "") +
               ` (at ${r.sum})`;
      })
      .join("\n");
    add(rows, "margin-top: 6px; color: #333; white-space: pre; font-family: monospace;");

    add(
      `${ROLLOUTS} rollouts/column. \u00b1 is ${CONFIG.tieSigmas} standard errors. ` +
        `Advisory only \u2014 click the column arrow yourself.`,
      "margin-top: 6px; font-size: 11px; color: #777;"
    );

    gameArea.parentElement
      ? gameArea.parentElement.insertBefore(panel, gameArea)
      : gameArea.prepend(panel);
  }

  function renderError(gameArea, message) {
    const panel = document.createElement("div");
    panel.id = "scarab21-advisor-panel";
    panel.style.cssText =
      `margin: 10px auto; padding: 8px 12px; max-width: 460px;` +
      ` border: 2px solid ${CONFIG.illegalColor}; border-radius: 6px;` +
      ` background: #fff6f6; font: 12px/1.5 Verdana, sans-serif; color: #222;`;
    panel.textContent = `Advisor: ${message}`;
    (gameArea && gameArea.parentElement ? gameArea.parentElement : document.body).prepend(panel);
  }

  // ======================================================================
  // ENTRY POINT -- runs once, synchronously, on page load. No loop, no timer,
  // no navigation, no clicks.
  // ======================================================================

  function run() {
    if (document.getElementById("scarab21-advisor-panel")) return; // already evaluated

    const gameArea = getElement(SELECTORS.mainGameWrapper);
    if (!gameArea) return; // not an active game board; stay silent

    const card = getDrawnCardData(gameArea);
    if (!card) return; // between hands, or game over screen

    let ranked, rec;
    try {
      ranked = rankColumns(card, collectBoardState(gameArea));
      rec = recommend(ranked);
    } catch (err) {
      console.error("Scarab21 Advisor:", err);
      renderError(gameArea, "could not evaluate this board (page layout may have changed).");
      return;
    }

    markColumns(gameArea, ranked, rec.col);
    renderPanel(gameArea, card, ranked, rec);
  }

  run();
})();

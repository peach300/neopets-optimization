// ==UserScript==
// @name         # Neopets Meridell Classic Theme
// @namespace    local-advisor-fork
// @version      1.1
// @description  Serves the retired "Meridell" classic site theme (047_meridel_july2018) in place of "Neopets Yellow" (014_yel_d187b) on the classic site layout. Appearance only; nothing is unlocked on the account.
// @author       Austin Ryder
// @match        http*://www.neopets.com/*
// @match        http*://neopets.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Meridell%20Classic%20Theme.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Meridell%20Classic%20Theme.user.js
// ==/UserScript==
//
// WHAT THIS DOES
//
// Meridell was a classic-layout theme handed out in July 2018 to anyone who
// signed up for Dragoyle Hunting, and retired afterwards. Unlike the Haunted
// Woods restyle in this folder, nothing here has to be imitated: every file
// the theme was made of is still sitting on images.neopets.com, unlisted but
// served. So this script does not paint a lookalike. It points the page at the
// real theme.
//
// A classic-layout page dresses itself from exactly two places:
//
//   1. One stylesheet, //images.neopets.com/css/themes/<folder>.css, which
//      carries every colour in the layout - the #header and #footer bands,
//      the #main column's two side borders, .sidebarHeader,
//      .contentModuleHeaderAlt, ul.dropdown, the games-room modules, the
//      marquee slots.
//   2. Images under //images.neopets.com/themes/<folder>/, referenced partly
//      by that stylesheet (header_bg.png, banner_bg.png, footer_bg.png) and
//      partly hard-coded into the page's own HTML: navigation/*.png for the
//      nav buttons and the footer's legal links, and rotations/N.png for the
//      character that stands in the footer's corner.
//
// Both places key off one folder name, so swapping the theme is one textual
// substitution - 014_yel_d187b becomes 047_meridel_july2018 - applied to the
// stylesheet link, to every <img src>, to inline style attributes, and to the
// text of inline <style> blocks. That is the whole trick. The result is byte
// for byte the theme Neopets shipped: Meridell's green (#1d774f) column edges
// and sidebar headers, its #FFD026 bands, the blue (#2367B5) content module
// headers, #FFB300 link hover, and its own artwork in the header, banner and
// footer.
//
// THE TWO PLACES THE SUBSTITUTION IS NOT QUITE ENOUGH
//
//  1. Rotations. The yellow theme ships twelve footer characters, Meridell
//     ships seven, and the page picks its number server-side - a page served
//     with rotations/9.png would 404. Numbers are folded into the range that
//     exists (modulo ROTATIONS), and any rotation image that still fails to
//     load falls back to rotations/1.png, so a theme with a different count
//     needs no edit here.
//  2. Timing. The stylesheet <link> has to be caught as the parser emits it,
//     before the browser finishes fetching the yellow sheet, or the page
//     flashes yellow first. Hence @run-at document-start and a
//     MutationObserver armed before <head> exists, rather than anything that
//     waits for DOMContentLoaded. The observer stays attached for the whole
//     page because parts of the layout - the premium footer bar, popups - are
//     appended later by the site's own scripts.
//
// WHAT IT DOES NOT DO
//
// This is cosmetic and local. It does not grant the theme on the account, it
// does not touch /preferences.phtml, and it sends nothing anywhere: every URL
// it produces is a public image or stylesheet on images.neopets.com that the
// page was going to fetch from the same host anyway. Switch your account
// theme back off Neopets Yellow and this script has nothing to match, by
// design - it keys off the yellow theme and leaves every other theme alone.
//
// USING A DIFFERENT RETIRED THEME
//
// Change TARGET to any other retired folder name and it works the same way.
// The ones still being served, from Jellyneo's retired-themes list:
//
//     050_tis_the_season_atfg   Tis the Season
//     051_dd2019                Daily Dare 2019
//     049_thelostheirloom_nov2018  The Lost Heirloom
//     048_brightvale_aug2018    Brightvale
//     047_meridel_july2018      Meridell            <- this one
//     046_ff_sep2017            Destroyed Faerie Festival
//     038_hab_ig53k             Habitarium
//     037_hmh_f7k8s             Monster Hunting
//     036_ddc_je4z0             Daily Dare: Chadley
//     035_tmo_we6g3             Tyrannia: Mysterious Obelisk
//     028_kri_306cb             Krawk Island
//     027_tkg_69097             Treasure Keepers
//     026_fon_f2c70             Festival of Neggs
//     025_tfr_5ce03             The Faeries' Ruin
//     024_aota_3db1f            Atlas of the Ancients
//     023_dyd_c470b             Daily Dare
//     021_cpa_5ce03             Puzzle Adventure
//     020_ppl_3c22d             Petpet Protection League
//     019_sloth1_7f914          The Return of Dr. Sloth
//     013_tow_4b54b             Tale of Woe
//     012_tcg_d977a             Cyodrake's Gaze
//     009_qas_93707             Qasalan
//     008_com_e529a             Curse of Maraqua
//
// SOURCE sets which theme is replaced, and defaults to Neopets Yellow. Any
// classic theme folder works there too, so a theme you do own can be the one
// that gets swapped out instead.

(function () {
	'use strict';

	/* ---- Settings ------------------------------------------------------- */

	// The theme being replaced, and the theme replacing it. Both are folder
	// names as they appear in //images.neopets.com/themes/<folder>/.
	const SOURCE = '014_yel_d187b';          // Neopets Yellow
	const TARGET = '047_meridel_july2018';   // Meridell

	// How many footer characters TARGET ships. Only an upper bound matters:
	// too low wastes some of them, too high is caught by the load fallback.
	const ROTATIONS = 7;

	/* ---- The substitution ----------------------------------------------- */

	// Every URL in the page that names SOURCE, rewritten to name TARGET. The
	// string appears in protocol-relative URLs (//images.neopets.com/...),
	// absolute https ones, and inside url() in CSS text, and a plain split and
	// join covers all three without caring which. Returns null for anything
	// that does not mention SOURCE, which is what every caller tests on, so a
	// URL is only ever touched when it is genuinely a SOURCE theme asset.
	function retheme(url) {
		if (typeof url !== 'string' || url.indexOf(SOURCE) === -1) return null;

		let out = url.split(SOURCE).join(TARGET);

		// Fold the footer character into the range TARGET actually has. The
		// page's own number is server-side and goes as high as 12.
		out = out.replace(/\/rotations\/(\d+)\.png/g, function (whole, n) {
			const i = parseInt(n, 10);
			if (!isFinite(i) || i < 1) return whole;
			return '/rotations/' + (((i - 1) % ROTATIONS) + 1) + '.png';
		});

		return out;
	}

	/* ---- Applying it to one element ------------------------------------- */

	// Marked so that a node the observer sees more than once - and the
	// DOMContentLoaded and load sweeps will re-see most of the page - is only
	// measured once rather than re-read and re-written.
	const DONE = 'data-meridell-done';

	function patch(el) {
		if (!el || el.nodeType !== 1 || el.hasAttribute(DONE)) return;

		const tag = el.tagName;

		// The stylesheet. This is the one that matters: it carries every
		// colour in the layout, and it is the one node that has to be caught
		// while the page is still parsing.
		if (tag === 'LINK') {
			// getAttribute, not .href: the attribute is protocol-relative
			// and the property would have resolved it already. Either form
			// contains SOURCE, but keeping the attribute's own text means
			// the ?v= query the site appends survives untouched.
			const next = retheme(el.getAttribute('href'));
			if (next !== null) el.setAttribute('href', next);
		}

		// The nav buttons, the footer's legal links and divider, the footer
		// character. These are hard-coded in the page's HTML with their
		// width and height spelled out; Meridell's are pixel-for-pixel the
		// same size as the yellow theme's, every one of them, so the
		// attributes stay correct and nothing needs resizing.
		else if (tag === 'IMG') {
			const next = retheme(el.getAttribute('src'));
			if (next !== null) {
				// A rotation number TARGET does not have, or any other
				// missing file, falls back rather than showing a broken
				// image. Guarded so the fallback cannot loop on itself.
				if (/\/rotations\/\d+\.png/.test(next)) {
					el.addEventListener('error', function onMissing() {
						el.removeEventListener('error', onMissing);
						el.src = next.replace(/\/rotations\/\d+\.png/,
							'/rotations/1.png');
					});
				}
				el.setAttribute('src', next);
			}
		}

		// Inline <style> blocks. The site writes several per page, and some
		// name theme images directly.
		else if (tag === 'STYLE') {
			const next = retheme(el.textContent);
			if (next !== null) el.textContent = next;
		}

		// A style="" attribute anywhere, for the same reason.
		const inline = retheme(el.getAttribute('style'));
		if (inline !== null) el.setAttribute('style', inline);

		el.setAttribute(DONE, '1');
	}

	// patch() on an element and everything under it. The observer hands over
	// subtree roots, not individual elements, whenever the site appends a
	// block of markup at once.
	function patchTree(root) {
		if (!root || root.nodeType !== 1) return;
		patch(root);
		const kids = root.querySelectorAll('link, img, style, [style]');
		for (let i = 0; i < kids.length; i++) patch(kids[i]);
	}

	/* ---- When ----------------------------------------------------------- */

	// Armed before <head> exists, so the stylesheet <link> is rewritten in
	// the same turn the parser emits it. The browser may already have started
	// fetching the yellow sheet by then; changing href discards it, and in
	// practice the swap lands before either sheet has arrived, so the page
	// does not flash yellow.
	new MutationObserver(function (records) {
		for (let i = 0; i < records.length; i++) {
			const added = records[i].addedNodes;
			for (let j = 0; j < added.length; j++) patchTree(added[j]);
		}
	}).observe(document.documentElement || document, {
		childList: true,
		subtree: true
	});

	// Anything the parser got out before the observer was attached, plus two
	// sweeps for the parts of the layout the site's own scripts append later:
	// the premium footer bar, the shop wizard pane, the popups.
	patchTree(document.documentElement);
	document.addEventListener('DOMContentLoaded', function () {
		patchTree(document.documentElement);
	});
	window.addEventListener('load', function () {
		patchTree(document.documentElement);
	});
})();

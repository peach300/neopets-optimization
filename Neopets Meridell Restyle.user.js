// ==UserScript==
// @name         # Neopets Meridell Restyle
// @namespace    local-advisor-fork
// @version      2.3
// @description  Cosmetic restyle of the H5 Meridell site theme: the tiled dungeon wallpaper is replaced with the homepage's own field and castle scene, and the footer is hidden. Appearance only.
// @author       Austin Ryder
// @match        http*://www.neopets.com/*
// @match        http*://neopets.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Meridell%20Restyle.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Meridell%20Restyle.user.js
// ==/UserScript==
//
// WHAT THIS DOES
//
//  1. Replaces the page background on every page but the homepage. The theme
//     gives those pages bg-pattern.png, a 200x200 dungeon wall with a torch
//     in it. What goes there instead is the theme's own homepage scene: the
//     cloud band, the castle gate with its banners and bushes, and the dirt
//     field below it.
//
//     It is built the way the homepage builds it - the same three images, at
//     the same sizes, tiled the same way:
//       - hp-bg-top.png across the top, repeated sideways, drawn as tall as
//         a quarter of the window, exactly as .hp-bg-top__2020 does;
//       - hp-bg-mid.png, the gate, in a 450px band, repeated sideways. The
//         theme draws this image at 450px tall too, which makes it 771px
//         wide, so on any normal window it appears two or three times over.
//         That repeat is the theme's own look, and it is also why the art
//         stays sharp: 450px is well under the image's native 700px, so it
//         is only ever downscaled;
//       - hp-bg-bottom.png below that, on its 500px tile, filling the rest.
//
//     The whole thing is fixed to the viewport, so it does not scroll or
//     restart partway down a long page.
//
//  2. Puts the homepage on that same scene. The homepage already has this
//     art, but in bands sized off the page rather than the window. Those
//     three bands are blanked and the fixed scene shows through the
//     (otherwise untouched) .hp-bg-grid__2020 wrapper instead, so the
//     homepage and every other page now draw the identical picture.
//
//  3. Hides the footer.
//
// Appearance only: this injects one style element and touches nothing else.
// No DOM is rewritten, no behaviour changes, and the only network traffic is
// three theme images, from images.neopets.com.

(function () {
	'use strict';

	// Meridell's own art.
	const IMG = 'https://images.neopets.com/themes/h5/meridell/images';

	const css = `
html:has(#siteTheme[href*="meridell"]) {

	/* The geometry the theme itself uses for the homepage bands, restated
	   here as lengths against the window instead of against the page.

	   --mer-sky is .hp-bg-top__2020's height (25% of the scene) and also the
	   height its image is drawn at. The gate band is 450px tall and starts
	   250px above the bottom of the sky, which is .hp-bg-mid__2020's
	   margin-top: -250px. The ground then starts where that band ends.

	   Everything hangs off --mer-nav, the height of the fixed site header,
	   because the header is painted over the top of the window and anything
	   under it is simply not seen: without this the gate band began about
	   10px down the window and the tops of the arch and the banner were cut
	   off along the header's bottom edge. The theme does the same thing on
	   the homepage - .hp-bg-grid__2020 carries margin-top: 65px there, 50px
	   below 825px - and these are those numbers plus a few pixels, since the
	   measured header is nearer 68px than 65px.

	   max() is what keeps the fix honest on a short window: once 25vh drops
	   under 250px the arithmetic would put the band above the header again,
	   and this pins it to just below instead. */
	--mer-nav:  70px;
	--mer-sky:  25vh;
	--mer-gate: max(var(--mer-nav), calc(var(--mer-nav) + var(--mer-sky) - 250px));
	--mer-dirt: calc(var(--mer-gate) + 450px);

	/* The site drops to a shorter header below 825px, the same breakpoint
	   the theme switches .hp-bg-grid__2020's own margin on. */
	@media screen and (max-width: 824px) {
		--mer-nav: 54px;
	}

	/* ---- The page background ------------------------------------------- */

	/* The cloud band and the gate, both fixed, both tiled sideways.

	   The colour underneath is #CCCEC1, the colour of hp-bg-top.png's own
	   bottom row, and it has to be exactly that: the cloud band stops where
	   the image stops, and the gate above it has transparent sky around the
	   banners, so whatever is behind shows through there. Any other value
	   draws a hard horizontal line across the picture at that height - it
	   was the pale #E8E9E2 from the top of the image before, a visibly
	   lighter band starting mid-banner. Matching the bottom row instead
	   lets the sky simply carry on down to the horizon. */
	& body {
		background-color: #CCCEC1;
		background-image:
			url(${IMG}/hp-bg-mid.png?v=2),
			url(${IMG}/hp-bg-top.png);
		background-position:
			center var(--mer-gate),
			center top;
		background-size:
			auto 450px,
			auto var(--mer-sky);
		background-repeat: repeat-x, repeat-x;
		background-attachment: fixed, fixed;
	}

	/* The ground. It has to be its own layer rather than a third background
	   image, because this one tiles in both directions: as a background it
	   would repeat upward over the sky as well, and a background layer
	   cannot be clipped to start partway down. A fixed box can.

	   z-index -1 puts it above the body background (which the browser
	   propagates to the canvas) and below every element on the page. That
	   is the theme's own order too - .hp-bg-bottom__2020 is z-index 4, over
	   the gate's 3 - so the dirt covers the bottom edge of the gate the way
	   it does on the homepage. */
	& body::before {
		content: "";
		position: fixed;
		left: 0;
		right: 0;
		top: var(--mer-dirt);
		bottom: 0;
		z-index: -1;
		pointer-events: none;
		background-image: url(${IMG}/hp-bg-bottom.png);
		background-size: 500px 500px;
		background-position: center top;
		background-repeat: repeat;
	}

	/* The column is white and the page behind it is now a picture rather
	   than a flat wall, so it needs lifting off it.

	   Homepage excluded, and it is the only rule that excludes it:
	   homepage.css clears the column there (background:none) so the scene
	   can show through its full 1700px width, and a shadow cast by that
	   invisible box is a grey halo across the middle of the picture.
	   .hp-bg-grid__2020 is the homepage's scene wrapper, so its absence is
	   the test for every other page. */
	& body:not(:has(.hp-bg-grid__2020)) .container.theme-bg,
	& body:not(:has(.hp-bg-grid__2020)) #container__2020.container {
		box-shadow: 0 0 36px rgba(60, 54, 40, 0.38);
	}

	/* ---- The homepage's own bands --------------------------------------- */
	/* Blanked, so the fixed scene above shows through the wrapper they live
	   in and the homepage draws the same picture as everything else. Their
	   own copy is sized off the page rather than the window, so on a long
	   homepage it slides away as you scroll.

	   The elements themselves are left in place rather than hidden: they are
	   what gives .hp-bg-grid__2020 its height, and anything the site drops
	   into that wrapper for an event sits beside them. */
	& .hp-bg-top__2020,
	& .hp-bg-mid__2020,
	& .hp-bg-bottom__2020 {
		background-image: none;
	}

	/* ---- The footer ----------------------------------------------------- */
	/* Hidden. It was a flat #A1A1C5 slab carrying the copyright line, three
	   legal links and two NPCs, sitting across the bottom of the scene.

	   This hides the Terms of Use, Privacy Policy and Support links with it.
	   They are still at /terms.phtml, /privacy.phtml and support.neopets.com,
	   and deleting this one rule brings the footer back exactly as the site
	   draws it. */
	& .footer__2020 {
		display: none;
	}
}
`;

	const style = document.createElement('style');
	style.id = 'mer-restyle';
	style.textContent = css;
	(document.head || document.documentElement).appendChild(style);
})();

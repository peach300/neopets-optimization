// ==UserScript==
// @name         # Neopets Haunted Woods Restyle
// @namespace    local-advisor-fork
// @version      2.3
// @description  Cosmetic restyle of the H5 ("beta") Haunted Woods site theme, pulled back toward the old 003_hws_9bde9 theme: its slate-navy and teal palette, its own artwork, and no tiled wallpaper. Appearance only.
// @author       Austin Ryder
// @match        http*://www.neopets.com/*
// @match        http*://neopets.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Haunted%20Woods%20Restyle.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Haunted%20Woods%20Restyle.user.js
// ==/UserScript==
//
// WHAT THIS DOES
//
// The H5 Haunted Woods theme dresses every non-homepage page in
// hauntedwoods/images/bg-pattern.svg, a 200x200 bat tile, and repeats three
// more small patterns in the header, the footer and every popup. At 200px the
// bat tile reads as wallpaper, not as a place. The old theme never did that:
// it was a flat grey page with slate-navy bands top and bottom, teal links,
// and a white column with plain grey edges, and it let the art in those two
// bands and on the page itself carry the mood.
//
// So this does three things:
//
//  1. Takes the old theme's palette, exactly. Every colour below is lifted
//     from 003_hws_9bde9.css: #2B3447 for the bands, #20283E and #5D709B for
//     the deeper and lighter slate, #4B9292 for links, #B9DBDB for pale teal,
//     #747474 for the column's edges. The H5 purple (#7458b1) is gone from
//     the links, the nav bands, the nav menus and tabs, and the Neoboards,
//     and the artwork that is still purple is rotated toward slate to match.
//     The Neoboard rules below copy the theme's own selector lists verbatim,
//     because every colour there is set !important and a looser selector
//     would catch text the theme never coloured.
//  2. Draws the old theme's nav band rather than reusing its image. That
//     theme has only three images, all 1000px wide, and all small by the
//     standards of a 1600px page:
//        banner_bg.png (1000x94)  - starfield, moon, gnarled tree.
//        footer_bg.png (1000x160) - grass fringe, mud, bones.
//        header_bg.png (1000x77)  - unusable: the old site's grey nav bar is
//                                   painted across the middle of it.
//     No larger version of any of them exists on images.neopets.com; they
//     were checked. Each was tried and each ran out of pixels: footer_bg.png
//     as the page's ground band had to be drawn at 200% of the viewport to
//     crop the Neopets logo out of its corner, a 3.2x upscale; banner_bg.png
//     across the nav was 1.6x. So the nav band is now a starfield built out
//     of radial-gradients, which has no resolution to run out of, and the
//     ground band uses hp-bg-mid.png (1200x600), the largest piece of
//     artwork in either theme, at about 1.3x, with the slate filter keeping
//     it in the old theme's colours. What carries the old theme here is its
//     palette, not its pixels.
//  3. Throws the 200x200 bat wallpaper away. What replaces it is the one
//     setting in this file, PAGE, at the top of the code below:
//        'flat'  the old theme's page, exactly: flat #999999 grey, nothing
//                behind the column at all. All of that theme's artwork was
//                in its two bands, and the bands are still here.
//        'night' a fixed, non-repeating scene instead: a ground band along
//                the bottom, the moon, and a night gradient between them.
//                The ground band is masked, not faded over,
//                so its top edge genuinely dissolves rather than being
//                veiled where it cuts. Not something the old theme had.
//
// The content column stays white, as it is on the old theme and on the rest
// of Neopets, which is full of old GIFs flattened onto white that show as
// pale rectangles on anything tinted. It gets the old theme's 2px #747474
// side borders, from its #main rule.
//
// Every rule is scoped to html:has(#siteTheme[href*="hauntedwoods"]), the
// theme <link> the page itself emits, so the style does nothing at all when
// another site theme is selected, and nothing on the legacy (non-H5) pages,
// which have no such link and are already the real thing. That guard uses
// :has() and CSS nesting; both are available in current Chrome, Firefox and
// Safari, as are the masks.
//
// It injects a <style> element and nothing else. No network calls beyond the
// images (all from images.neopets.com), no DOM rewriting, no page behaviour.

(function () {
	'use strict';

	// THE ONE SETTING
	//
	// What goes behind the content column.
	//
	//   'flat'  the old theme's page, exactly: flat #999999 grey, no scene,
	//           no fog, no shadow under the column. The old theme put all
	//           of its artwork in the header and footer bands and left the
	//           page itself alone, and those bands are still here.
	//   'night' a fixed moonlit scene built from the old theme's ground art
	//           and the H5 moon. Not something the old theme ever had.
	//
	// Everything else - the palette, the two bands, the links, the column's
	// grey edges, the Neoboards, the homepage - is the same either way.
	const PAGE = 'night';

	// H5 Haunted Woods art.
	const IMG = 'https://images.neopets.com/themes/h5/hauntedwoods/images';

	// The nav band's stars. The old theme's banner_bg.png used to be this
	// band, and at 1000x94 it could not be drawn across a wide page without
	// either upscaling or repeating. A gradient has no pixels in it, so this
	// is sharp at any width and the band never repeats.
	//
	// The field is random, but not a different random on every page load: a
	// seeded generator means the same sky every time, so moving between
	// pages does not reshuffle the stars. Change SEED for a different sky,
	// STAR_COUNT for a denser or a thinner one.
	const SEED = 0x9E3779B9;
	const STAR_COUNT = 84;

	// mulberry32, a small fast PRNG. Nothing here needs real randomness,
	// only a scatter that does not look hand-placed.
	const rng = ((seed) => () => {
		seed = (seed + 0x6D2B79F5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	})(SEED);

	const star = () => {
		const r = 0.7 + rng() * 1.3;
		// Brighter with size, plus some slop, so the field has depth rather
		// than reading as one layer of identical dots.
		const a = Math.min(0.95, 0.2 + (r - 0.7) * 0.46 + rng() * 0.24);
		const x = rng() * 100;
		const y = 8 + rng() * 84;
		return `radial-gradient(${r.toFixed(2)}px ${r.toFixed(2)}px at ${x.toFixed(2)}% ${y.toFixed(1)}%,`
			+ ` rgba(255, 255, 255, ${a.toFixed(2)}) 0%, rgba(255, 255, 255, 0) 100%)`;
	};

	// Three groups: one that stays put and two that fade on clocks of their
	// own. Splitting them is what makes the band twinkle instead of pulsing
	// all at once - a single element can only animate its layers together.
	const groups = [[], [], []];
	for (let i = 0; i < STAR_COUNT; i++) groups[i % 3].push(star());
	const [stillStars, twinkleA, twinkleB] = groups.map((g) => g.join(',\n\t\t\t'));

	/* ---- PAGE: flat -------------------------------------------------------
	   BODY { background-color: #999999 } is the whole of what the old theme
	   did to the page, and the whole of what this does. The ground band and
	   the fog belong to the night scene and are not declared at all here, so
	   there is nothing to switch off. */
	const flat = `
	& body {
		background: #999999;
	}
`;

	/* ---- PAGE: night ---------------------------------------------------- */
	const night = `
	/* Sky and moon only. The ground is a separate layer below, because a
	   background layer is clipped to its box: a gradient laid over its top
	   edge only veils the cut, it never removes it. A mask does. */
	& body {
		background-color: var(--hw-deep);
		background-image:
			url(${IMG}/hp-bg-moon.png),
			radial-gradient(75% 45% at 50% 100%, rgba(75, 146, 146, 0.22), transparent 70%),
			linear-gradient(180deg, #141a28 0%, #20283E 56%, #2B3447 100%);
		background-repeat: no-repeat, no-repeat, no-repeat;
		background-position: right 4vw top 86px, center, center;
		background-size: min(412px, 38vh) auto, cover, cover;
		background-attachment: fixed;
	}

	/* The ground. This used to be the old theme's footer_bg.png and is not
	   any more, for one reason: resolution. That image is 1000x160, and a
	   band across a 1600px viewport had to draw it at 200% to crop the
	   Neopets logo out of its corner, which is a 3.2x upscale of a small
	   image and looks it. hp-bg-mid.png is 1200x600, the largest piece of
	   artwork in either theme, and one copy spanning the viewport is about
	   1.3x. The slate filter is what keeps it in the old theme's palette, so
	   the band still reads as the old art even though it is not.

	   100% auto is one copy sized to the viewport, so there is no repeat at
	   all; the image is far wider than it is tall, so what shows in a band
	   this height is its bottom: ground, graves, bones.

	   Masked at the top, so the band fades up into the sky over most of its
	   height instead of ending on a horizontal cut. The fade runs a long
	   way, which is what makes it read as distance rather than as a vignette
	   laid on a rectangle.

	   z-index -1 puts it above the sky (which is the body background,
	   propagated to the canvas) and below every element on the page,
	   including the white content column at z-index 2. */
	& body::before {
		content: "";
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		height: min(440px, 48vh);
		z-index: -1;
		pointer-events: none;
		background: url(${IMG}/hp-bg-mid.png) center bottom / 100% auto no-repeat;
		filter: var(--hw-to-slate);
		-webkit-mask-image: linear-gradient(to bottom,
			transparent 0%,
			rgba(0, 0, 0, 0.12) 24%,
			rgba(0, 0, 0, 0.46) 48%,
			rgba(0, 0, 0, 0.84) 72%,
			#000 88%);
		mask-image: linear-gradient(to bottom,
			transparent 0%,
			rgba(0, 0, 0, 0.12) 24%,
			rgba(0, 0, 0, 0.46) 48%,
			rgba(0, 0, 0, 0.84) 72%,
			#000 88%);
	}

	/* A slow drift of fog over the scene, in the old theme's teal and slate.
	   Same negative layer as the ground and later in tree order, so it
	   settles over it. Never takes a click. */
	& body::after {
		content: "";
		position: fixed;
		inset: -10%;
		z-index: -1;
		pointer-events: none;
		background:
			radial-gradient(60% 40% at 20% 85%, rgba(185, 219, 219, 0.07), transparent 70%),
			radial-gradient(50% 35% at 78% 72%, rgba(93, 112, 155, 0.1), transparent 72%);
		animation: hw-drift 120s ease-in-out infinite alternate;
	}

	/* The column needs lifting off a dark page. On the flat grey one it does
	   not, and the old theme gave it nothing but its edges. */
	& body:not(:has(.hp-bg-grid__2020)) .container.theme-bg,
	& body:not(:has(.hp-bg-grid__2020)) #container__2020.container {
		box-shadow: 0 0 40px rgba(20, 26, 40, 0.55);
	}
`;

	const css = `
html:has(#siteTheme[href*="hauntedwoods"]) {

	/* Every one of these is from 003_hws_9bde9.css. */
	--hw-deep:    #141a28;  /* darker than anything in the old sheet, for the
	                           top of the sky; #20283E flattens out up there */
	--hw-navy:    #20283E;  /* contentModuleHeader */
	--hw-slate:   #2B3447;  /* header, footer */
	--hw-blue:    #5D709B;  /* contentModuleHeaderAlt, marqueeSlot */
	--hw-blue-dk: #4B5A7E;  /* marqueeSlotOn */
	--hw-teal:    #4B9292;  /* A:Link, sidebarHeader */
	--hw-teal-ink:#357777;  /* the same teal, darkened for text on white.
	                           #4B9292 is what the old theme used for links,
	                           but it only reaches 3.6:1 against the white
	                           content column - under the 4.5:1 that body
	                           text needs, and it reads as a washed-out blue.
	                           This is 5.2:1 and still the same hue. */
	--hw-teal-lt: #B9DBDB;  /* sidebarHeader links */
	--hw-hover:   #506596;  /* A:Hover */
	--hw-rule:    #747474;  /* the 2px edges on #main */

	/* The H5 artwork is purple (#7458b1); the old theme has no purple in it
	   at all. This is what every "pull the art toward slate" rule below
	   applies.

	   It is mostly desaturation on purpose. CSS hue-rotate is a matrix
	   approximation, not a real hue shift, and the rotation that should
	   land purple on the old theme's blue (-42deg) overshoots and comes out
	   green. Taking the colour out and nudging by a few degrees lands on
	   the moonlit blue-grey the old art is actually made of. */
	--hw-to-slate: saturate(0.42) brightness(0.92) hue-rotate(-10deg);

	/* ---- Page background ----------------------------------------------- */
${PAGE === 'flat' ? flat : night}
	/* The content column keeps the site's white and takes the old theme's
	   edges: #main there was 2px #747474 down each side, nothing more.

	   Homepage excluded. There, homepage.css clears the column
	   (#container__2020.container { background:none }) so the scene behind it
	   can show through the full 1700px width, and borders drawn round that
	   invisible 1700px box are two stray lines over the scene.
	   .hp-bg-grid__2020 is the homepage's scene wrapper, so its absence is
	   the test for every other page.

	   Note for future edits: this whole stylesheet is a JS template literal,
	   so no backticks in these comments. */
	& body:not(:has(.hp-bg-grid__2020)) {
		& .container.theme-bg,
		& #container__2020.container {
			border-left: 2px solid var(--hw-rule);
			border-right: 2px solid var(--hw-rule);
		}
	}

	/* ---- Links ---------------------------------------------------------- */
	/* The old theme's teal, in the content only. Nav and footer links sit
	   outside .container and keep the pale colours the H5 sheet gives them,
	   which already read as teal against slate.

	   The item pages - Inventory, Quick Stock, Closet, Safety Deposit Box -
	   put their section links in a coloured bar of their own: a #9f9786
	   warm grey with white text, set from a style block inside the page.
	   Teal on that grey is about 2:1. Those rules are plain class
	   selectors, so this one outranks them; the two menubar exclusions
	   below hand those links back to the page that drew the bar. */
	& .container a:not([class*="button"]):not([class*="btn"]):not([class*="menubar"] *, [class*="menulink"] *) {
		color: var(--hw-teal-ink);
	}
	& .container a:not([class*="button"]):not([class*="btn"]):not([class*="menubar"] *, [class*="menulink"] *):hover {
		color: var(--hw-hover);
	}

	/* ---- The item pages' section bar ------------------------------------ */
	/* Inventory / Quick Stock / Closet / Safety Deposit Box share one bar.
	   The page paints it #9f9786 warm grey with white links - about 2.9:1,
	   and the one warm colour left on a slate page. Slate and the old
	   theme's pale teal (what 003_hws_9bde9 gave .sidebarHeader links)
	   take that to roughly 10:1. The colours are set as a pair, so a page
	   whose bar has dark text of its own still comes out readable. */
	& [class*="menulink"] {
		background: var(--hw-slate);
	}
	& [class*="menulink"] a {
		color: var(--hw-teal-lt);
	}
	& [class*="menulink"] a:hover {
		color: #FFFFFF;
	}

	/* ---- The rest of the purple ----------------------------------------- */
	/* The nav menus, the tabs and the profile boxes. The dropdown tail is
	   not optional: the H5 sheet says in its own comment that it has to
	   match the navbar's bottom border, and that border is slate now. */
	& .dropdown-triangle-up__2020 {
		border-bottom-color: var(--hw-blue);
	}
	& .nav-dropdown__2020,
	& #alertstab__2020,
	& #newstab__2020,
	& #queststab__2020,
	& .tabActive__2020,
	& #navquestsdropdown__2023 {
		background-color: var(--hw-navy);
	}
	& .nav-profile-pet-box-lg__2020,
	& .nav-profile-pet-sm__2020,
	& .nav-pet-menu-icon__2020 {
		background-color: var(--hw-blue-dk);
	}

	/* The rest of the dropdowns. Setting the panels' background-color left
	   purple in every part of them the theme paints separately - a border
	   here, a separator there, a gradient, a hover. Each rule below names
	   the value it is replacing, so a theme update that moves one is easy
	   to spot. */

	/* #8160c4, the outline round the community, games and shop menus. */
	& .nav-dropdown__2020 {
		border-color: var(--hw-blue);
	}
	/* The profile menu is not flat at all: a gradient from rgb(75,63,113)
	   down to rgb(20,17,32). Same shape, in slate. */
	& .nav-profile-dropdown__2020 {
		background: linear-gradient(360deg, var(--hw-slate) 0%, var(--hw-deep) 64%);
	}
	/* The news and alerts panel behind the tabs, #382f54. */
	& #navnewsdropdown__2020 {
		background: var(--hw-navy);
	}
	/* The separators between rows, #382f54. */
	& .nav-dropdown__2020 ul li,
	& .nav-dropdown__2020.community-dropdown .neofriendsOnline,
	& .nav-profile-dropdown__2020 ul li,
	& .nav-profile-dropdown-clock__2020 {
		border-bottom-color: var(--hw-slate);
	}
	/* Row hover, #3714a7 - the loudest purple left anywhere on the page. */
	& .nav-dropdown__2020 ul li:hover,
	& .nav-profile-dropdown__2020 .profile-dropdown-subsection {
		background-color: var(--hw-blue-dk);
	}
	/* The news and alerts rows are white cards edged and shadowed in
	   #241d3a / rgba(36,29,58,1). */
	& #newstab__2020 ul li,
	& #alertstab__2020 ul li {
		border-color: var(--hw-deep);
		box-shadow: 0 3px 0 0 var(--hw-deep);
	}
	/* The shop menu's NP / NC tabs: #382f54 bar, #594695 active tab, and
	   #594695 again on the inactive tab's own label. */
	& .nav-dropdown__2020.shop-dropdown .shopdropdown-tabs {
		background-color: var(--hw-deep);
	}
	& .nav-dropdown__2020.shop-dropdown .shopdropdown-tab-active {
		background-color: var(--hw-blue-dk);
	}
	& .nav-dropdown__2020.shop-dropdown h3 {
		color: var(--hw-teal-lt);
	}
	/* Popup header and footer bands, #25233e. */
	& .popup-header__2020,
	& .popup-footer__2020 {
		background-color: var(--hw-navy);
	}

	/* The Neoboards are a sub-theme of their own, with every colour set
	   !important. These four selector lists are copied verbatim from
	   theme-hauntedwoods.css so that nothing is caught that the theme did
	   not already colour itself; only the colour values differ. */
	& #boardIndex h3,
	& #boardList ul .boardNavBottom .createTopicButton a, & #boardList ul .boardNavTop .createTopicButton a,
	& #boardCreateTopic h1,
	& #boardTopic .topicReplyContainer .topicReplySubmit, & #boardCreateTopic .topicCreateContainer .topicCreateSubmit,
	& #boardTopic ul .topicNavTop .replyTopicButton-top,
	& #boardList ul .pageNav .boardPageButton-active, & #boardTopic .pageNav .boardPageButton-active,
	& #boardList ul .pageNav .boardPageButton:hover, & #boardTopic .pageNav .boardPageButton:hover,
	& #boardTopic ul .topicReplyContainer .topicReplyTitle {
		background-color: var(--hw-navy) !important;
	}
	& #boardList ul .pageNav .boardPageButton:hover, & #boardTopic .pageNav .boardPageButton:hover {
		border-color: var(--hw-navy) !important;
	}
	& #boardIndex ul li h4, & #boardIndex ul li p a,
	& #boardList .breadcrumbs a, & #boardTopic .breadcrumbs a,
	& #boardList ul li .last a, & #boardList ul li .last-mobile a, & #boardList ul li .author-mobile a,
	& #boardList ul .pageNav .boardPageButton, & #boardTopic .pageNav .boardPageButton,
	& #boardTopic ul li .boardPostByline a,
	& #boardTopic ul .topicNavTop .topicCreator,
	& .neoboardPenTitle,
	& .boardPostMessage a,
	& #boardList ul li .boardTopicTitle,
	& #boardIndex ul li .premiumBoardButton a {
		color: var(--hw-teal-ink) !important;
	}
	& #boardList ul .boardNavBottom .createTopicButton a:hover, & #boardList ul .boardNavTop .createTopicButton a:hover,
	& #boardTopic .topicReplyContainer .topicReplySubmit:hover, & #boardCreateTopic .topicCreateContainer .topicCreateSubmit:hover,
	& #boardTopic ul .topicNavTop .replyTopicButton-top:hover {
		background-color: var(--hw-teal) !important;
	}
	& #boardIndex ul li h4:hover, & #boardIndex ul li p a:hover,
	& #boardList .breadcrumbs a:hover, & #boardTopic .breadcrumbs a:hover,
	& #boardList ul li .last a:hover, & #boardList ul li .last-mobile a:hover, & #boardList ul li .author-mobile a:hover,
	& #boardTopic ul li .boardPostByline a:hover,
	& #boardTopic ul .topicNavTop .topicCreator:hover,
	& .boardPostMessage a:hover,
	& #boardList ul li .boardTopicTitle:hover,
	& #boardIndex ul li .premiumBoardButton a:hover {
		color: var(--hw-hover) !important;
	}

	/* ---- Repeating patterns: keep them, demote them to texture ---------- */
	/* Lower opacity and a larger scale, so the seams stop being the first
	   thing you see, plus the rotation that takes them off purple. */
	& .nav-top-pattern__2020 {
		opacity: 0.26;
		background-size: auto 190%;
		filter: var(--hw-to-slate);
	}
	& .nav-bottom-pattern__2020 {
		opacity: 0.24;
		background-size: 420px 136px;
		filter: var(--hw-to-slate);
	}
	& .footer-pattern__2020 {
		opacity: 0.2;
		background-size: 170px 170px;
		filter: var(--hw-to-slate);
	}
	& .popup-header-pattern__2020,
	& .popup-footer-pattern__2020 {
		opacity: 0.28;
		background-size: 200px 108px;
		filter: var(--hw-to-slate);
	}

	/* ---- The two bands -------------------------------------------------- */
	/* The old theme's header and footer were both #2B3447 with one image on
	   top, and the nav band was banner_bg.png: starfield, a moon at one end,
	   a gnarled tree at the other. That image is 1000x94, there is no larger
	   copy of it on images.neopets.com, and a band across a 1600px page had
	   to upscale it 1.6x. This is the same band drawn instead of
	   photographed - the slate, a wash where the moon used to be, and the
	   stars from STARS above. It costs the tree and the moon themselves, and
	   buys a band that is sharp on any screen and at any width. */
	& .nav-top__2020 {
		background:
			${stillStars},
			radial-gradient(42% 130% at 85% 48%, rgba(185, 219, 219, 0.11), transparent 70%),
			linear-gradient(180deg, #1B2234 0%, var(--hw-slate) 100%);
		background-repeat: no-repeat;
		border-bottom: 3px solid var(--hw-blue);
		box-shadow: 0 3px 16px rgba(20, 26, 40, 0.55);
	}
	/* The two twinkling groups, on clocks that do not divide into each
	   other, so the band never settles into a visible beat.

	   z-index -1 holds them above the band's own background and below the
	   logo and the menu. It is safe here: .nav-top__2020 is fixed with a
	   z-index of its own, which makes it a stacking context, so a negative
	   child cannot fall out through the back of it. */
	& .nav-top__2020::before,
	& .nav-top__2020::after {
		content: "";
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
	}
	& .nav-top__2020::before {
		background: ${twinkleA};
		background-repeat: no-repeat;
		animation: hw-twinkle 5.5s ease-in-out infinite alternate;
	}
	& .nav-top__2020::after {
		background: ${twinkleB};
		background-repeat: no-repeat;
		animation: hw-twinkle 8.3s ease-in-out -3.1s infinite alternate;
	}
	/* The footer is hidden. It was a #728199 grey-blue slab - a colour that
	   belongs to no other part of either theme - carrying the copyright
	   line, three legal links and two NPCs, and on a page whose own ground
	   band is already drawn behind it there is nothing left for it to do.

	   This hides the Terms of Use, Privacy Policy and Support links with
	   it. They are still at /terms.phtml, /privacy.phtml and
	   support.neopets.com, and deleting this one rule brings the footer
	   back exactly as the site draws it. */
	& .footer__2020 {
		display: none;
	}

	/* ---- Homepage ------------------------------------------------------- */
	/* The homepage scene is H5 art and there is no old-theme equivalent to
	   swap in, so it is rotated to slate as a whole. The filter goes on the
	   wrapper, one pass over the finished scene, rather than on each band. */
	& .hp-bg-grid__2020 {
		filter: var(--hw-to-slate);
	}

	/* The stock grid stacks three bands that each paint to the edge of their
	   own box: sky (absolute), graveyard (25% tall, z-index 3), ground (the
	   rest). Nothing overlaps, so both joins are straight horizontal cuts.
	   The three rules below give the graveyard band room to overlap its
	   neighbours and a mask at each end, so it fades up into the stars and
	   down into the ground instead of butting against them. */

	/* hp-bg-bottom is a 500px grass tile and the most obvious repeat on the
	   homepage. Scale it up and sink it under a dark gradient so it becomes
	   ground rather than wallpaper. The gradient starts fully transparent:
	   any opacity at 0% is itself a step at the join. The negative margin
	   pulls the ground up under the graveyard band, which supplies the
	   overlap the fade needs to happen over. */
	& .hp-bg-bottom__2020 {
		margin-top: -9%;
		background-image:
			linear-gradient(180deg,
				rgba(20, 26, 40, 0) 0%,
				rgba(20, 26, 40, 0.5) 34%,
				rgba(20, 26, 40, 0.88) 68%,
				#141a28 100%),
			url(${IMG}/hp-bg-bottom.png);
		background-size: cover, 900px 900px;
		background-position: center, center top;
	}
	/* Stars repeat every 600px at the stock size; stretch the sky so the
	   repeat falls outside most viewports. */
	& .hp-bg-top__2020 {
		background-size: auto 165%;
	}
	/* The graveyard band is the worst repeat on the site: the grid gives it
	   25vh, the stock "auto 100%" makes each copy about 540px wide, and a
	   1080p homepage gets three and a half identical arches side by side.
	   One copy sized to the viewport width removes the repeat outright. The
	   band is far wider than it is tall, so the bottom of the scene is what
	   shows: ground, graves, bones.

	   The extra height plus the mask is what removes the two cuts. The top
	   of the band dissolves into the star field, the bottom into the ground
	   tile, and because the band keeps z-index 3 it stays over both of them
	   while it does. */
	& .hp-bg-mid__2020 {
		height: 34%;
		background-size: 100% auto;
		background-repeat: no-repeat;
		background-position: center bottom;
		-webkit-mask-image: linear-gradient(to bottom,
			transparent 0%,
			rgba(0, 0, 0, 0.5) 20%,
			#000 44%,
			#000 64%,
			rgba(0, 0, 0, 0.55) 84%,
			transparent 100%);
		mask-image: linear-gradient(to bottom,
			transparent 0%,
			rgba(0, 0, 0, 0.5) 20%,
			#000 44%,
			#000 64%,
			rgba(0, 0, 0, 0.55) 84%,
			transparent 100%);
	}

	& ::-webkit-scrollbar {
		width: 12px;
		height: 12px;
	}
	& ::-webkit-scrollbar-track {
		background: var(--hw-deep);
	}
	& ::-webkit-scrollbar-thumb {
		background: var(--hw-blue-dk);
		border-radius: 6px;
	}
	& ::-webkit-scrollbar-thumb:hover {
		background: var(--hw-blue);
	}
	& html,
	& body {
		scrollbar-color: #4B5A7E #141a28;
	}
}

@keyframes hw-drift {
	from { transform: translate3d(-2%, 0, 0) scale(1); }
	to   { transform: translate3d(2%, -1.5%, 0) scale(1.06); }
}

@keyframes hw-twinkle {
	from { opacity: 1; }
	to   { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
	html:has(#siteTheme[href*="hauntedwoods"]) body::after,
	html:has(#siteTheme[href*="hauntedwoods"]) .nav-top__2020::before,
	html:has(#siteTheme[href*="hauntedwoods"]) .nav-top__2020::after {
		animation: none;
	}
}
`;

	const style = document.createElement('style');
	style.id = 'hw-restyle';
	style.textContent = css;

	// document-start can land before <head> exists.
	(document.head || document.documentElement).appendChild(style);
})();

// ==UserScript==
// @name         # Neopets Dice-A-Roo and Scorchy Slots Refresher
// @namespace    local-advisor-fork
// @version      2.3
// @description  Plays Dice-A-Roo or Scorchy Slots for the pet-boredom mechanic, in rounds of a few plays as real page loads, and stops itself the moment an answer says the pet is bored. It submits the game's own form, so Dice-A-Roo costs 5 NP a game and its rolls are free, and Scorchy Slots costs 5 NP a spin; SUBMIT_TO_PLAY false stops it acting.
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
//   Dice-A-Roo    three POSTs to /games/play_dicearoo.phtml, each found by
//                 the hidden raah field its form carries:
//
//                   raah=init             enter. This is the landing page's
//                                         "Lets Play! (Costs 5 NP)". It
//                                         answers with the roll page if a
//                                         game is already going, and
//                                         otherwise with a "You are not
//                                         currently playing" page that
//                                         carries the next one. It does not
//                                         itself charge.
//                   raah=init&type=start  start a game. This is the POST that
//                                         costs the 5 NP, and it answers with
//                                         the new game's first roll.
//                   raah=continue         roll again. Free, and its answer
//                                         carries another Roll Again, over
//                                         and over until the game ends.
//
//                 So a game is one charge and then free rolls, and a run
//                 spends nearly all of itself on raah=continue. That is why
//                 it now stays on play_dicearoo.phtml: the next roll is
//                 already on the page it is looking at.
//
//                 Versions up to 2.2 walked back to /games/dicearoo.phtml
//                 between every play, on the belief that the roll page
//                 offered no way to carry on. It offers Roll Again. The walk
//                 back was both the click-to-play page appearing every few
//                 seconds and a fresh 5 NP charge per play, and it abandoned
//                 each pot to go and start another game.
//
//                 The one real dead end is Game Over, whose page carries no
//                 form at all - not one. The run re-enters by building the
//                 raah=init&type=start POST itself and submitting that,
//                 since there is nothing on the page to send, which lands a
//                 fresh game's first roll on the same URL. Measured live from
//                 a Game Over: 200, a Roll Again form, and the roll's own
//                 result text. _ref_ck is required on all of these - the same
//                 POST without it gets the site's red wrong-place error - so
//                 the token is kept from the last form that carried one, and
//                 the walk back to the landing page survives only as the
//                 fallback for having no token to use.
//
//                 Deliberately not sent: the roll page's other form, "Stop
//                 playing and collect N NP" (raah=continue plus type=collect).
//                 Whether to bank a pot is a decision about the user's
//                 Neopoints, not something this script should make, so pots
//                 are still lost when a game ends.
//
//                 Nor is play_dicearoo.phtml ever reloaded. A GET of it
//                 answers with the wrong-place error - measured - so every
//                 step on that page is a POST, either the page's own form or
//                 the built one above.
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
// sometimes dispatch on. The request built below appends that pair by hand for
// the same reason.
//
// @match names only dicearoo.phtml, play_dicearoo.phtml and slots.phtml.
//
// PLAYING WITHOUT LEAVING THE PAGE
//
// Clicking the form navigates, and a navigation destroys the document that
// scheduled it. That is the hard limit on queueing a few plays up the way
// holding F5 down feels like it does: one document can submit exactly one
// form, so there is nothing to queue behind it.
//
// Holding F5 does not really queue anything either. Each repeat aborts the
// load before it, so the client ends up showing one page where the server may
// have seen several - you cannot tell how many plays you bought, and you see
// the answer to only the last. That is the unreliable version of what this now
// does deliberately.
//
// A play is therefore sent as a request instead of a navigation. The form's
// own method, action and fields are read off the element, the submit control's
// name/value pair is appended the way a click would, and fetch sends it with
// the session cookies. The document in front of you is never replaced, so one
// round can send several plays.
//
// Serial, never parallel. Each answer is parsed before the next request is
// built, and the next play's form is taken from that answer rather than from
// the page, so a one-time field would travel correctly if either form ever
// grew one, and Dice-A-Roo's state machine sees requests in the order a person
// would produce them. Concurrent requests would be the least predictable thing
// to do to that state machine and the loudest automation signal available.
//
// Two things fall out of this for free. The boredom line is read from the
// answer to each individual play, so a run now ends on the play that produced
// it rather than on the following page load. And Dice-A-Roo's walk back to the
// landing page is a background GET, so a long run leaves the Back button alone
// completely.
//
// SHOWING THAT IT IS WORKING
//
// Playing underneath the page costs the run the only progress indicator it
// used to have: the page itself. Before this, a play was a page load, so a
// working run was obvious and a stuck one equally so. Now the document never
// changes - the dice never move, the reels never spin, nothing reloads - and
// a run that is working looks precisely like a run that is doing nothing. The
// first report after this landed was, reasonably, "nothing is happening".
//
// The fix is to put the answer on the screen. Every play already parses the
// document the site sent back, so the content column of that answer is swapped
// into the content column of the page you are looking at. The dice roll
// appears, the reels change, the win message shows - the page visibly moves on
// every play, exactly as it did when a play was a page load, except that it is
// a repaint rather than a navigation and so keeps the burst.
//
// Only a real content container is ever painted over - td.content, .contentModule
// or #content. The fallback those selectors end in is document.body, and
// painting that would wipe the panel along with the page, so the paint is
// skipped rather than risked when no container is found.
//
// innerHTML does not execute <script>, so nothing in the answer runs. These
// pages are server-rendered HTML and images, so there is nothing in them that
// needed to.
//
// The panel carries two smaller signals for the same reason: a "Last" row
// counting seconds since the most recent answer, which is proof of life even
// if a paint is skipped, and a flash of the header's run light on each play.
// Where an answer states a result it goes in that row's tooltip and the
// console line.
//
// What is still true is that the page is a picture of the last answer, not a
// live view: the form in it belongs to a play the loop has already moved past,
// so clicking it yourself starts a play outside the run. It still shows the form it was served with
// while the server's idea of the game has moved on. Nothing reads the page
// after that point, so this costs nothing mechanically - but the reels in
// front of you are not the reels being played, and the button under your mouse
// is a play the loop has already moved past.
//
// WHAT THE LIVE SITE TURNED OUT TO DO
//
// All of the following is measured against www.neopets.com on a real session,
// not inferred.
//
// A request-play works. This was the one assumption in the design, and it
// holds: a POST built from the form, sent by fetch with the session cookies,
// comes back as the game's own answer - the reels, a roll, or the boredom
// line. The site does not appear to care that it was not a navigation.
//
// Both play forms carry a hidden _ref_ck token. This is exactly the case the
// chain was built for, and it is why the next play's form is taken from the
// last answer rather than replayed from the page. The token looked stable
// across pages and plays, so it is probably per session rather than per page -
// but nothing depends on that, because the chain never reuses one.
//
// A play takes about a second: eleven plays in one run came back a median
// 1.09s apart, with occasional 3-6s answers, and a plain GET of a game page
// about 650ms. So the site's own latency, not the configured delay, is most of
// what paces a burst, and the real rate is nearer 30 plays a minute than the
// 53 the same settings produced against a 250ms stub. A slow night is a slow
// run.
//
// Sustained plays were not rate-limited. Seventeen plays at roughly one a
// second drew no "too fast" page, no error and no 4xx.
//
// But a fetch sometimes just fails. A live run died on its eleventh play with
// a bare TypeError, "Failed to fetch", and twenty immediately following
// requests all succeeded - so it was transient rather than a block, and not
// about the URL (a hardcoded absolute URL failed while the identical string
// built from location.origin succeeded, moments apart). This is the one thing
// a navigating loop never had to handle: a failed navigation leaves you on a
// page, where the next tick simply tries again. A failed fetch ended the whole
// run. See RECOVERING FROM A FAILED PLAY below.
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
// This script acts for you. A timer decides when the next play happens, it
// sends the game's own form to make it happen, and each one spends the game's
// 5 NP. It does not touch anything else: no other form, no shop, no bank, no
// pet. The bounds on a forgotten tab are:
//
//   - MAX_REFRESHES, counted in plays, and MAX_MINUTES. Note what a burst does
//     to the first of those: at four to eight plays a round the play cap
//     arrives in minutes, which is why it was raised to 400 when the burst
//     grew. The time cap is the one doing the real bounding now.
//   - A floor under the delay between rounds, a bounded burst, and a ceiling on
//     plays per minute that holds the next round back rather than ending the
//     run. A separate halt covers a rate only a bug could produce.
//   - Halt on anything unfamiliar, as above, now read from every single play's
//     answer rather than once per page load.
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

    // Send the form's request instead of navigating to it, so the plays happen
    // underneath the page you are on - see PLAYING WITHOUT LEAVING THE PAGE
    // above. Off by default: it is faster and it is invisible, and invisible
    // turned out to be the wrong trade. The run is meant to look like holding
    // F5 down, so it navigates, and a burst is a run of real page loads.
    //
    // True is still there and still measured, for when throughput matters more
    // than watching it work. It bursts without reloading and reaches about 30
    // plays a minute against this path's roughly 20.
    BACKGROUND_PLAYS: false,

    // Paint each answer's content column into the page, so a run visibly moves
    // instead of sitting motionless while the plays happen underneath it. See
    // SHOWING THAT IT IS WORKING above. False leaves the page as it was served.
    PAINT_ANSWERS: true,

    // Plays per round, drawn from this range - the "held F5" part. 1 and 1 is
    // one play a round.
    //
    // When navigating, a round cannot be a loop: each play replaces the
    // document that would have run it, so the count of plays left in the round
    // is written to the store and the next page load picks it up and carries
    // on. That is what makes a round a few seconds of rapid page loads
    // followed by a pause, rather than one load every few seconds.
    //
    // This is the throughput dial, and it is the right one to turn rather than
    // the delays below: those are shaped to not look like a metronome, and
    // flattening them to go faster would trade the one property worth having.
    // A round of eight plays in a second and a half, then a human-looking
    // pause, is both quicker and less regular than a short fixed interval.
    BURST_MIN: 4,
    BURST_MAX: 8,

    // Gap inside a burst, ms. A held key repeats far faster than this, but no
    // browser finishes a page load in 30ms either, so a hundred-odd ms is
    // about what holding F5 actually buys you - and the site's own response
    // time is added to each of these in practice, so a burst takes longer than
    // the gaps alone suggest.
    BURST_GAP_MIN_MS: 100,
    BURST_GAP_MAX_MS: 250,

    // Delay between rounds, seconds, drawn uniformly from this range each
    // time. MIN is floored at 1 below whatever you put here.
    MIN_SECONDS: 1,
    MAX_SECONDS: 6,

    // Every so often, take a longer break instead - the thing a person does and
    // a metronome does not. Chance per refresh, and the range of that break.
    LONG_PAUSE_CHANCE: 0.12,
    LONG_PAUSE_MIN_SECONDS: 12,
    LONG_PAUSE_MAX_SECONDS: 15,

    // Consecutive failed sends to tolerate before giving up, and how long to
    // wait before resyncing after one. Live, a run died on its eleventh play
    // with a bare "Failed to fetch" while the twenty requests after it all
    // succeeded, so one flaky send is not a reason to end a run - but a string
    // of them means the session or the site is gone.
    PLAY_RETRIES: 3,
    RETRY_BACKOFF_MS: 1500,

    // Hard stops for the current run, counted across page loads.
    //
    // The play cap is 400 rather than 150 because of the burst: at 150 a run
    // now ends in about two minutes, and since nobody has yet measured how
    // many plays boredom actually takes, a cap that tight risks ending every
    // run before the thing it exists to reach - leaving the panel's "last
    // bored after N plays" line permanently blank, which is the one number
    // that would settle it. 400 is about seven and a half minutes at the rate
    // measured below, comfortably inside the time cap.
    MAX_REFRESHES: 400,
    MAX_MINUTES: 25,

    // Ceiling on plays in any rolling 60 seconds. A throttle, not a halt: a
    // round that would cross it waits until the oldest play in the window ages
    // out, and then goes.
    //
    // Halting on this was right while a play meant a page load, when the only
    // way to exceed it was a reload storm. With bursts it is not: a run of
    // minimum delays can honestly reach the high hundreds a minute, so a halt
    // would kill good runs at random. Slowing one down is the better failure.
    //
    // Set above what the pacing above actually produces, deliberately, so that
    // the randomised delay stays the thing setting the rate and this stays a
    // backstop. A 4-8 burst measured 53 plays a minute against a 250ms
    // response time, and never once reached this ceiling over 82 seconds -
    // each play waits for its own answer, so the site's latency is part of the
    // loop and a slow site is a slower run. Only a fast stretch of minimum
    // draws should ever touch this. If it engages constantly, the burst range
    // is too big rather than this being too small.
    MAX_PLAYS_PER_MINUTE: 120,

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

    // What a play's answer said happened, for the panel's tooltip and the
    // console line. First match wins and only the matched text is used, so
    // these want to be narrow.
    //
    // Captured live from Dice-A-Roo, whose answer reads "Red Dice-A-Roo Medium
    // Win Congratulations, you just won 2 Neopoints!". Scorchy Slots' result
    // wording has not been captured, so a slots run shows the seconds-ago
    // reading and no result - which is why that reading, and not this, is what
    // the row actually displays.
    RESULT_PATTERNS: [
      /you (?:just )?won [\d,]+ neopoints?/i,
      /\b(?:small|medium|big|huge|mega|jackpot)\s+win\b/i,
      /you (?:have )?lost? [\d,]+ neopoints?/i,
      /better luck next time/i,
      /\bno win\b/i,
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
      // Captured live, from /games/dicearoo.phtml: the whole content column
      // reads "Sorry, this game is unavailable...". That is what the site
      // serves a session it does not recognise, and presumably also a game
      // TNT has switched off. Worth its own wording because the alternative
      // is the gate reporting "nothing here starts a play", which is true and
      // tells you nothing about why.
      /this game is unavailable/i,
    ],
  };

  const TAG = "[Refresher]";

  // ------------------------------------------------------------------ the gate

  // One entry per game.
  //
  //   playForm(doc) the form in that document that starts a play, or null. It
  //                 takes a document because the loop reads it both from the
  //                 page and from the answer to the last play, which is where
  //                 the next play's form comes from during a burst. A reload is
  //                 not a play - that was the earlier design and it does not
  //                 advance the mechanic - so this form is what gets sent.
  //
  //   restart(tok)  how to re-enter without leaving the page, for a game that
  //                 can run out of forms. Dice-A-Roo's Game Over page has
  //                 none, so this is the request its start form would have
  //                 made, built from the remembered token. Null when there is
  //                 no token, which sends the run down the returnUrl fallback.
  //
  //   returnUrl     where to go when a run is live, the page has no play
  //                 button, and restart cannot supply one either. For
  //                 Dice-A-Roo that is the landing page, which hands back both
  //                 a form and a fresh token. Scorchy Slots never needs it:
  //                 its reels page carries "Play Again", so the next play is
  //                 always right there.
  const GAMES = [
    {
      name: "Dice-A-Roo",
      title: /dice\s*-?\s*a\s*-?\s*roo/i,
      // Roll Again first, wherever it is offered: it is free, it keeps the
      // pot, and it is on the page the run is already looking at. Only when
      // there is no roll to make does this fall back to an entry form - the
      // "You are not currently playing" page's start button, or the landing
      // page's "Lets Play!".
      //
      // The collect form has to be excluded by hand, because it carries the
      // same raah=continue as Roll Again and differs only by type=collect.
      // Matching it would bank the pot and end the game, which is both a
      // money decision and the opposite of carrying on.
      playForm: (doc) => {
        for (const marker of doc.querySelectorAll('input[name="raah"][value="continue"]')) {
          const form = marker.form;
          if (form && !form.querySelector('input[name="type"][value="collect"]')) return form;
        }
        const init = doc.querySelector('input[name="raah"][value="init"]');
        return init ? init.form : null;
      },
      // Which of this game's forms costs money. Only entering does: a roll is
      // free, so a long run is charged per game and not per play, and the
      // panel would otherwise report a bill five times the real one.
      //
      // It can overcount by one per run, and only at the first play: raah=init
      // sent while a game is already in progress answers with that game's roll
      // page without charging. Hence "about" on the panel's figure.
      entryForm: (form) => !!form
        && !!form.querySelector('input[name="raah"][value="init"]'),
      // Game Over leaves nothing to submit, so re-entry is this request,
      // built. It starts a game, so it costs the 5 NP and counts as a play.
      restart: (token) => (token
        ? {
          url: "/games/play_dicearoo.phtml",
          fields: { raah: "init", type: "start", _ref_ck: token },
        }
        : null),
      // The fallback for having no token: a fresh GET of the landing page,
      // which carries one. A GET rather than a reload of the roll page, which
      // answers the wrong-place error.
      returnUrl: "/games/dicearoo.phtml",
      // Where to GET to find out what the server currently thinks, after a
      // send fails. The same page for this game; Scorchy Slots differs.
      resyncUrl: "/games/dicearoo.phtml",
    },
    {
      name: "Scorchy Slots",
      title: /scorchy/i,
      // slots.phtml serves two pages under one URL, and both can start a play:
      // the landing form (hidden play=yes, "Click Here to Play") before a game,
      // and the reels (form posting to process_slots2.phtml, "Play Again") once
      // one is in progress. The site keeps serving the reels after your first
      // play, so the second case is the one a long run spends its time in.
      playForm: (doc) => {
        const marker = doc.querySelector('input[name="play"][value="yes"]');
        if (marker && marker.form) return marker.form;
        return doc.querySelector('form[action*="process_slots"]');
      },
      // Every slots play is a fresh 5 NP spin, landing form or reels alike.
      entryForm: () => true,
      // Never needed: slots.phtml always answers with a form that plays.
      restart: () => null,
      returnUrl: null,
      // No walk back is needed mid-run, but a resync after a failed send still
      // has somewhere to look: slots.phtml serves the reels while a game is in
      // progress and the landing form when one is not, so either way this
      // answers with a form the chain can continue from.
      resyncUrl: "/games/slots.phtml",
    },
  ];

  // The form's own submit control. Clicking it rather than calling
  // form.submit() sends that button's name/value pair, which form.submit()
  // drops and which Neopets forms sometimes dispatch on.
  function submitOf(form) {
    return form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
  }

  // The hidden request token Neopets puts on its forms. Every form on a live
  // page carries the same one, and it is required on each play - a POST
  // without it answers the wrong-place error, measured - so the run keeps the
  // last one it saw for the one page that has no form to read it from.
  function tokenIn(doc) {
    const el = doc.querySelector('input[name="_ref_ck"]');
    return el ? el.value : "";
  }

  const entry = GAMES.find((g) => g.title.test(document.title || ""));
  if (!entry) return;
  const game = entry.name;
  const pageForm = entry.playForm(document);
  const playBtn = pageForm ? submitOf(pageForm) : null;
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
  function contentRoot(doc) {
    return doc.querySelector("td.content")
      || doc.querySelector(".contentModule")
      || doc.querySelector("#content")
      || doc.body
      || doc.documentElement;
  }

  // Takes a document, because the same reading is done on the page and on the
  // answer to a background play.
  function textOf(doc) {
    const root = contentRoot(doc);
    if (!root) return "";
    // The live page has layout, so innerText is available and is the better
    // reading: it is what a person sees.
    if (doc === document) return (root.innerText || "").replace(/\s+/g, " ");
    // A parsed answer has no layout and so no innerText. textContent is what
    // there is, but it includes the contents of <script> and <style> - that is
    // page source, not page text, and it is full of words a pattern could hit
    // by accident. Strip those first, on a clone, so the page itself is left
    // alone.
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, template").forEach((n) => n.remove());
    return (clone.textContent || "").replace(/\s+/g, " ");
  }

  function contentText() {
    return textOf(document);
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
    recent: [],          // ms timestamps of recent plays, for the rate ceiling
    note: "",            // why it stopped, shown on the panel after a halt
    noteKind: "stop",    // "bored" (the run's goal) or "stop" (anything else)
    burstLeft: 0,        // plays still owed by the current round, across loads
    lastPlayAt: 0,       // ms of the most recent answer, for the "Last" row
    lastResult: "",      // what that answer said happened, if anything matched
    lastBored: null,     // {at, count} of the last boredom line, kept across runs
    token: "",           // last _ref_ck seen, for re-entering a dead-end page
    games: 0,            // games started this run, which is what was charged
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

  // Whatever this page can tell us. Kept rather than read on demand because
  // the page that needs it - Dice-A-Roo's Game Over - is the one page with no
  // form on it to read.
  {
    const here = tokenIn(document);
    if (here && here !== state.token) state.token = here;
  }

  // The built request that re-enters a game, or null if this game never needs
  // one or there is no token to sign it with.
  function restartPlan() {
    return entry.restart ? entry.restart(state.token || "") : null;
  }

  // ------------------------------------------------------------------ the halt

  // kind is "bored" for a run that reached what it was for, "stop" for anything
  // else. Only the panel's colour and wording turn on it; both end the run.
  function halt(note, kind) {
    state.running = false;
    state.nextAt = 0;
    // A round the run will never finish must not sit in the store, or the next
    // load would read it as mid-round.
    state.burstLeft = 0;
    state.note = note;
    state.noteKind = kind || "stop";
    save();
    clearInterval(tick);
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    console.info(`${TAG} ${game}: stopped (${state.noteKind}) - ${note}`);
    render();
  }

  // Did this load show the boredom line? Separate from the faults below because
  // it is the run's goal, and because it is worth recording when it happened.
  function checkBored(text) {
    if (text == null) text = contentText();
    for (const re of CONFIG.BORED_PATTERNS) {
      const m = text.match(re);
      if (m) return `page says "${m[0]}"`;
    }
    return null;
  }

  // The faults, read off the page in front of us. Separate from the caps below
  // because a burst checks the caps after every play and this against nothing -
  // the page stops being a reliable account of the game as soon as the first
  // background play lands, so each play's own answer is what gets read instead.
  function checkPage() {
    const text = contentText();
    for (const re of CONFIG.HALT_PATTERNS) {
      const m = text.match(re);
      if (m) return `page matched ${re} ("${m[0]}") - look at the page`;
    }
    return null;
  }

  // The bounds on the run itself, which hold wherever the plays are going.
  function checkCaps() {
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

    // Not the per-minute ceiling, which is a throttle and lives in schedule().
    // This is the rate no amount of bad luck explains: a full burst every
    // second for ten seconds, which means something is looping.
    const absurd = CONFIG.BURST_MAX * 10;
    const tenSeconds = Date.now() - 10000;
    if (state.recent.filter((t) => t > tenSeconds).length > absurd) {
      return `rate went impossible (>${absurd} plays/10s) - something is looping`;
    }

    return null;
  }

  // What an answer to a background play says, if it says anything that ends the
  // run. Same two lists as the page, in the same order: the boredom line is the
  // point of the run, so it is read before the faults.
  function inspect(doc) {
    return inspectText(textOf(doc));
  }

  function inspectText(text) {
    const bored = checkBored(text);
    if (bored) return { note: `Pet is bored - run complete. ${bored}`, kind: "bored" };

    for (const re of CONFIG.HALT_PATTERNS) {
      const m = text.match(re);
      if (m) return { note: `A play came back matching ${re} ("${m[0]}") - look at the game`, kind: "stop" };
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

  function burstSize() {
    const lo = Math.max(1, CONFIG.BURST_MIN);
    const hi = Math.max(lo, CONFIG.BURST_MAX);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function burstGap() {
    const lo = Math.max(0, CONFIG.BURST_GAP_MIN_MS);
    const hi = Math.max(lo, CONFIG.BURST_GAP_MAX_MS);
    return Math.round(lo + Math.random() * (hi - lo));
  }

  // The per-minute ceiling as a wait rather than a verdict. If the last minute
  // is already full, the next round is due when the oldest play in that window
  // leaves it - which is the earliest moment the round could run without
  // breaking the ceiling, so this costs nothing but the wait.
  function throttledUntil() {
    const minute = Date.now() - 60000;
    const window = state.recent.filter((t) => t > minute);
    const cap = CONFIG.MAX_PLAYS_PER_MINUTE;
    if (window.length < cap) return 0;
    return window[window.length - cap] + 60000;
  }

  function schedule() {
    const ms = pickDelay();
    const hold = throttledUntil();
    state.nextAt = Math.max(Date.now() + ms, hold);
    save();
    const wait = (state.nextAt - Date.now()) / 1000;
    console.info(
      `${TAG} ${game}: next round in ${wait.toFixed(1)}s`
      + (hold > Date.now() + ms ? ` (held back: ${CONFIG.MAX_PLAYS_PER_MINUTE} plays/min ceiling)` : "")
    );
  }

  // ---------------------------------------------- recovering from a failed play
  //
  // RECOVERING FROM A FAILED PLAY
  //
  // A fetch that throws tells you nothing about whether the server saw the
  // request. So a retry cannot simply re-send it: if the first one did land,
  // re-sending buys a second play and leaves the chain's idea of the game one
  // step behind the server's.
  //
  // Instead the recovery throws away the form it was holding and GETs the
  // game's own page, which answers with whatever the server now thinks the
  // state is - the reels mid-game, the landing form otherwise - and the chain
  // carries on from that. It costs one extra request and it cannot
  // double-play.
  //
  // The play is still counted. It was sent, it may well have been charged, and
  // a count that only includes plays whose answers came back would understate
  // what the run cost.

  // ------------------------------------------------------------- the request
  //
  // A play as an HTTP request rather than a navigation, built from the form
  // itself so nothing about either game's fields is hardcoded here.

  function resolve(raw, base) {
    try {
      return new URL(raw || base, base).href;
    } catch {
      return base;
    }
  }

  function requestFor(form, base) {
    const method = (form.getAttribute("method") || "GET").toUpperCase();
    const url = resolve(form.getAttribute("action"), base);
    const data = new FormData(form);

    // The submit control's own name/value pair. A click sends it and
    // FormData(form) does not include it, exactly as form.submit() drops it -
    // and Neopets forms sometimes dispatch on precisely that pair.
    const submit = submitOf(form);
    if (submit && submit.name) data.append(submit.name, submit.value || "");

    if (method === "GET") {
      const qs = new URLSearchParams(data).toString();
      const [bare] = url.split("#");
      return {
        url: qs ? `${bare}${bare.includes("?") ? "&" : "?"}${qs}` : bare,
        init: { method: "GET" },
      };
    }

    // Classic Neopets forms are urlencoded; honour an enctype if one says
    // otherwise rather than mangling the body.
    if ((form.getAttribute("enctype") || "").toLowerCase().includes("multipart")) {
      return { url, init: { method: "POST", body: data } };
    }
    return {
      url,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      },
    };
  }

  // Swap the answer's content column into the page's, so the play is visible.
  // Never paints over document.body or the documentElement: those are the tail
  // of contentRoot()'s fallback chain, and painting either would take the panel
  // with it.
  function paintAnswer(doc) {
    const from = contentRoot(doc);
    const into = document.querySelector("td.content")
      || document.querySelector(".contentModule")
      || document.querySelector("#content");
    if (!from || !into) return false;
    try {
      // innerHTML does not run <script>; these pages are static HTML and images.
      into.innerHTML = from.innerHTML;
      return true;
    } catch (err) {
      console.warn(`${TAG} could not paint the answer`, err);
      return false;
    }
  }

  // A visible tick on the run light, for the play you were not watching the
  // counter for. The class has to come off and the layout be read back before
  // it goes on again, or the animation does not restart.
  function flashDot() {
    const dot = document.getElementById("nprf-dot");
    if (!dot) return;
    dot.classList.remove("nprf-flash");
    void dot.offsetWidth;
    dot.classList.add("nprf-flash");
  }

  function extractResult(text) {
    for (const re of CONFIG.RESULT_PATTERNS) {
      const m = text.match(re);
      if (m) return m[0];
    }
    return "";
  }

  async function fetchDoc(url, init) {
    const res = await fetch(url, Object.assign(
      { credentials: "same-origin", redirect: "follow" },
      init,
    ));
    const html = await res.text();
    return {
      doc: new DOMParser().parseFromString(html, "text/html"),
      url: res.url || url,
      status: res.status,
    };
  }

  // ------------------------------------------------------------- the burst
  //
  // Where the next play comes from. It starts as the form on the page and
  // afterwards is whatever form the last answer carried, so the chain follows
  // the server's state instead of replaying the page's.
  let nextForm = pageForm;
  let nextBase = location.href;
  let busy = false;
  // Consecutive failed sends. Module scope rather than per-round, so a run
  // that fails once at the end of every round still eventually gives up.
  let fails = 0;
  // Set on a page no run can start from. The stand-down path below stops the
  // timer, so the panel's button would be there and do nothing; this is what
  // tells render() to show it disabled instead of lying about what a click
  // would do.
  let standDown = false;

  function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
  }

  // One play, end to end: find a form if the last answer had none, send it,
  // read what came back. Returns null to carry on, or the reason to stop.
  async function playOnce() {
    const plan = nextForm ? null : restartPlan();
    let req = null;

    if (nextForm) {
      req = requestFor(nextForm, nextBase);
    } else if (plan) {
      // The answer ran out of forms - Dice-A-Roo's Game Over - so send the
      // request its start form would have made.
      req = {
        url: resolve(plan.url, location.href),
        init: {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(plan.fields).toString(),
        },
      };
    } else if (entry.returnUrl) {
      // No token to build that request with, so walk back to the landing page,
      // which answers with both a form and a token.
      const back = await fetchDoc(resolve(entry.returnUrl, location.href), { method: "GET" });
      if (back.status >= 400) {
        return { note: `Stopped: the landing page answered ${back.status}.`, kind: "stop" };
      }
      const said = inspect(back.doc);
      if (said) return said;
      const tok = tokenIn(back.doc);
      if (tok) state.token = tok;
      nextForm = entry.playForm(back.doc);
      nextBase = back.url;
      if (!nextForm) {
        return { note: "Stopped: the landing page came back with no play form.", kind: "stop" };
      }
      req = requestFor(nextForm, nextBase);
    } else {
      return { note: "Stopped: nothing offers another play.", kind: "stop" };
    }

    // Counted before the request, not after: a play that was sent counts
    // whether or not its answer arrives, and the cost is incurred either way.
    state.plays += 1;
    if (plan || (entry.entryForm && entry.entryForm(nextForm))) state.games += 1;
    state.recent.push(Date.now());
    save();

    const got = await fetchDoc(req.url, req.init);
    if (got.status >= 400) {
      return { note: `Stopped: a play answered ${got.status}.`, kind: "stop" };
    }

    nextBase = got.url;
    nextForm = entry.playForm(got.doc);
    const tok = tokenIn(got.doc);
    if (tok) state.token = tok;

    // One reading of the answer serves all three things that want it: what it
    // said happened, what the panel shows, and whether the run is over.
    const text = textOf(got.doc);
    state.lastPlayAt = Date.now();
    state.lastResult = extractResult(text);
    save();
    console.info(
      `${TAG} ${game}: play ${state.plays} -> ${got.status}`
      + (state.lastResult ? ` (${state.lastResult})` : ""),
    );

    if (CONFIG.PAINT_ANSWERS) paintAnswer(got.doc);
    flashDot();
    return inspectText(text);
  }

  // Throw away the form we were holding and ask the server what it currently
  // thinks. Used after a failed send, where re-sending could double-play - see
  // RECOVERING FROM A FAILED PLAY above. Returns whether the chain can carry
  // on, and anything the resync page itself said.
  async function resync() {
    nextForm = null;
    await sleep(CONFIG.RETRY_BACKOFF_MS);
    const url = entry.resyncUrl || entry.returnUrl;
    if (!url) return { ok: false, said: null };
    try {
      const got = await fetchDoc(resolve(url, location.href), { method: "GET" });
      if (got.status >= 400) return { ok: false, said: null };
      nextBase = got.url;
      // A null form is not a failure: Dice-A-Roo's walk-back in playOnce picks
      // that up. What matters is that the page answered.
      nextForm = entry.playForm(got.doc);
      return { ok: true, said: inspect(got.doc) };
    } catch (err) {
      console.warn(`${TAG} ${game}: resync failed`, err);
      return { ok: false, said: null };
    }
  }

  // A round: a handful of plays, one at a time. The run can end on any of
  // them, which is the point of reading each answer rather than the next page.
  async function burst() {
    if (busy) return;
    busy = true;
    state.nextAt = 0;
    render();
    try {
      const want = burstSize();
      for (let i = 0; i < want; i += 1) {
        if (!state.running) return;

        let said;
        try {
          said = await playOnce();
          fails = 0;
        } catch (err) {
          // A send that throws says nothing about whether the server saw it, so
          // this resyncs rather than re-sending. Live, a single one of these
          // ended an eleven-play run while the next twenty requests all
          // succeeded; one is not a reason to stop.
          fails += 1;
          console.warn(
            `${TAG} ${game}: play ${state.plays} could not be sent`
            + ` (${fails}/${CONFIG.PLAY_RETRIES})`, err,
          );
          if (fails >= CONFIG.PLAY_RETRIES) {
            halt(
              `Stopped: ${fails} plays in a row could not be sent`
              + ` (${err && err.message}). Check you are still logged in.`,
              "stop",
            );
            return;
          }
          const back = await resync();
          if (back.said) {
            if (back.said.kind === "bored") state.lastBored = { at: Date.now(), count: state.plays };
            halt(back.said.note, back.said.kind);
            return;
          }
          if (!back.ok) {
            halt("Stopped: a play failed and the game page would not answer either.", "stop");
            return;
          }
          // The failed attempt does not spend one of this round's plays.
          i -= 1;
          render();
          continue;
        }

        if (said) {
          if (said.kind === "bored") state.lastBored = { at: Date.now(), count: state.plays };
          halt(said.note, said.kind);
          return;
        }

        state.count += 1;
        save();
        render();

        const why = checkCaps();
        if (why) {
          halt(why, "stop");
          return;
        }
        if (i + 1 < want) await sleep(burstGap());
      }
      schedule();
      render();
    } finally {
      busy = false;
    }
  }

  // A navigation that posts fields this page has no form for. Dice-A-Roo's
  // Game Over page is form-less, so re-entering it means building the request
  // its start form would have made. Submitted rather than fetched, because the
  // whole point of this path is that the page visibly moves.
  //
  // This is the one step that cannot use location.replace - a POST needs a
  // form - so it leaves a history entry behind. Once per game rather than
  // once per play, which is what the old walk back cost.
  function postNav(plan) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = plan.url;
    for (const name of Object.keys(plan.fields)) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.value = plan.fields[name];
      form.appendChild(field);
    }
    form.hidden = true;
    document.body.appendChild(form);
    form.submit();
  }

  // One step of the loop. Five shapes, in order of what is available:
  //
  //   background      send the round's plays as requests, leaving the page
  //                   alone. The default, and the only shape that can do more
  //                   than one play, since the others navigate.
  //   a play button   click it. This is the play, and it is the last thing this
  //                   document does.
  //   a restart plan  the page ran out of forms, so post the request that
  //                   starts a fresh game. A play: counted and charged.
  //   a return URL    walk back to the page that has one, when there is no
  //                   token to build that request with. Not a play, not
  //                   counted, and not charged.
  //   neither         should not happen - canAct gates it - so say so loudly
  //                   rather than spinning.
  //
  // Navigation uses location.replace so a long run leaves one history entry
  // rather than a hundred and fifty in front of the Back button.
  function go() {
    state.nextAt = 0;

    // A new round starts here. Mid-round this is already set, by this load or
    // by the load before it.
    if (state.burstLeft <= 0) {
      state.burstLeft = burstSize();
      console.info(`${TAG} ${game}: round of ${state.burstLeft}`);
    }

    if (CONFIG.SUBMIT_TO_PLAY && CONFIG.BACKGROUND_PLAYS) {
      burst();
      return;
    }

    if (playBtn && CONFIG.SUBMIT_TO_PLAY) {
      // Counted and charged before the click, because the click navigates and
      // nothing after it runs. The round's remaining count goes with it, so
      // the page this lands on knows it is mid-round.
      state.plays += 1;
      state.burstLeft -= 1;
      if (entry.entryForm && entry.entryForm(pageForm)) state.games += 1;
      state.recent.push(Date.now());
      state.lastPlayAt = Date.now();
      save();
      console.info(`${TAG} ${game}: play ${state.plays}, ${state.burstLeft} left in round`);
      playBtn.click();
      return;
    }
    if (playBtn) {
      // SUBMIT_TO_PLAY off: the old reload, which starts no game.
      save();
      location.replace(location.href);
      return;
    }
    const plan = restartPlan();
    if (plan && CONFIG.SUBMIT_TO_PLAY) {
      // Game Over, with a token to re-enter on. This starts a game, so it is
      // charged and counted exactly like a roll.
      state.plays += 1;
      state.burstLeft -= 1;
      state.games += 1;
      state.recent.push(Date.now());
      state.lastPlayAt = Date.now();
      save();
      console.info(`${TAG} ${game}: new game, play ${state.plays}`);
      postNav(plan);
      return;
    }
    if (entry.returnUrl) {
      // Not a play: no count, no charge, and the round keeps whatever it had
      // left. Only reached now when there is no token to re-enter with, since
      // the roll page carries the next roll itself.
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
    state.games = 0;
    state.burstLeft = 0;
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
  }, 1000);

  // The countdown is repainted on its own, from requestAnimationFrame, and not
  // from the interval above. The interval has to keep its period long, because
  // its job is the due check and a browser throttles a background tab's timers
  // to about once a minute whatever period you ask for - but a clock showing
  // tenths and repainted on that same beat moves in visible steps, which is
  // what made this choppy at 250ms: four repaints a second against a digit
  // that changes ten times a second.
  //
  // rAF is the right clock for the display and the wrong one for the due
  // check: it runs at the refresh rate when the tab is visible and stops dead
  // when it is not. Splitting them gives a smooth countdown in front of you
  // and a run that still advances behind your back.
  let frame = 0;
  function paintClock() {
    frame = 0;
    if (!panel || !state.running || !state.nextAt) return;
    const text = fmtSeconds(state.nextAt - Date.now());
    if (vNext.textContent !== text) vNext.textContent = text;
    frame = requestAnimationFrame(paintClock);
  }
  function startClock() {
    if (!frame) frame = requestAnimationFrame(paintClock);
  }
  // Hidden tabs do not fire rAF, so the loop dies when you switch away and has
  // to be restarted when you come back; without this the countdown stays
  // frozen on whatever it last showed.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) startClock();
  });

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
    /* A tick on the run light per play, for the one you were not watching the
       counter for. */
    @keyframes nprf-flash {
      from { box-shadow: 0 0 0 0 rgba(255,255,255,0.95) !important; }
      to   { box-shadow: 0 0 0 6px rgba(255,255,255,0) !important; }
    }
    #nprf-dot.nprf-flash { animation: nprf-flash 450ms ease-out !important; }
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
    /* Disabled, for a page no run can start from. Flat, since the bevel above
       is what makes the button read as pressable. */
    .nprf-btn:disabled {
      cursor: not-allowed !important; color: #7b7b7b !important;
      background: linear-gradient(#efefef, #dcdcdc) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,1),
                  inset 0 -2px 2px 2px rgba(0,0,0,0.07),
                  0 0 0 2px rgba(0,0,0,0.45) !important;
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

  let panel, vCount, vNext, vLast, elNote, elHistory, btnRun;

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
    vLast = addRow(body, "Last");

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

  // Tenths throughout. An earlier version switched to whole seconds above 10s,
  // which meant the readout changed character partway down a 12-15s pause -
  // one jump a second, then suddenly ten. One format the whole way is steadier
  // to watch, and the tabular figures stop the width moving.
  function fmtSeconds(ms) {
    return `${Math.max(0, ms / 1000).toFixed(1)}s`;
  }

  function render() {
    if (!panel) build();

    // The header's colour and the run light are driven by data attributes, so
    // every state lives in the stylesheet beside the rule it changes rather
    // than in a pile of inline writes here.
    panel.dataset.running = state.running ? "1" : "0";
    panel.dataset.outcome = state.running ? "" : (state.note ? state.noteKind : "");

    vCount.textContent = `${state.plays} / ${CONFIG.MAX_REFRESHES}`;
    // The bill, not the play count: Dice-A-Roo charges per game and rolls for
    // free, so plays times 5 NP would overstate what the run has spent.
    vCount.title = `${state.plays} plays this run, cap ${CONFIG.MAX_REFRESHES}`
      + ` - ${state.games} game${state.games === 1 ? "" : "s"} started,`
      + ` about ${state.games * 5} NP`;

    if (state.running && busy) {
      // Mid-round. There is no countdown to show, because the plays are in
      // flight rather than pending.
      vNext.textContent = "playing";
    } else if (state.running && state.nextAt) {
      vNext.textContent = fmtSeconds(state.nextAt - Date.now());
      startClock();
    } else {
      vNext.textContent = "—";
    }

    // Seconds since the last play. Proof of life that does not depend on
    // having watched the counter's previous value, and the one reading that
    // still works when a page load is what moved things along.
    if (state.lastPlayAt) {
      const age = Math.round((Date.now() - state.lastPlayAt) / 1000);
      vLast.textContent = age < 1 ? "just now" : age < 90 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
      vLast.title = state.lastResult ? `${state.lastResult} - ${vLast.textContent}` : vLast.textContent;
    } else {
      vLast.textContent = "—";
      vLast.title = "No play yet this run.";
    }

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
    btnRun.disabled = standDown && !state.running;
    btnRun.title = btnRun.disabled
      ? "Nothing on this page starts a play."
      : state.running ? "Stop the run." : "Start a run.";
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
    standDown = true;
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

    // What the page says about itself, if it says anything, so that a stand-down
    // can name the reason instead of only the symptom. "Sorry, this game is
    // unavailable..." is the case that prompted this: the gate's own account of
    // it was "nothing here starts a play", which is true and useless.
    const said = checkPage();

    if (state.running) {
      const err = /directed to this page from the wrong place/i.test(document.body.innerText || "");
      state.running = false;
      state.nextAt = 0;
      state.note = err
        ? "Stopped: the site served its wrong-place error. A reload of the *play* page does that - this script only ever reloads the landing page, so something else navigated."
        : said
          ? `Stopped: ${said}`
          : "Stopped: nothing here starts a play and there is no way back - the site served something else.";
      state.noteKind = "stop";
      save();
      console.info(`${TAG} ${game}: ${state.note}`);
      render();
      return;
    }

    if (said) {
      // Idle, and the page is not one a run could start from. Say so on the
      // panel rather than only in the console, since this is the state you
      // would be looking at the panel to explain.
      state.note = said;
      state.noteKind = "info";
      save();
      console.info(`${TAG} ${game}: ${said}; standing down`);
      render();
      return;
    }

    console.info(`${TAG} ${game}, but no form on this page starts a play; standing down`);
    return;
  }

  // ------------------------------------------------------------------- the run

  // Trimmed, not appended to: these are plays, and a page load is not one.
  // Appending here was right while every play was a page load; with background
  // plays it would count a reload of the page as a play and throttle the run
  // against something that cost nothing.
  state.recent = state.recent.filter((t) => t > Date.now() - 120000);

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

    // What this page says happened, for the panel's "Last" row. A walk-back
    // page matches nothing and so leaves the previous result standing, which
    // is what you want: the last thing that actually happened.
    const landed = extractResult(contentText());
    if (landed) state.lastResult = landed;

    // The boredom line first, before the faults and before the caps: if this
    // load is both the last one and the bored one, it is the bored one.
    const bored = checkBored();
    if (bored) {
      state.lastBored = { at: Date.now(), count: state.plays };
      halt(`Pet is bored - run complete. ${bored}`, "bored");
    } else {
      const why = checkPage() || checkCaps();
      if (why) {
        halt(why, "stop");
      } else if (state.burstLeft > 0) {
        // Mid-round: this load is one of the rapid ones, so the next step goes
        // out on the burst gap rather than the between-rounds delay. A direct
        // timer, not the 1s tick, because the gap is shorter than the tick.
        const gap = burstGap();
        state.nextAt = Date.now() + gap;
        save();
        render();
        setTimeout(go, gap);
      } else {
        // The round is spent. Pause, then the next go() starts a new one.
        schedule();
        render();
      }
    }
  } else {
    save();
    render();
  }
})();

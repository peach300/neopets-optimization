# Neopets userscripts

Userscripts for [Neopets](https://www.neopets.com), written for Tampermonkey.
Mostly display and convenience: live countdowns the site does not show, state
the site forgets between page loads, and cosmetic restyles of the H5 themes.

## Installing

Each script carries `@downloadURL` and `@updateURL`, so Tampermonkey checks for
updates on its own and offers any version newer than the one installed.

Click a script's **Install** link below and Tampermonkey will prompt you.

| Script | Install | What it does |
|---|---|---|
| Daily Timers | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Daily%20Timers.user.js) | One panel on every page with a live countdown per timed activity: interval cooldowns measured from your visit, daily rows that count to midnight NST, fixed-hour windows, and per-day allowances counted rather than timed. Settings page to switch any of them on or off, with per-activity alert bells. Detects a visit from the page's own result text, its own request, or a click, best source first, and says which it used. Display only. |
| Dice-A-Roo and Scorchy Slots Refresher | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Dice-A-Roo%20and%20Scorchy%20Slots%20Refresher.user.js) | Plays Dice-A-Roo or Scorchy Slots on a randomised interval, a few plays to a round, for the pet-boredom mechanic, and stops itself the moment a play comes back saying the pet is bored. **It acts for you**: a reload turned out not to start a game, so each play sends the game's own form, at its usual 5 NP. Plays go as requests rather than navigations, so the page you are on stays put - which is the only way to get several plays out of one round, since a navigation destroys the document that scheduled it. That also means each individual play's answer is read, so a run ends on the play that produced the boredom line rather than on the following page load, and Dice-A-Roo's walk back to its landing page costs no history entry. The page in front of you does go stale once the first background play lands. `BACKGROUND_PLAYS: false` goes back to navigating, one play per load; `SUBMIT_TO_PLAY: false` puts the original reload back, which spends nothing and plays nothing. Runs on `dicearoo.phtml`, `play_dicearoo.phtml` and `slots.phtml` and nowhere else. Where the next play lives differs by game: Dice-A-Roo's form is on its landing page only, so the loop fetches that page again between plays (a GET - re-posting the roll page sends a stale init and gets the site's wrong-place error); Scorchy Slots carries its reels form in every answer, so the chain just keeps posting that. Each play's form is taken from the previous play's answer rather than replayed from the page, so the games' own hidden state travels correctly. Each game is keyed on its form's hidden field or action URL rather than the button's label, since those differ ("Lets Play!" against "Click Here to Play") and matching one silently ignored the other game. Rounds are 1-6s apart with a 12% chance of 12-15s instead, at four to eight plays a round. Measured live: a play comes back in about a second, so the site's own latency is most of what paces a burst and the real rate is nearer 30 plays a minute than the 53 the same settings give against a fast stub. Sustained plays drew no rate limiting, but a fetch does occasionally fail outright - one of those ended an eleven-play run while the next twenty requests all succeeded - so a failed send is retried by asking the game page what the server now thinks, rather than by re-sending a request that may already have landed. Three in a row ends the run. A rolling ceiling of 120 plays a minute holds the next round back rather than killing the run, and sits above what the pacing produces on purpose so the randomised delay stays what sets the rate. Caps at 400 plays - about thirteen minutes at the live rate - and 25 minutes, and starts stopped. |
| Haunted Woods Restyle | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Haunted%20Woods%20Restyle.user.js) | Cosmetic restyle of the H5 Haunted Woods theme, pulled back toward the old slate-navy and teal one, with a CSS star field in place of the tiled bat wallpaper. Appearance only. |
| Lottery Ticket Autobuy | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Lottery%20Ticket%20Autobuy.user.js) | Fills the lottery ticket with six unique random numbers and submits the buy itself, after a cancellable countdown. Spends 20 NP a ticket. Guards: a Cancel button, a per-day cap counted against the NST date, one submit per page load, and it fires only on a page that actually has the buy form. `AUTO_BUY: false` falls back to fill-only. |
| Meridell Classic Theme | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Meridell%20Classic%20Theme.user.js) | Cosmetic restyle of the H5 Meridell theme toward its classic look. Appearance only. |
| Meridell Restyle | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Meridell%20Restyle.user.js) | Replaces Meridell's tiled dungeon-wall wallpaper with the theme's own homepage scene, fixed to the viewport so it does not scroll or restart partway down a long page. Appearance only. |
| Monotony Spin Guard | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Monotony%20Spin%20Guard.user.js) | Live countdown for a Wheel of Monotony spin, plus a hold on the tab so it is not discarded or reloaded mid-spin. The wheel is Phaser and resuming is switched off server-side, so the document has to survive the whole spin or the spin is abandoned and refunded. Display and protection only. |
| Ruffle Upgrade | [install](https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20Ruffle%20Upgrade.user.js) | Swaps the site's bundled Ruffle for a current build, so the remaining Flash games run. |

## Conventions

Every script is named `# Neopets <Thing>`. Tampermonkey sorts its list by name
and `#` sorts ahead of letters, so the prefix keeps them together at the top of
the dashboard. The prefix is in `@name` only — filenames are unprefixed.

Tampermonkey identifies an installed script by `@namespace` + `@name`, so a
rename installs as a new entry rather than updating the old one. If you have an
older copy of any of these under its unprefixed name, delete it after
installing, or both copies run at once.

Each file carries far more prose than code, on purpose: a `WHY` block saying
what the site actually does and what was measured to find that out, a `SCOPE`
note on what the script does not do, and comments on any constant that was
arrived at rather than chosen.

## Licence

MIT. See [LICENSE](LICENSE).

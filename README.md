# Slowboard homepage

## Checkers lab preview

Open `/play.html` after serving `dist`, or use the homepage's **Play checkers** link.
It includes two-player browser checkers, a physical-board simulator, and an unverified
live USB bridge for the working original-based revision 1 firmware. See
[LAB-PLAY.md](LAB-PLAY.md) for simulator instructions and the post-repair checklist.
Wi-Fi, remote-browser sessions and persistence are not yet implemented.
Run `node --test tests/checkers.test.mjs` for game rules and protocol tests.

## Homepage

A static, responsive parallax homepage for the connected 6 × 6 physical board-game prototype described in “Branch · Stationary Digital Score Counters”.

Serve `dist` with any static HTTP server, for example `python -m http.server 4173 --directory dist`, then open http://localhost:4173.

- `dist/index.html`: content and structure
- `dist/styles.css`: responsive layout and CSS board illustrations
- `dist/motion.css`: cinematic scenes, pinned scrolling, and reduced-motion styles
- `dist/app.js`: board rendering, illustrative signal demo, and scroll parallax

The demo is entirely local. It does not connect to hardware or implement a complete game. Reduced-motion preferences disable parallax and smooth scrolling. Google Fonts is optional; system fonts provide fallbacks.

## Hosting

Publish the contents of `dist` with any static host. No build step, API keys, or Sites runtime is required. All website asset references are relative, so the site also works under a repository subpath. Moving the source to GitHub does not itself publish the website.

## Validation

Run `node --check dist/app.js` for JavaScript syntax validation. The original interactive demo was browser-tested. The latest cinematic motion revision loads successfully, but its final visual and responsive checks remain pending after a tool usage interruption.

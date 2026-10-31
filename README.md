# Fire & Water — online co-op

A two-player co-op temple platformer in the spirit of the classic fire-and-water puzzle games, playable **across two laptops** over a direct peer-to-peer connection. It's a static site (plain HTML/JS, no build step, no server), so it runs on GitHub Pages.

## Play
1. Player 1 opens the site, picks **Fire** or **Water**, clicks **Create room**.
2. Send the link (or the 4-letter code) to Player 2. They open it and they're in.
3. Each player controls their own character from their own keyboard.

| Action | Keys |
| --- | --- |
| Move | ← → or A D |
| Jump | ↑, W or Space |
| Restart | R |

**Rules:** Fire can walk through lava, Water through water; green goo kills both. Fire collects red gems, Water collects blue. Buttons open the gold gate while someone stands on them; the lever raises the purple lift. Both players standing at their own door clears the level. If anyone dies, the level restarts for both.

## Test locally
Any static server works (opening `index.html` as a file won't, because of browser security rules):

```bash
python3 -m http.server 8000
# open http://localhost:8000 in two browser WINDOWS side by side
```
Use two separate windows rather than two tabs: browsers slow down background tabs, which stalls the game. For two laptops, open `http://<your-laptop-ip>:8000` on the second one, or just use the GitHub Pages URL.

## How the networking works
- [PeerJS](https://peerjs.com) (WebRTC) connects the two browsers directly. PeerJS's free public broker is only used to find each other; game traffic goes browser-to-browser.
- The room creator is the **host**: their browser runs the authoritative game at 60 ticks/sec and sends snapshots ~30×/sec.
- The **guest** sends inputs every tick, predicts its own movement immediately (so controls feel instant), and reconciles with the host's snapshots. The other player and moving parts are interpolated ~100 ms behind for smoothness.
- Some strict networks (certain university/corporate Wi-Fi) block direct WebRTC connections. If joining hangs, try a phone hotspot; the long-term fix is adding a TURN server to the PeerJS config.

## Files
- `index.html`, `style.css` — page and lobby
- `client.js` — networking, host loop, guest prediction, rendering
- `shared/game.js` — game rules, physics and levels (shared by host and guest)

## Editing levels
Levels are ASCII maps in `shared/game.js` (34×25 tiles, legend at the top of the file). Gates and lifts go in each level's `platforms` list.

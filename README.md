# GhostTown

<img width="1672" height="941" alt="Ghost Town Character and Level Concept Sheet (1)" src="https://github.com/user-attachments/assets/9e44e308-449a-49d6-8946-15551281e9f1" />



A spooky two-player co-op platformer: Andy, a curly-haired boy, and his ghost explore a haunted temple. Play **together on one laptop** or **online across two laptops** over a direct peer-to-peer connection. It's a static site (plain HTML/JS, no build step, no server), so it runs on GitHub Pages.

## Play
- **One screen:** click **Single Screen**. Andy uses the arrow keys, his Ghost uses W A D.
- **Two laptops:** Player 1 picks Andy or His Ghost and clicks **Create room**, then sends the link (or the 4-letter code). Player 2 opens it and they're in. Each player can use arrows or WASD.
- **Enter** (or a click) after clearing a level moves both players on to the next one. **R** restarts the level, **M** toggles the music, **Esc** (or the ❚❚ button) opens the pause menu with Resume, Restart level and Main menu. Online, pausing pauses for both players.

## Levels
1. **The Haunted Hall**: hold the button to open the gate, pull the lever to raise the swing.
2. **The Haunted Hotel**: the pair splits up on floor 2. One holds the button so the other can slip past the gate, then the one who got through pulls the lever to lift the other up on the chain swing. On the top floor the corridors split: Andy wades the lava below while his Ghost floats through the black hole on the ledge above.

## Rules
- **Orange lava:** Andy can wade through it; it melts his Ghost.
- **Black hole:** his Ghost floats through it; it swallows Andy.
- **Witch's brew (green):** deadly to both.
- Andy collects **candy** (wrapped candy, lollipops, candy corn), his Ghost collects **pumpkins**. Each treat floats over the middle of a pit, so you have to wade through your own hazard to grab it.
- Glowing **buttons** open the iron gate while someone stands on one. The **lever** raises the chain swing.
- Both players standing in their own door (orange for Andy, blue for his Ghost) clears the level. If anyone dies, the level restarts for both.

Jumps are forgiving: tap for a short hop, hold for a full jump. You can still jump a moment after running off a ledge, and a jump pressed just before landing still counts.

## Test locally
Any static server works (opening `index.html` as a file won't):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
To test online mode on one machine, open two browser **windows** side by side. Don't use two tabs, because browsers slow down background tabs.

## How online play works
- [PeerJS](https://peerjs.com) (WebRTC) connects the two browsers directly. PeerJS's free public broker only helps them find each other.
- The room creator is the **host**: their browser runs the real game at 60 ticks/sec and sends snapshots ~30×/sec.
- The **guest** sends inputs every tick and predicts its own movement immediately, so controls feel instant. It corrects itself from the host's snapshots. The other player is drawn ~100 ms behind for smoothness.
- Some strict networks (certain university or office Wi-Fi) block direct WebRTC. If joining hangs, try a phone hotspot. The long-term fix is adding a TURN server.

## Files
- `index.html`, `style.css`: page and lobby
- `client.js`: modes (same laptop / host / guest), networking, game loop
- `render.js`: the art. The characters, doors, lanterns, banners, candles, graves, buttons, lever, swing, treats, spiders and bats are sprites in `assets/`, cut from the GhostTown design sheets. Stone, moss, pools, gate and sky are painted with canvas to match.
- `audio.js`: original music and sound effects, synthesized with Web Audio
- `shared/game.js`: rules, physics and levels

## Editing levels
Levels are ASCII maps in `shared/game.js` (34×25 tiles; the legend is at the top of the file). Gates and lifts go in each level's `platforms` list (a lift's `chainTop` sets where its chains hang from), lanterns, banners, candles and graves in `decor`. Add more entries to `LEVELS` for the next levels; the game moves on to them automatically.

Open `?level=2` to start straight on a level while testing (for example `http://localhost:8000/?level=2`). Online, the host's level is the one both players play.

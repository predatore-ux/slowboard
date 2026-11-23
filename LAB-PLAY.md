# Checkers lab preview

Open `play.html` on the same host as the existing Slowboard homepage. Its header
now links to the game. The homepage's 6 × 6 board is a live sensor monitor.

## Live homepage sensing

At `index.html#play`, choose **Connect live board** for USB testing with the existing
original-based revision 1 firmware. Close Serial Monitor first. The monitor reads
all 36 positions without sending lighting or game commands. Pieces already present
appear on the first complete report; lifts and placements update as reports arrive.
The firmware samples approximately every 200 ms, so gestures shorter than a sampling
interval may not be observed. The parser may add one report interval of latency.

During checkers, let the **game tab** own USB. Disconnect USB in the homepage monitor
before connecting in the game. Use **Open live sensor view** to open the homepage in
another tab; it automatically mirrors real sensor reports from the game, including
temporary lifts and positions that are not legal moves. Both tabs must use the same
site address and browser profile. This is a local browser stream, not a Wi-Fi or
remote internet feed. Simulator readings are never broadcast as hardware readings.

Green discs mean magnet detected; unmarked squares mean confirmed empty; question
marks mean unknown/unreadable. A failed PCB shows nine unknown cells. After two seconds
without reports the whole view becomes unknown. Presence alone cannot identify player
colour or kings. The homepage never changes accepted game state or turn lighting.

## Today: no hardware required

Choose **Two players on this screen**. Select a piece, then a highlighted destination
or a complete move-path button. The game enforces six starting pieces per player,
forward movement/capture for men, compulsory captures, complete chains, short kings,
promotion ending a turn, no-move defeat, and an 80-quiet-turn draw.

Choose **Physical-board simulator** to test the hardware flow. The small sensor grid
is the physical board; the large board is the accepted game state. Toggle B2 off and
A3 on, wait half a second, and confirm the physical move. Orange can then play A5–B4
on the large board. Play pauses until the physical grid matches. The alignment button
is a simulator convenience only; real hardware must be reconciled by moving pieces.

Check **Simulate Board 4 unavailable**. Nine cells become unknown and physical play
pauses. Repairing a connection must not convert those cells to empty squares or
invent moves. Uncheck and restore the expected arrangement to resume.

## After solder repair: USB integration

Keep the proven **SlowBoardConnectedTest original-based revision 1** firmware.
No new flash is required for this browser bridge. The abandoned spare controller is
not used. The original controller was last observed at COM6; identify it again if
Windows assigns another port.

1. Verify the solder repair with `follow`; all four sensor addresses must read.
2. Verify all 36 sensors and LEDs. For each PCB, local A1 must be bottom-left, A3
   top-left and C1 bottom-right. Quadrants are B1 bottom-left, B2 bottom-right,
   B3 top-left and B4 top-right from blue/player one's perspective. Only Board 1's
   three-point LED orientation and A1 sensor were confirmed before repair.
3. Arrange blue on A1 C1 E1 B2 D2 F2; orange on A5 C5 E5 B6 D6 F6.
4. Close Arduino Serial Monitor and any other program using the port.
5. Open the HTTPS-hosted page in desktop Chrome/Edge, or serve `dist` on localhost.
   Select Physical board over USB, confirm repair/calibration, and select the original
   ESP32 in the browser's USB serial chooser. The Web Serial API requires user choice.
6. If all readings match, blue's turn strip lights. Move a blue piece, complete any
   captures, then confirm the detected legal move on screen. Confirmation avoids
   treating temporary lifts or interrupted multi-jumps as completed moves.
7. Orange plays on the web board. Green square lights request placement; orange
   request removal. Move those physical pieces and remove captured pieces. Turn
   strips stay off while the boards differ. They resume once matching is confirmed.
8. Test captures, promotion, unplug/reconnect and Board 4 failure. Silence for two
   seconds pauses physical play. Restore the accepted position after reconnecting.

## Known limits

- This is one browser's authoritative game state, not a remote multiplayer service.
  Sessions are not saved across refresh. Wi-Fi firmware, authenticated backend,
  durable sessions, and play between separate browsers remain future work.
- USB reads existing text reports and sends existing `manual`, `off`, `led`, and
  `turn` commands. It waits for a sensor report before taking control, then sends
  one command at a time and waits for its exact firmware acknowledgement. A missing
  acknowledgement pauses physical play and requires disconnect/reconnect. The latest
  complete lighting frame replaces queued frames; commands never interleave.
  Normal Disconnect sends `off` before closing the port. Close the game connection
  before using Serial Monitor again.
- The USB path has been implemented and parser-tested, but live I/O with the repaired
  board has NOT been verified. A successful simulator test does not verify wiring.
- LEDs are guidance only; a person moves the pieces. Magnetic presence cannot verify
  piece colour or king identity. Follow the software's ownership and promotion state.
- The original firmware has no device-side connection watchdog: LEDs may retain their
  last indication if the browser/computer disconnects. The web game pauses, but retained
  lights are not proof of an active turn. A firmware watchdog is needed for Wi-Fi work.
- Use the USB path only with the confirmed original-based revision 1. Its `off` and
  manual mode semantics are required; the untouched original test sketch overwrites
  LED commands during polling and is not suitable for this bridge.

## Developer checks

```text
node --test tests/*.test.mjs
python -m http.server 4390 --bind 127.0.0.1 --directory dist
```

Implementation reference: https://developer.chrome.com/docs/capabilities/serial/

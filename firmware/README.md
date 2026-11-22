# Slowboard hardware integration

## Current milestone: diagnostic firmware

`SlowboardDiagnostics/SlowboardDiagnostics.ino` is a separate sketch for the second
ESP32-WROOM-32E development board. The original Downloads/SlowBoardTest.ino is unchanged.
This milestone is NOT Wi-Fi firmware or a playable checkers implementation.

### Confirmed configuration

| Signal | ESP32 GPIO / configuration |
| --- | --- |
| Board LED data | 21; 36 pixels; GRB, 800 kHz |
| Sensor bus | SDA 19, SCL 18; 100 kHz |
| Player one strip | 25; 7 pixels |
| Player two strip | 26; 7 pixels |
| Sensor addresses | 0x20, 0x22, 0x24, 0x26 |
| Sensor inputs | Register 0 bits 2,1,0; register 1 bits 7,6,5,4,3,2; active low |

Board order follows the supplied sketch: bottom left, bottom right, top left, top right.
Each board has LED offsets 0, 9, 18, 27 and local sensor order A1,A2,A3,B1,B2,B3,C1,C2,C3.
These labels are a hypothesis for physical orientation, not a completed calibration.
The additional strips use the same LED protocol as the board pixels provisionally;
verify red, green and blue before accepting their colour order.

### What changed

- Sensor reads continue during LED testing; no animation `delay()` calls.
- Manual/follow modes prevent automatic reads from overwriting `off`, `led`, or `all`.
- Each sensor must remain stable for 60 ms before a new state is accepted.
- A failed PCB read produces unknown states (`null`), never 9 invented removals.
- Recovery establishes fresh baselines instead of interpreting reconnection as moves.
- JSON snapshots every second allow a future transport to resynchronise.
- Bounded serial commands and I2C transaction timeouts.
- All lights start off. Default brightness 24/255; diagnostic maximum 64/255.
- Original pixel colours are retained separately so brightness changes can be redrawn.

The expander is read with the original register protocol. No configuration registers
are written until its exact model is known. A build passing cannot confirm wiring,
voltage levels, power capacity, sensor operation or coordinate orientation.

### Build and use

Arduino IDE: open the sketch folder, select ESP32 Dev Module (Espressif ESP32 core),
and install Adafruit NeoPixel. Serial Monitor: 115200 baud, Newline ending.

CLI example:

```text
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/SlowboardDiagnostics
```

Choose the second ESP32's port by unplug/replug identification before uploading.
The code has not been flashed by the assistant. Confirm the external adapter rating
and carrier-board USB/external-power arrangement before powering through both sources.
The firmware brightness cap is not a substitute for checking the power supply.

Run these tests in order:

1. `status`: all four `online` flags should be true; after stabilisation there should
   be 36 booleans and no nulls. Do not proceed to game detection with unknown cells.
2. `follow`: place and remove a magnet at every position. Confirm the matching LED
   and sensor index. Amber indicates unknown input, white indicates occupied.
3. `off`: all board pixels and both turn strips stay dark while sensor reports continue.
4. `sweep`: one white board pixel steps through 0–35, then all board pixels turn off.
5. `led 0 255 0 0`, then green and blue variants: confirm colour order and index.
6. `turn 1`: only GPIO 25 strip is blue. `turn 2`: only GPIO 26 strip is orange.
   `turn 0`: both turn indicators off. Each should illuminate all seven pixels.
7. Save the Serial Monitor output and record physical coordinates for each index.

Commands: `help`, `status`, `follow`, `manual`, `off`, `sweep`, `turn 0|1|2`,
`bright 0..64`, `led INDEX R G B`, `all R G B`. RGB components must be 0..255.
Manual player selection only tests indicators; it does not validate or advance a game.

### Event contract for the web integration

Newline-delimited JSON, protocol 1. The snapshot is authoritative for occupancy,
not game state. Array order is hardware index, not row-major 6x6 coordinates.

- `boot`: firmware/protocol version. Invalidate any previous connection baseline.
- `sensor`: index, occupied boolean, baseline boolean. Baselines must not become moves.
- `snapshot`: revision, uptime, four online flags, 36 occupied values, player, mode.
  Unknown input is null. Revision restarts after reboot; it is not a game revision.
- `ok` / `error`: diagnostic command responses.

A placement/removal event alone is NOT a legal move. Piece identity, player, kings,
captures, turn and board reconciliation belong to the shared checkers game state.

## Next integration milestone

Selected game: 6x6 checkers. Proposed variant: six pieces each on the first two dark
rows; player one starts; men move/capture diagonally forward; mandatory captures;
chained jumps; short kings move/capture both directions; promotion ends the move.
Confirm this variant before treating it as the final game rules.

Target flow:

1. Pair a physical board and a browser player into one authenticated game session.
2. Server holds the authoritative board, player ownership, kings, turn and revision.
3. Stable physical changes create a proposed move only after setup/calibration matches.
4. Server validates the proposal, accepts once and broadcasts the updated game state.
5. A browser move lights the physical source, destination and any captured pieces.
6. A person makes that move on the physical board. Sensors confirm the expected
   occupancy before the next physical turn is enabled. No mechanical movement exists.
7. Offline, unknown-input and mismatched-board states pause play and require resync;
   reconnecting must not repeat moves or advance a turn twice.

The current landing-page grid is an illustrative demo. It needs a real game screen,
game rules, and transport integration. Static GitHub Pages alone is not the shared
authoritative game server. Backend hosting and device credentials are still to be set up.

References used for the diagnostic implementation:
- https://docs.espressif.com/projects/arduino-esp32/en/latest/api/i2c.html
- https://learn.adafruit.com/adafruit-neopixel-uberguide/arduino-library-use

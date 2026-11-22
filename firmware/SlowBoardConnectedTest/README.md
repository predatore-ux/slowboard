# Original-based revision 1

This standalone .ino is derived from the user's working SlowBoardTest.ino.
It does not require Hardware.h. It is a hardware test revision, not yet a
network-connected game. The original source is backed up in
../SlowBoardOriginal/SlowBoardOriginal.ino; the Downloads original is unchanged.

Preserved: GPIO 21 board LED chain, SDA 19/SCL 18, four I2C addresses,
all sensor bit mappings, LED order, active-low detection, 200 ms polling,
board brightness 60, startup sweep and automatic magnet-follow lighting.

Added:
- GPIO 25: seven player-one pixels; GPIO 26: seven player-two pixels.
- `turn 1`: first strip blue; `turn 2`: second strip orange; `turn 0`: both off.
  Turn strips use GRB/800 kHz provisionally and brightness 24. Verify actual colours.
- `off`, `led` and `all` enter manual lighting mode so polling cannot override them.
  Sensor reporting continues. `follow` or `hall` restores automatic sensor lighting.
- Commands accept Newline, Carriage Return or both. Command length is bounded.
- I2C transaction timeout of 20 ms.

The original sequential animation remains blocking in this deliberately small first
revision. There is no debounce, game logic, Wi-Fi, web synchronisation or automatic
turn advancement yet. Manual turn commands only test the indicators.

Open SlowBoardConnectedTest.ino in Arduino IDE; select ESP32 Dev Module and the
original controller's verified serial port (last observed COM6). Do not select the
unresponsive spare on COM7. Compilation does not upload firmware.

After upload, open Serial Monitor at 115200 baud. Look for:
`SlowBoard original-based revision 1 starting`

Test in order:
1. Place/remove a piece: original square lighting must still work.
2. `turn 1`: only player one's seven pixels light blue.
3. `turn 2`: only player two's seven pixels light orange.
4. `off`: all board and turn pixels turn off and remain off even over a magnet.
5. `follow`: square lighting responds to magnets again.

If sensor or LED mapping differs, restore the backed-up original sketch before
changing wiring. Record which tests pass before proceeding to coordinate mapping
and checkers integration. Do not treat raw presence readings as identified pieces.

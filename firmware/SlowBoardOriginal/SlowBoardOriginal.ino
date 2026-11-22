#include <Wire.h>
#include <Adafruit_NeoPixel.h>

constexpr uint8_t LED_PIN = 21;
constexpr uint8_t NUM_BOARDS = 4;
constexpr uint8_t LEDS_PER_BOARD = 9;
constexpr uint16_t NUM_LEDS = NUM_BOARDS * LEDS_PER_BOARD;

constexpr uint8_t SDA_PIN = 19;
constexpr uint8_t SCL_PIN = 18;

constexpr uint8_t REG_INPUT_PORT0 = 0x00;
constexpr uint8_t REG_INPUT_PORT1 = 0x01;

struct BoardConfig {
  const char* label;
  uint8_t i2cAddr;
  uint16_t ledOffset;
};

struct LocalHallMapping {
  const char* localName;
  uint8_t portReg;
  uint8_t bitMask;
  uint8_t localLedIndex;
};

// Board 1: bottom left (0x20), Board 2: bottom right (0x22)
// Board 3: top left (0x24), Board 4: top right (0x26)
constexpr BoardConfig BOARDS[NUM_BOARDS] = {
  {"B1_BL", 0x20, 0},
  {"B2_BR", 0x22, 9},
  {"B3_TL", 0x24, 18},
  {"B4_TR", 0x26, 27}
};

constexpr LocalHallMapping LOCAL_SENSORS[LEDS_PER_BOARD] = {
  {"HALL_A1", REG_INPUT_PORT0, (1 << 2), 0},
  {"HALL_A2", REG_INPUT_PORT0, (1 << 1), 1},
  {"HALL_A3", REG_INPUT_PORT0, (1 << 0), 2},
  {"HALL_B1", REG_INPUT_PORT1, (1 << 7), 3},
  {"HALL_B2", REG_INPUT_PORT1, (1 << 6), 4},
  {"HALL_B3", REG_INPUT_PORT1, (1 << 5), 5},
  {"HALL_C1", REG_INPUT_PORT1, (1 << 4), 6},
  {"HALL_C2", REG_INPUT_PORT1, (1 << 3), 7},
  {"HALL_C3", REG_INPUT_PORT1, (1 << 2), 8}
};

Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

uint8_t defaultBrightness = 60;
uint8_t detectR = 255;
uint8_t detectG = 255;
uint8_t detectB = 255;

String serialBuffer = "";
unsigned long lastPollMs = 0;
constexpr unsigned long POLL_INTERVAL_MS = 200;

bool readRegister(uint8_t i2cAddr, uint8_t reg, uint8_t& value) {
  Wire.beginTransmission(i2cAddr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }
  if (Wire.requestFrom(i2cAddr, static_cast<uint8_t>(1)) != 1) {
    return false;
  }
  value = Wire.read();
  return true;
}

void lightLedsSequentially(uint32_t color, uint16_t stepDelayMs) {
  strip.clear();
  for (uint16_t i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, color);
    strip.show();
    delay(stepDelayMs);
  }
}

void updateSensorsAndLeds() {
  bool anyDetected = false;
  Serial.print("Detected magnets: ");

  strip.clear();
  uint32_t detectColor = strip.Color(detectR, detectG, detectB);

  for (uint8_t b = 0; b < NUM_BOARDS; b++) {
    uint8_t port0 = 0;
    uint8_t port1 = 0;

    if (!readRegister(BOARDS[b].i2cAddr, REG_INPUT_PORT0, port0) ||
        !readRegister(BOARDS[b].i2cAddr, REG_INPUT_PORT1, port1)) {
      Serial.printf("\nError: Failed to read %s (0x%02X).", BOARDS[b].label, BOARDS[b].i2cAddr);
      continue;
    }

    for (uint8_t s = 0; s < LEDS_PER_BOARD; s++) {
      uint8_t regVal = (LOCAL_SENSORS[s].portReg == REG_INPUT_PORT0) ? port0 : port1;
      bool magnetPresent = ((regVal & LOCAL_SENSORS[s].bitMask) == 0);
      if (magnetPresent) {
        uint16_t globalLedIdx = BOARDS[b].ledOffset + LOCAL_SENSORS[s].localLedIndex;
        strip.setPixelColor(globalLedIdx, detectColor);

        if (anyDetected) {
          Serial.print(", ");
        }
        Serial.printf("%s_%s", BOARDS[b].label, LOCAL_SENSORS[s].localName);
        anyDetected = true;
      }
    }
  }

  strip.show();

  if (!anyDetected) {
    Serial.print("None");
  }
  Serial.println();
}

uint8_t clampByte(int val) {
  if (val < 0) return 0;
  if (val > 255) return 255;
  return static_cast<uint8_t>(val);
}

void printHelp() {
  Serial.println("Commands (36 LEDs across 4 boards):");
  Serial.println("  led <0..35> <r> <g> <b>   Set one LED color");
  Serial.println("  all <r> <g> <b>           Set all LEDs to one color");
  Serial.println("  detect <r> <g> <b>        Set default magnet detection color");
  Serial.println("  bright <0..255>           Set default brightness");
  Serial.println("  off                       Turn all LEDs off");
  Serial.println("  seq <r> <g> <b> [ms]      Sweep LEDs sequentially");
  Serial.println("  hall                      Read Hall sensors and update LEDs");
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  if (line.equalsIgnoreCase("help")) {
    printHelp();
    return;
  }

  if (line.equalsIgnoreCase("off")) {
    strip.clear();
    strip.show();
    Serial.println("All LEDs turned off.");
    return;
  }

  if (line.equalsIgnoreCase("hall")) {
    updateSensorsAndLeds();
    return;
  }

  int idx = 0, r = 0, g = 0, b = 0, brightnessVal = 0, delayMs = 80;

  if (sscanf(line.c_str(), "detect %d %d %d", &r, &g, &b) == 3) {
    detectR = clampByte(r);
    detectG = clampByte(g);
    detectB = clampByte(b);
    Serial.printf("Default detection color set to RGB(%u, %u, %u).\n", detectR, detectG, detectB);
    updateSensorsAndLeds();
    return;
  }

  if (sscanf(line.c_str(), "bright %d", &brightnessVal) == 1) {
    if (brightnessVal < 0 || brightnessVal > 255) {
      Serial.println("Error: Brightness must be 0 to 255.");
      return;
    }
    defaultBrightness = static_cast<uint8_t>(brightnessVal);
    strip.setBrightness(defaultBrightness);
    strip.show();
    Serial.printf("Default brightness set to %u.\n", defaultBrightness);
    return;
  }

  if (sscanf(line.c_str(), "led %d %d %d %d", &idx, &r, &g, &b) == 4) {
    if (idx < 0 || idx >= static_cast<int>(NUM_LEDS)) {
      Serial.println("Error: LED index must be 0 to 35.");
      return;
    }
    uint8_t cr = clampByte(r);
    uint8_t cg = clampByte(g);
    uint8_t cb = clampByte(b);
    strip.setPixelColor(static_cast<uint16_t>(idx), strip.Color(cr, cg, cb));
    strip.show();
    Serial.printf("LED %d set to RGB(%u, %u, %u)\n", idx, cr, cg, cb);
    return;
  }

  if (sscanf(line.c_str(), "all %d %d %d", &r, &g, &b) == 3) {
    uint8_t cr = clampByte(r);
    uint8_t cg = clampByte(g);
    uint8_t cb = clampByte(b);
    strip.fill(strip.Color(cr, cg, cb), 0, NUM_LEDS);
    strip.show();
    Serial.printf("All LEDs set to RGB(%u, %u, %u)\n", cr, cg, cb);
    return;
  }

  int matchedSeq = sscanf(line.c_str(), "seq %d %d %d %d", &r, &g, &b, &delayMs);
  if (matchedSeq == 3 || matchedSeq == 4) {
    uint8_t cr = clampByte(r);
    uint8_t cg = clampByte(g);
    uint8_t cb = clampByte(b);
    if (delayMs < 1) delayMs = 1;
    lightLedsSequentially(strip.Color(cr, cg, cb), static_cast<uint16_t>(delayMs));
    Serial.printf("Sequential sweep complete with RGB(%u, %u, %u).\n", cr, cg, cb);
    return;
  }

  Serial.println("Unknown command. Type 'help' for usage.");
}

void processSerialInput() {
  while (Serial.available() > 0) {
    char c = static_cast<char>(Serial.read());
    if (c == '\n') {
      handleCommand(serialBuffer);
      serialBuffer = "";
    } else if (c != '\r') {
      serialBuffer += c;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);

  strip.begin();
  strip.setBrightness(defaultBrightness);
  lightLedsSequentially(strip.Color(0, 150, 255), 80);

  printHelp();
  updateSensorsAndLeds();
}

void loop() {
  processSerialInput();

  unsigned long now = millis();
  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    updateSensorsAndLeds();
  }
}
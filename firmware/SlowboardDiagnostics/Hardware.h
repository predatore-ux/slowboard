#pragma once
#include <Arduino.h>
// Derived from the working SlowBoardTest.ino; strip pins/counts confirmed by user.
constexpr uint8_t SDA_PIN = 19, SCL_PIN = 18, BOARD_LED_PIN = 21;
constexpr uint8_t TURN_PINS[] = {25, 26};
constexpr uint16_t TURN_COUNTS[] = {7, 7};
constexpr uint8_t ADDRESSES[] = {0x20, 0x22, 0x24, 0x26};
constexpr uint8_t PORTS[] = {0,0,0,1,1,1,1,1,1};
constexpr uint8_t MASKS[] = {4,2,1,128,64,32,16,8,4};
constexpr uint16_t POSITION_COUNT = 36;
constexpr uint32_t DEBOUNCE_MS = 60;
struct SensorState {
  bool candidate = false, occupied = false, valid = false, sampled = false;
  uint32_t since = 0;
};

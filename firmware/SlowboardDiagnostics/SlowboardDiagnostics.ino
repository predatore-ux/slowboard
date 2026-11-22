#include <Wire.h>
#include <Adafruit_NeoPixel.h>
#include "Hardware.h"

// Diagnostics only: no autonomous game decisions, network credentials or expander writes.
Adafruit_NeoPixel boardLeds(36, BOARD_LED_PIN, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel playerOne(7, TURN_PINS[0], NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel playerTwo(7, TURN_PINS[1], NEO_GRB + NEO_KHZ800);
SensorState sensors[36];
bool online[4] = {}, busReady = false;
bool followSensors = false, sweepActive = false, dirty = true;
uint32_t manualColors[36] = {};
uint8_t brightness = 24, currentPlayer = 0, sweepIndex = 0, nextBoard = 0;
uint32_t lastPoll = 0, lastSnapshot = 0, lastSweep = 0, revision = 0;
char input[96];
uint8_t inputLength = 0;
bool inputOverflow = false;

bool readPort(uint8_t address, uint8_t port, uint8_t &value) {
  if (!busReady) return false;
  Wire.beginTransmission(address);
  Wire.write(port);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address, uint8_t(1)) != 1) return false;
  value = Wire.read();
  return true;
}

void snapshot() {
  Serial.printf("{\"type\":\"snapshot\",\"revision\":%lu,\"uptime\":%lu,\"online\":[",
                (unsigned long)revision, (unsigned long)millis());
  for (uint8_t b=0;b<4;b++) { if(b) Serial.print(','); Serial.print(online[b] ? "true" : "false"); }
  Serial.print("],\"occupied\":[");
  for (uint8_t i=0;i<36;i++) {
    if (i) Serial.print(',');
    Serial.print(!sensors[i].valid ? "null" : (sensors[i].occupied ? "true" : "false"));
  }
  Serial.printf("],\"player\":%u,\"mode\":\"%s\"}\n",currentPlayer,followSensors?"follow":"manual");
}

void pollBoard(uint8_t b, uint32_t now) {
  uint8_t p0=0,p1=0;
  const bool ok=readPort(ADDRESSES[b],0,p0) && readPort(ADDRESSES[b],1,p1);
  bool changed=(online[b]!=ok);
  online[b]=ok;
  for (uint8_t s=0;s<9;s++) {
    const uint8_t id=b*9+s;
    SensorState &state=sensors[id];
    if (!ok) {
      changed |= state.valid;
      state.valid=false; state.sampled=false;
      continue;
    }
    const bool present=((PORTS[s]==0?p0:p1)&MASKS[s])==0;
    if (!state.sampled || present!=state.candidate) {
      state.sampled=true; state.candidate=present; state.since=now;
    }
    if (now-state.since>=DEBOUNCE_MS && (!state.valid || state.occupied!=present)) {
      const bool baseline=!state.valid;
      state.valid=true; state.occupied=present; changed=true;
      Serial.printf("{\"type\":\"sensor\",\"index\":%u,\"occupied\":%s,\"baseline\":%s}\n",
                    id,present?"true":"false",baseline?"true":"false");
    }
  }
  if(changed) { revision++; dirty=true; snapshot(); }
}

uint32_t scaled(uint32_t color) {
  return boardLeds.Color(((color>>16)&255)*brightness/255,
                         ((color>>8)&255)*brightness/255,(color&255)*brightness/255);
}

void renderLeds() {
  for (uint8_t i=0;i<36;i++) {
    uint32_t color=manualColors[i];
    if(followSensors) color=!sensors[i].valid ? 0x180800 : (sensors[i].occupied ? 0xFFFFFF : 0);
    if(sweepActive) color=i==sweepIndex ? 0xFFFFFF : 0;
    boardLeds.setPixelColor(i,scaled(color));
  }
  boardLeds.show();
  playerOne.fill(currentPlayer==1 ? scaled(0x7C90BB) : 0);
  playerTwo.fill(currentPlayer==2 ? scaled(0xFA4E0A) : 0);
  playerOne.show(); playerTwo.show(); dirty=false;
}

void acknowledge() { Serial.println("{\"type\":\"ok\"}"); }
void command(char *line) {
  int index=0,r=0,g=0,b=0,end=0;
  if(!strcmp(line,"status")) { snapshot(); return; }
  if(!strcmp(line,"help")) {
    Serial.println("{\"type\":\"help\",\"commands\":[\"status\",\"follow\",\"manual\",\"off\",\"sweep\",\"turn 0|1|2\",\"bright 0..64\",\"led INDEX R G B\",\"all R G B\"]}");
    return;
  }
  if(!strcmp(line,"follow")) { followSensors=true; sweepActive=false; }
  else if(!strcmp(line,"manual")) { followSensors=false; sweepActive=false; }
  else if(!strcmp(line,"off")) {
    followSensors=false; sweepActive=false; currentPlayer=0;
    memset(manualColors,0,sizeof(manualColors));
  }
  else if(!strcmp(line,"sweep")) {
    followSensors=false; sweepActive=true; sweepIndex=0; lastSweep=millis();
    memset(manualColors,0,sizeof(manualColors));
  }
  else if(sscanf(line,"turn %d%n",&index,&end)==1 && line[end]=='\0' && index>=0 && index<=2) currentPlayer=index;
  else if(sscanf(line,"bright %d%n",&index,&end)==1 && line[end]=='\0' && index>=0 && index<=64) brightness=index;
  else if(sscanf(line,"led %d %d %d %d%n",&index,&r,&g,&b,&end)==4 && line[end]=='\0'
          && index>=0 && index<36 && r>=0 && r<=255 && g>=0 && g<=255 && b>=0 && b<=255) {
    followSensors=false; sweepActive=false; manualColors[index]=boardLeds.Color(r,g,b);
  }
  else if(sscanf(line,"all %d %d %d%n",&r,&g,&b,&end)==3 && line[end]=='\0'
          && r>=0 && r<=255 && g>=0 && g<=255 && b>=0 && b<=255) {
    followSensors=false; sweepActive=false;
    for(uint8_t i=0;i<36;i++) manualColors[i]=boardLeds.Color(r,g,b);
  }
  else { Serial.println("{\"type\":\"error\",\"message\":\"Invalid command or value\"}"); return; }
  dirty=true; acknowledge();
}

void serialInput() {
  // Bound work per loop so a long incoming stream cannot starve sensor polling.
  for(uint8_t n=0;n<64 && Serial.available();n++) {
    const char c=Serial.read();
    if(c=='\r') continue;
    if(c=='\n') {
      if(inputOverflow) Serial.println("{\"type\":\"error\",\"message\":\"Command too long\"}");
      else if(inputLength) { input[inputLength]='\0'; command(input); }
      inputLength=0; inputOverflow=false;
    } else if(inputLength<sizeof(input)-1 && !inputOverflow) input[inputLength++]=c;
    else inputOverflow=true;
  }
}

void setup() {
  Serial.begin(115200);
  busReady=Wire.begin(SDA_PIN,SCL_PIN,100000);
  Wire.setTimeOut(20);
  boardLeds.begin(); playerOne.begin(); playerTwo.begin();
  renderLeds(); // No bright startup animation; all LEDs start off.
  Serial.println("{\"type\":\"boot\",\"firmware\":\"slowboard-diagnostics-0.1\",\"protocol\":1}");
}

void loop() {
  serialInput();
  const uint32_t now=millis();
  if(now-lastPoll>=10) { lastPoll=now; pollBoard(nextBoard,now); nextBoard=(nextBoard+1)%4; }
  if(sweepActive && now-lastSweep>=180) {
    lastSweep=now;
    if(++sweepIndex>=36) sweepActive=false;
    dirty=true;
  }
  if(dirty) renderLeds();
  if(now-lastSnapshot>=1000) { lastSnapshot=now; snapshot(); }
}

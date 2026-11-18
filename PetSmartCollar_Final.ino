
#include <Wire.h>
#include <TinyGPSPlus.h>
#include <math.h>

// Max's Smart Pet Collar
// ESP32 + GPS + MPU6050 + buzzer + BOOT mute button

#define MPU_ADDR 0x68
#define SDA_PIN 21
#define SCL_PIN 22

// GPS UART2: GPS TX -> ESP32 D26, GPS RX -> ESP32 D27
#define GPS_RX 26
#define GPS_TX 27

#define BUZZER_PIN 25
#define BOOT_BUTTON_PIN 0

const float MIN_SPEED_FOR_ALERT_KMH = 8.0;
const float UNUSUAL_MULTIPLIER = 1.8;
const float MIN_SPEED_MARGIN_KMH = 4.0;
const float RESET_RATIO = 1.25;

const unsigned long GPS_FRESH_MS = 5000;
const unsigned long MPU_FRESH_MS = 1500;
const unsigned long BUTTON_DEBOUNCE_MS = 40;
const unsigned long BUZZER_ON_MS = 250;
const unsigned long BUZZER_OFF_MS = 500;

const int AVG_SAMPLES = 12;

TinyGPSPlus gps;

float avgSamples[AVG_SAMPLES];
int avgCount = 0;
int avgIndex = 0;

float averageSpeedKmh = 0.0;
float currentSpeedKmh = 0.0;

bool mpuOK = false;
bool mpuMoving = false;

unsigned long lastMpuMotionMs = 0;
unsigned long lastMpuReadMs = 0;

bool unusualMovement = false;
bool buzzerMuted = false;
bool buzzerOutputOn = false;

unsigned long buzzerPhaseStart = 0;
unsigned long lastButtonChange = 0;
unsigned long lastJsonMs = 0;
unsigned long lastAverageSampleMs = 0;
unsigned long lastGpsDebugMs = 0;

bool lastButtonReading = HIGH;
bool stableButtonState = HIGH;
bool buttonPressedEvent = false;

// ---------------- MPU6050 ----------------

bool readMPU(int16_t &ax, int16_t &ay, int16_t &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom(MPU_ADDR, 6) != 6) {
    return false;
  }

  ax = (int16_t)(((uint16_t)Wire.read() << 8) | Wire.read());
  ay = (int16_t)(((uint16_t)Wire.read() << 8) | Wire.read());
  az = (int16_t)(((uint16_t)Wire.read() << 8) | Wire.read());

  return true;
}

void updateMPU() {
  if (millis() - lastMpuReadMs < 50) return;

  lastMpuReadMs = millis();

  int16_t ax, ay, az;

  if (!readMPU(ax, ay, az)) {
    mpuOK = false;
    mpuMoving = false;
    return;
  }

  mpuOK = true;

  static float prevX = 0;
  static float prevY = 0;
  static float prevZ = 0;
  static bool first = true;

  float delta = 0;

  if (!first) {
    delta = sqrtf(
      (ax - prevX) * (float)(ax - prevX) +
      (ay - prevY) * (float)(ay - prevY) +
      (az - prevZ) * (float)(az - prevZ)
    );
  }

  prevX = ax;
  prevY = ay;
  prevZ = az;
  first = false;

  if (delta > 1800.0) {
    lastMpuMotionMs = millis();
  }

  mpuMoving = (millis() - lastMpuMotionMs) < MPU_FRESH_MS;
}

// ---------------- GPS ----------------

void updateGPS() {
  while (Serial2.available()) {
    char c = Serial2.read();

    // Decode GPS data
    gps.encode(c);

    // Print raw GPS characters for diagnosis
    Serial.write(c);
  }

  // Print GPS diagnostic information every 3 seconds
  if (millis() - lastGpsDebugMs >= 3000) {
    lastGpsDebugMs = millis();

    Serial.println();
    Serial.print("[GPS] Characters received: ");
    Serial.println(gps.charsProcessed());

    Serial.print("[GPS] Satellites: ");

    if (gps.satellites.isValid()) {
      Serial.println(gps.satellites.value());
    } else {
      Serial.println("Not available");
    }

    Serial.print("[GPS] Location valid: ");
    Serial.println(gps.location.isValid() ? "YES" : "NO");
  }
}

bool isGPSConnected() {
  // Recent characters are a better indication of active communication
  return gps.charsProcessed() > 0 &&
         gps.location.age() < GPS_FRESH_MS;
}

bool isGPSValid() {
  return gps.location.isValid() &&
         gps.location.age() < GPS_FRESH_MS &&
         gps.satellites.isValid() &&
         gps.satellites.value() >= 4;
}

// ---------------- Average Speed ----------------

void addAverageSample(float speed) {
  if (speed < 1.0 || unusualMovement) return;

  if (millis() - lastAverageSampleMs < 1000) return;

  lastAverageSampleMs = millis();

  avgSamples[avgIndex] = speed;
  avgIndex = (avgIndex + 1) % AVG_SAMPLES;

  if (avgCount < AVG_SAMPLES) {
    avgCount++;
  }

  float sum = 0;

  for (int i = 0; i < avgCount; i++) {
    sum += avgSamples[i];
  }

  averageSpeedKmh = sum / avgCount;
}

// ---------------- Speed Detection ----------------

void updateSpeedLogic() {
  bool speedValid = isGPSValid() &&
                    gps.speed.isValid() &&
                    gps.speed.age() < GPS_FRESH_MS;

  if (!speedValid) {
    currentSpeedKmh = 0.0;
    unusualMovement = false;
    return;
  }

  currentSpeedKmh = gps.speed.kmph();

  bool baselineReady = avgCount >= 5;

  bool speedIsUnusual =
    baselineReady &&
    currentSpeedKmh >= MIN_SPEED_FOR_ALERT_KMH &&
    currentSpeedKmh > averageSpeedKmh * UNUSUAL_MULTIPLIER &&
    currentSpeedKmh > averageSpeedKmh + MIN_SPEED_MARGIN_KMH;

  unusualMovement = speedIsUnusual && mpuMoving;

  if (!unusualMovement) {
    addAverageSample(currentSpeedKmh);
  }

  if (baselineReady &&
      currentSpeedKmh <= max(2.0f, averageSpeedKmh * RESET_RATIO)) {
    buzzerMuted = false;
  }
}

// ---------------- BOOT Button ----------------

void updateBootButton() {
  bool reading = digitalRead(BOOT_BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastButtonChange = millis();
  }

  if (millis() - lastButtonChange > BUTTON_DEBOUNCE_MS) {
    if (reading != stableButtonState) {
      stableButtonState = reading;

      if (stableButtonState == LOW) {
        buttonPressedEvent = true;
        buzzerMuted = true;

        noTone(BUZZER_PIN);
        buzzerOutputOn = false;
      }
    }
  }

  lastButtonReading = reading;
}

// ---------------- Buzzer ----------------

void updateBuzzer() {
  if (!unusualMovement || buzzerMuted) {
    noTone(BUZZER_PIN);
    buzzerOutputOn = false;
    buzzerPhaseStart = millis();
    return;
  }

  unsigned long elapsed = millis() - buzzerPhaseStart;

  if (buzzerOutputOn) {
    if (elapsed >= BUZZER_ON_MS) {
      noTone(BUZZER_PIN);
      buzzerOutputOn = false;
      buzzerPhaseStart = millis();
    }
  } else {
    if (elapsed >= BUZZER_OFF_MS) {
      tone(BUZZER_PIN, 2000);
      buzzerOutputOn = true;
      buzzerPhaseStart = millis();
    }
  }
}

// ---------------- JSON Telemetry ----------------

void printJSON() {
  bool gpsValid = isGPSValid();

  bool speedValid = gpsValid &&
                    gps.speed.isValid() &&
                    gps.speed.age() < GPS_FRESH_MS;

  Serial.print("{\"type\":\"telemetry\"");

  Serial.print(",\"mpu_ok\":");
  Serial.print(mpuOK ? "true" : "false");

  Serial.print(",\"mpu_connected\":");
  Serial.print(mpuOK ? "true" : "false");

  Serial.print(",\"gps_connected\":");
  Serial.print(isGPSConnected() ? "true" : "false");

  Serial.print(",\"gps_valid\":");
  Serial.print(gpsValid ? "true" : "false");

  Serial.print(",\"latitude\":");
  if (gpsValid) Serial.print(gps.location.lat(), 6);
  else Serial.print("null");

  Serial.print(",\"longitude\":");
  if (gpsValid) Serial.print(gps.location.lng(), 6);
  else Serial.print("null");

  Serial.print(",\"satellites\":");
  Serial.print(gps.satellites.isValid() ? gps.satellites.value() : 0);

  Serial.print(",\"speed_kmh\":");
  Serial.print(speedValid ? currentSpeedKmh : 0.0, 2);

  Serial.print(",\"avg_speed_kmh\":");
  Serial.print(averageSpeedKmh, 2);

  Serial.print(",\"average_ready\":");
  Serial.print(avgCount >= 5 ? "true" : "false");

  Serial.print(",\"unusual_movement\":");
  Serial.print(unusualMovement ? "true" : "false");

  Serial.print(",\"activity\":\"");
  Serial.print(
    unusualMovement ? "UNUSUAL_SPEED" :
    (mpuMoving ? "MOVEMENT" : "NORMAL")
  );
  Serial.print("\"");

  Serial.print(",\"buzzer_on\":");
  Serial.print(buzzerOutputOn ? "true" : "false");

  Serial.print(",\"buzzer_muted\":");
  Serial.print(buzzerMuted ? "true" : "false");

  Serial.print(",\"button_pressed\":");
  Serial.print(buttonPressedEvent ? "true" : "false");

  Serial.println("}");

  buttonPressedEvent = false;
}

// ---------------- Setup ----------------

void setup() {
  Serial.begin(115200);

  Wire.begin(SDA_PIN, SCL_PIN);

  Serial2.begin(
    9600,
    SERIAL_8N1,
    GPS_RX,
    GPS_TX
  );

  pinMode(BUZZER_PIN, OUTPUT);
  noTone(BUZZER_PIN);

  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission();

  delay(200);

  Serial.println();
  Serial.println("MAX SMART COLLAR STARTED");
  Serial.println("GPS UART2: RX D26, TX D27, 9600 baud");
  Serial.println("Waiting for GPS data...");
}

// ---------------- Main Loop ----------------

void loop() {
  updateGPS();

  updateMPU();
  updateBootButton();
  updateSpeedLogic();
  updateBuzzer();

  if (millis() - lastJsonMs >= 1000) {
    printJSON();
    lastJsonMs = millis();
  }

  delay(10);
}

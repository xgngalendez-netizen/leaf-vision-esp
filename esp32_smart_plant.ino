/*
  Smart Plant Vision - ESP32 Camera + Sensors
  Combined ESP32-CAM with environmental sensors
  
  Connections:
  - DHT22: Pin 2
  - Soil Moisture: A0 (analog pin)
  - LED: Pin 4 (built-in on ESP32-CAM)
*/

const char* ssid = "YOUR_WIFI_NAME";     // Change this!
const char* password = "YOUR_WIFI_PASSWORD"; // Change this!

#include "esp_wifi.h"
#include "esp_camera.h"
#include <WiFi.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <DHT.h>
#include <ArduinoJson.h>

#define CAMERA_MODEL_AI_THINKER

// Camera pins (ESP32-CAM AI Thinker)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define LED               4

// Sensor pins - adjust if needed
#define DHT_PIN           2      // DHT22 data pin
#define DHT_TYPE          DHT22  // DHT22 sensor type
#define SOIL_MOISTURE_PIN 35     // Soil moisture analog pin (shared with Y9, be careful!)

DHT dht(DHT_PIN, DHT_TYPE);

// Sensor variables
float temperature = 0.0;
float humidity = 0.0;
int soilMoisture = 0;
unsigned long lastSensorRead = 0;
const unsigned long sensorInterval = 5000; // Read sensors every 5 seconds

void startCameraServer();
extern int gpLed = 4;

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Prevent brownouts
  
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();
  Serial.println("🌱 Smart Plant Vision Starting...");

  // Initialize DHT sensor
  dht.begin();
  Serial.println("📊 DHT22 sensor initialized");

  // Camera configuration
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  if(psramFound()){
    config.frame_size = FRAMESIZE_UXGA; // Higher quality
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x", err);
    return;
  }

  // Camera settings
  sensor_t * s = esp_camera_sensor_get();
  s->set_framesize(s, FRAMESIZE_XGA); // Good balance of quality/speed
  s->set_vflip(s, 1);    // Flip vertically
  s->set_hmirror(s, 1);  // Mirror horizontally - adjust as needed

  // LED setup
  pinMode(gpLed, OUTPUT);
  ledcSetup(7, 5000, 8);
  ledcAttachPin(gpLed, 7);

  // WiFi setup
  WiFi.begin(ssid, password);
  Serial.print("📡 Connecting to WiFi");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if(WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("✅ WiFi connected!");
    Serial.print("📱 Camera Ready! Access at: http://");
    Serial.print(WiFi.localIP());
    Serial.println();
    Serial.print("🎥 Stream at: http://");
    Serial.print(WiFi.localIP());
    Serial.println(":81/stream");
    Serial.print("📊 Sensor data at: http://");
    Serial.print(WiFi.localIP());
    Serial.println("/sensors");
  } else {
    Serial.println("\n❌ WiFi connection failed!");
    // Continue anyway - can still work as AP
  }

  // Start camera server
  startCameraServer();

  // Success indicator - flash LED
  for (int i = 0; i < 5; i++) {
    ledcWrite(7, 50);
    delay(100);
    ledcWrite(7, 0);
    delay(100);
  }
  
  Serial.println("🚀 Smart Plant Vision ready!");
}

void loop() {
  // Read sensors periodically
  if (millis() - lastSensorRead >= sensorInterval) {
    readSensors();
    lastSensorRead = millis();
  }
  
  delay(100); // Small delay to prevent watchdog issues
}

void readSensors() {
  // Read DHT22
  float newTemperature = dht.readTemperature();
  float newHumidity = dht.readHumidity();
  
  // Check if readings are valid
  if (!isnan(newTemperature) && !isnan(newHumidity)) {
    temperature = newTemperature;
    humidity = newHumidity;
  }
  
  // Read soil moisture (0-4095 range, convert to percentage)
  int rawSoil = analogRead(SOIL_MOISTURE_PIN);
  soilMoisture = map(rawSoil, 4095, 0, 0, 100); // Invert and convert to %
  soilMoisture = constrain(soilMoisture, 0, 100);
  
  // Print to serial
  Serial.printf("🌡️  Temp: %.1f°C | 💧 Humidity: %.1f%% | 🌱 Soil: %d%%\n", 
                temperature, humidity, soilMoisture);
}

// Function to get sensor data as JSON
String getSensorJson() {
  DynamicJsonDocument doc(200);
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["soilMoisture"] = soilMoisture;
  doc["timestamp"] = millis();
  doc["status"] = "online";
  
  String output;
  serializeJson(doc, output);
  return output;
}
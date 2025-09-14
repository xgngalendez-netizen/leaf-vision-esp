# Smart Plant Vision Setup Guide

## 🌱 Complete Setup Instructions

This guide will help you set up the Smart Plant Vision system that combines:
- ESP32 camera streaming
- AI disease detection (YOLO + EfficientNet)
- Environmental sensors (temperature, humidity, soil moisture)
- Modern web dashboard

---

## 📋 Prerequisites

### Hardware Requirements:
- ESP32-CAM module
- Temperature/humidity sensor (DHT22 recommended)
- Soil moisture sensor
- Jumper wires and breadboard
- WiFi network

### Software Requirements:
- Python 3.8 or higher
- Arduino IDE
- ESP32 board package for Arduino

---

## 🐍 Python Environment Setup

### 1. Create Virtual Environment
```bash
# Create virtual environment
python -m venv smart_plant_env

# Activate virtual environment
# Windows:
smart_plant_env\Scripts\activate
# macOS/Linux:
source smart_plant_env/bin/activate
```

### 2. Install Python Dependencies
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install ultralytics
pip install timm
pip install flask flask-cors
pip install pillow numpy
pip install requests
```

### 3. Download/Prepare Model Files

Place these files in the same directory as `app.py`:

**Required Files:**
- `yolo11_leaves.pt` - Your trained YOLO model
- `efficientnet_b0_leaves.pth` - Your trained EfficientNet model
- `labels.json` - Class labels for disease detection

**Example labels.json:**
```json
{
  "0": "Healthy Leaf",
  "1": "Bacterial Spot", 
  "2": "Leaf Blight",
  "3": "Powdery Mildew",
  "4": "Rust Disease"
}
```

---

## 🔧 ESP32 Setup

### 1. Arduino IDE Configuration
1. Install ESP32 board package:
   - Go to File → Preferences
   - Add this URL to Additional Board Manager URLs:
     ```
     https://dl.espressif.com/dl/package_esp32_index.json
     ```
   - Go to Tools → Board → Boards Manager
   - Search "ESP32" and install "ESP32 by Espressif Systems"

### 2. Upload ESP32 Code

**Main ESP32 File (smart_plant_cam.ino):**
```cpp
const char* ssid = "YOUR_WIFI_NAME";     // Change to your WiFi name
const char* password = "YOUR_WIFI_PASSWORD"; // Change to your WiFi password

#include "esp_wifi.h"
#include "esp_camera.h"
#include <WiFi.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <DHT.h>

#define CAMERA_MODEL_AI_THINKER

// Camera pins (AI Thinker ESP32-CAM)
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

// Sensor pins
#define DHT_PIN           2
#define DHT_TYPE          DHT22
#define SOIL_MOISTURE_PIN A0

DHT dht(DHT_PIN, DHT_TYPE);

void startCameraServer();
extern int gpLed = 4;

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();

  // Initialize DHT sensor
  dht.begin();

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
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  sensor_t * s = esp_camera_sensor_get();
  s->set_framesize(s, FRAMESIZE_QVGA);
  s->set_vflip(s, 1);
  s->set_hmirror(s, 0);

  pinMode(gpLed, OUTPUT);
  ledcSetup(7, 5000, 8);
  ledcAttachPin(gpLed, 7);

  // WiFi setup
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  startCameraServer();

  // Flash LED to indicate ready
  for (int i = 0; i < 5; i++) {
    ledcWrite(7, 10);
    delay(50);
    ledcWrite(7, 0);
    delay(50);
  }
}

void loop() {
  delay(10000);
  
  // Read sensors
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  int soilMoisture = analogRead(SOIL_MOISTURE_PIN);
  
  // Print sensor data
  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.print("°C, Humidity: ");
  Serial.print(humidity);
  Serial.print("%, Soil Moisture: ");
  Serial.println(soilMoisture);
}
```

### 3. WiFi Configuration
1. In the ESP32 code, change these lines:
   ```cpp
   const char* ssid = "YOUR_WIFI_NAME";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```

2. Upload the code to your ESP32-CAM
3. Open Serial Monitor to see the IP address assigned to your ESP32

---

## 🚀 Running the System

### Method 1: Python Flask App (Recommended)

1. **Start the Flask server:**
   ```bash
   python app.py
   ```

2. **Access the dashboard:**
   - Open your browser and go to: `http://localhost:5000`
   - The dashboard will show both camera stream and AI analysis

3. **Connect ESP32 camera:**
   - In the dashboard, enter your ESP32's IP address
   - Click "Start Stream" to begin video streaming

### Method 2: ESP32 Direct Access

1. **Connect to ESP32 WiFi network** (if configured as AP):
   - Network name: Usually "ESP32-CAM" or your configured SSID
   - Password: Your configured password

2. **Access ESP32 directly:**
   - Open browser and go to: `http://192.168.4.1`
   - This gives you basic camera controls

**Note:** For AI disease detection via ESP32 direct access, you'll need to modify the ESP32 code to send images to your Python server for analysis.

---

## 🌐 Network Configuration Options

### Option A: ESP32 on Your Local WiFi (Recommended)
- ESP32 connects to your home WiFi
- Python app runs on your computer
- Both accessible on same network
- Better performance and stability

### Option B: ESP32 as Access Point
- ESP32 creates its own WiFi network
- Connect your computer to ESP32's network
- More isolated but limited range

### Option C: Hybrid Setup
- ESP32 on local WiFi for streaming
- Python app accessible from anywhere on network
- Best of both worlds

---

## 🔧 Sensor Integration

### Adding Temperature/Humidity Sensor (DHT22):
```cpp
// In your ESP32 code
#include <DHT.h>
#define DHT_PIN 2
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// In setup():
dht.begin();

// In loop():
float humidity = dht.readHumidity();
float temperature = dht.readTemperature();
```

### Adding Soil Moisture Sensor:
```cpp
// In your ESP32 code
#define SOIL_MOISTURE_PIN A0

// In loop():
int soilMoisture = analogRead(SOIL_MOISTURE_PIN);
int moisturePercent = map(soilMoisture, 1024, 0, 0, 100);
```

---

## 🎨 Dashboard Features

The web dashboard includes:

### 📊 Live Monitoring
- Real-time environmental sensor data
- ESP32 camera stream
- System status indicators

### 🔬 AI Disease Detection
- Upload multiple plant images
- YOLO leaf detection
- EfficientNet disease classification
- Visual results with confidence scores

### 📈 Analytics
- Detection history
- System health monitoring
- Performance metrics

---

## 🛠️ Troubleshooting

### Common Issues:

1. **Camera stream not working:**
   - Check ESP32 IP address
   - Ensure ESP32 and computer are on same network
   - Try different browsers

2. **AI model errors:**
   - Verify model files are in correct directory
   - Check if CUDA is available for GPU acceleration
   - Ensure all Python dependencies are installed

3. **Sensor readings incorrect:**
   - Check wiring connections
   - Verify sensor power supply
   - Calibrate sensors if needed

4. **WiFi connection issues:**
   - Double-check SSID and password
   - Ensure WiFi signal strength is adequate
   - Try restarting ESP32

### Debug Commands:
```bash
# Check Python environment
python --version
pip list

# Test model loading
python -c "import torch; print(torch.__version__)"
python -c "from ultralytics import YOLO; print('YOLO OK')"

# Check Flask server
curl http://localhost:5000/health
```

---

## 🔄 Updates and Customization

### Adding New Plant Diseases:
1. Retrain your EfficientNet model with new data
2. Update `labels.json` with new class names
3. Replace `efficientnet_b0_leaves.pth` with new model

### Customizing Dashboard:
- Edit the HTML template in `app.py`
- Modify CSS for different color schemes
- Add new sensor types by extending the ESP32 code

### Performance Optimization:
- Use GPU acceleration if available
- Optimize image resolution for your use case
- Implement caching for better response times

---

## 📱 Mobile Access

The dashboard is responsive and works on mobile devices:
- Access via phone's browser at `http://[your-computer-ip]:5000`
- All features available on mobile
- Touch-friendly interface

---

## 🔒 Security Considerations

- Change default ESP32 passwords
- Use HTTPS in production environments
- Implement authentication for public access
- Regular security updates

---

This setup gives you a complete smart plant monitoring system with AI-powered disease detection and real-time environmental monitoring!
/*
  Smart Plant Vision - Camera Server Functions
  Extended camera server with sensor data endpoints
*/

#include "dl_lib_matrix3d.h"
#include <esp32-hal-ledc.h>
#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_camera.h"
#include "img_converters.h"
#include "Arduino.h"
#include <ArduinoJson.h>

extern int gpLed;
extern float temperature, humidity;
extern int soilMoisture;
extern String getSensorJson();

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t stream_httpd = NULL;
httpd_handle_t camera_httpd = NULL;

typedef struct {
    httpd_req_t *req;
    size_t len;
} jpg_chunking_t;

static size_t jpg_encode_stream(void * arg, size_t index, const void* data, size_t len){
    jpg_chunking_t *j = (jpg_chunking_t *)arg;
    if(!index){
        j->len = 0;
    }
    if(httpd_resp_send_chunk(j->req, (const char *)data, len) != ESP_OK){
        return 0;
    }
    j->len += len;
    return len;
}

// Image capture handler
static esp_err_t capture_handler(httpd_req_t *req){
    camera_fb_t * fb = NULL;
    esp_err_t res = ESP_OK;
    int64_t fr_start = esp_timer_get_time();

    fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("Camera capture failed");
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    size_t fb_len = 0;
    if(fb->format == PIXFORMAT_JPEG){
        fb_len = fb->len;
        res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
    } else {
        jpg_chunking_t jchunk = {req, 0};
        res = frame2jpg_cb(fb, 80, jpg_encode_stream, &jchunk)?ESP_OK:ESP_FAIL;
        httpd_resp_send_chunk(req, NULL, 0);
        fb_len = jchunk.len;
    }
    esp_camera_fb_return(fb);
    int64_t fr_end = esp_timer_get_time();
    Serial.printf("JPG: %uB %ums\n", (uint32_t)(fb_len), (uint32_t)((fr_end - fr_start)/1000));
    return res;
}

// Video stream handler
static esp_err_t stream_handler(httpd_req_t *req){
    camera_fb_t * fb = NULL;
    esp_err_t res = ESP_OK;
    size_t _jpg_buf_len = 0;
    uint8_t * _jpg_buf = NULL;
    char * part_buf[64];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if(res != ESP_OK){
        return res;
    }

    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    while(true){
        fb = esp_camera_fb_get();
        if (!fb) {
            Serial.println("Camera capture failed");
            res = ESP_FAIL;
        } else {
            if(fb->format != PIXFORMAT_JPEG){
                bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
                esp_camera_fb_return(fb);
                fb = NULL;
                if(!jpeg_converted){
                    Serial.println("JPEG compression failed");
                    res = ESP_FAIL;
                }
            } else {
                _jpg_buf_len = fb->len;
                _jpg_buf = fb->buf;
            }
        }
        if(res == ESP_OK){
            size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
            res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
        }
        if(res == ESP_OK){
            res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
        }
        if(res == ESP_OK){
            res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
        }
        if(fb){
            esp_camera_fb_return(fb);
            fb = NULL;
            _jpg_buf = NULL;
        } else if(_jpg_buf){
            free(_jpg_buf);
            _jpg_buf = NULL;
        }
        if(res != ESP_OK){
            break;
        }
    }
    return res;
}

// Sensor data API endpoint
static esp_err_t sensors_handler(httpd_req_t *req){
    String sensorData = getSensorJson();
    
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    
    return httpd_resp_send(req, sensorData.c_str(), sensorData.length());
}

// Camera control handler
static esp_err_t cmd_handler(httpd_req_t *req){
    char*  buf;
    size_t buf_len;
    char variable[32] = {0,};
    char value[32] = {0,};

    buf_len = httpd_req_get_url_query_len(req) + 1;
    if (buf_len > 1) {
        buf = (char*)malloc(buf_len);
        if(!buf){
            httpd_resp_send_500(req);
            return ESP_FAIL;
        }
        if (httpd_req_get_url_query_str(req, buf, buf_len) == ESP_OK) {
            if (httpd_query_key_value(buf, "var", variable, sizeof(variable)) == ESP_OK &&
                httpd_query_key_value(buf, "val", value, sizeof(value)) == ESP_OK) {
            } else {
                free(buf);
                httpd_resp_send_404(req);
                return ESP_FAIL;
            }
        } else {
            free(buf);
            httpd_resp_send_404(req);
            return ESP_FAIL;
        }
        free(buf);
    } else {
        httpd_resp_send_404(req);
        return ESP_FAIL;
    }

    int val = atoi(value);
    sensor_t * s = esp_camera_sensor_get();
    int res = 0;

    if(!strcmp(variable, "framesize")) {
        if(s->pixformat == PIXFORMAT_JPEG) res = s->set_framesize(s, (framesize_t)val);
    }
    else if(!strcmp(variable, "quality")) {
        res = s->set_quality(s, val);
    }
    else if(!strcmp(variable, "contrast")) {
        res = s->set_contrast(s, val);
    }
    else if(!strcmp(variable, "brightness")) {
        res = s->set_brightness(s, val);
    }
    else if(!strcmp(variable, "flash")) {
        ledcWrite(7, val);
    }
    else {
        res = -1;
    }

    if(res){
        return httpd_resp_send_500(req);
    }

    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, NULL, 0);
}

// Status API endpoint
static esp_err_t status_handler(httpd_req_t *req){
    static char json_response[1024];
    sensor_t * s = esp_camera_sensor_get();
    char * p = json_response;
    *p++ = '{';

    p+=sprintf(p, "\"framesize\":%u,", s->status.framesize);
    p+=sprintf(p, "\"quality\":%u,", s->status.quality);
    p+=sprintf(p, "\"brightness\":%d,", s->status.brightness);
    p+=sprintf(p, "\"contrast\":%d,", s->status.contrast);
    p+=sprintf(p, "\"temperature\":%.1f,", temperature);
    p+=sprintf(p, "\"humidity\":%.1f,", humidity);
    p+=sprintf(p, "\"soilMoisture\":%d", soilMoisture);
    *p++ = '}';
    *p++ = 0;
    
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, json_response, strlen(json_response));
}

// Modern HTML interface
static const char PROGMEM INDEX_HTML[] = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Plant Vision - ESP32</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .sensor-card { background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%); }
        .camera-card { background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); }
    </style>
</head>
<body class="gradient-bg min-h-screen text-white">
    <div class="container mx-auto px-4 py-8">
        <div class="text-center mb-8">
            <h1 class="text-4xl font-bold mb-2">🌱 Smart Plant Vision</h1>
            <p class="text-lg opacity-90">ESP32 Camera + Environmental Sensors</p>
        </div>

        <!-- Sensor Data -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="sensor-card rounded-xl p-6 text-black">
                <h3 class="text-lg font-semibold mb-2">🌡️ Temperature</h3>
                <div class="text-3xl font-bold" id="temperature">--°C</div>
            </div>
            <div class="sensor-card rounded-xl p-6 text-black">
                <h3 class="text-lg font-semibold mb-2">💧 Humidity</h3>
                <div class="text-3xl font-bold" id="humidity">--%</div>
            </div>
            <div class="sensor-card rounded-xl p-6 text-black">
                <h3 class="text-lg font-semibold mb-2">🌱 Soil Moisture</h3>
                <div class="text-3xl font-bold" id="soilMoisture">--%</div>
            </div>
        </div>

        <!-- Camera Stream -->
        <div class="camera-card rounded-xl p-6 mb-8">
            <h3 class="text-xl font-semibold mb-4 text-black">📷 Live Camera Feed</h3>
            <div class="bg-black rounded-lg overflow-hidden">
                <img id="stream" src="" class="w-full h-auto" style="max-height: 500px; object-fit: contain;">
            </div>
            <div class="flex gap-4 mt-4">
                <button onclick="startStream()" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold">
                    ▶️ Start Stream
                </button>
                <button onclick="stopStream()" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold">
                    ⏹️ Stop Stream
                </button>
                <button onclick="captureImage()" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold">
                    📸 Capture
                </button>
            </div>
        </div>

        <!-- Controls -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white bg-opacity-20 rounded-xl p-6">
                <h3 class="text-lg font-semibold mb-4">🔧 Camera Settings</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Flash LED</label>
                        <input type="range" id="flash" min="0" max="255" value="0" 
                               onchange="updateSetting('flash', this.value)"
                               class="w-full">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Quality</label>
                        <input type="range" id="quality" min="10" max="63" value="10" 
                               onchange="updateSetting('quality', this.value)"
                               class="w-full">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Brightness</label>
                        <input type="range" id="brightness" min="-2" max="2" value="0" 
                               onchange="updateSetting('brightness', this.value)"
                               class="w-full">
                    </div>
                </div>
            </div>
            
            <div class="bg-white bg-opacity-20 rounded-xl p-6">
                <h3 class="text-lg font-semibold mb-4">📊 System Info</h3>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span>Status:</span>
                        <span class="text-green-300 font-semibold">Online</span>
                    </div>
                    <div class="flex justify-between">
                        <span>IP Address:</span>
                        <span class="font-mono text-sm" id="ipAddress">Loading...</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Uptime:</span>
                        <span id="uptime">--</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let isStreaming = false;
        
        function startStream() {
            document.getElementById('stream').src = window.location.origin + ':81/stream';
            isStreaming = true;
        }
        
        function stopStream() {
            document.getElementById('stream').src = '';
            isStreaming = false;
        }
        
        function captureImage() {
            window.open(window.location.origin + '/capture', '_blank');
        }
        
        function updateSetting(setting, value) {
            fetch(`/control?var=${setting}&val=${value}`)
                .then(response => console.log(`${setting} set to ${value}`))
                .catch(error => console.error('Error:', error));
        }
        
        function updateSensors() {
            fetch('/sensors')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('temperature').textContent = data.temperature.toFixed(1) + '°C';
                    document.getElementById('humidity').textContent = data.humidity.toFixed(1) + '%';
                    document.getElementById('soilMoisture').textContent = data.soilMoisture + '%';
                })
                .catch(error => {
                    console.error('Sensor update error:', error);
                    document.getElementById('temperature').textContent = '--°C';
                    document.getElementById('humidity').textContent = '--%';
                    document.getElementById('soilMoisture').textContent = '--%';
                });
        }
        
        // Update IP address
        document.getElementById('ipAddress').textContent = window.location.hostname;
        
        // Update sensors every 3 seconds
        setInterval(updateSensors, 3000);
        updateSensors(); // Initial load
        
        // Update uptime
        let startTime = Date.now();
        setInterval(() => {
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(uptime / 60);
            const seconds = uptime % 60;
            document.getElementById('uptime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    </script>
</body>
</html>
)rawliteral";

// Main page handler
static esp_err_t index_handler(httpd_req_t *req){
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, (const char *)INDEX_HTML, strlen(INDEX_HTML));
}

// Start camera server
void startCameraServer(){
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;

    httpd_uri_t index_uri = {
        .uri       = "/",
        .method    = HTTP_GET,
        .handler   = index_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t status_uri = {
        .uri       = "/status",
        .method    = HTTP_GET,
        .handler   = status_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t cmd_uri = {
        .uri       = "/control",
        .method    = HTTP_GET,
        .handler   = cmd_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t capture_uri = {
        .uri       = "/capture",
        .method    = HTTP_GET,
        .handler   = capture_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t sensors_uri = {
        .uri       = "/sensors",
        .method    = HTTP_GET,
        .handler   = sensors_handler,
        .user_ctx  = NULL
    };

    Serial.printf("Starting web server on port: '%d'\n", config.server_port);
    if (httpd_start(&camera_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(camera_httpd, &index_uri);
        httpd_register_uri_handler(camera_httpd, &cmd_uri);
        httpd_register_uri_handler(camera_httpd, &status_uri);
        httpd_register_uri_handler(camera_httpd, &capture_uri);
        httpd_register_uri_handler(camera_httpd, &sensors_uri);
    }

    // Stream server on port 81
    config.server_port += 1;
    config.ctrl_port += 1;
    Serial.printf("Starting stream server on port: '%d'\n", config.server_port);
    if (httpd_start(&stream_httpd, &config) == ESP_OK) {
        httpd_uri_t stream_uri = {
            .uri       = "/stream",
            .method    = HTTP_GET,
            .handler   = stream_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(stream_httpd, &stream_uri);
    }
}
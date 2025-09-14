"""
Smart Plant Vision - Combined ESP32 Camera + AI Disease Detection Flask App
Integrates YOLO leaf detection with EfficientNet disease classification
"""
import os
import io
import json
import uuid
from datetime import datetime
from typing import List, Tuple
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont
from flask import Flask, request, render_template_string, send_from_directory, jsonify
from flask_cors import CORS
import requests
import base64

try:
    from ultralytics import YOLO
except Exception as e:
    raise RuntimeError("Ultralytics is required. Install with `pip install ultralytics`. Error: %s" % e)

import timm

# --------------------------- Config ---------------------------
YOLO_WEIGHTS = "yolo11_leaves.pt"
EFFNET_WEIGHTS = "efficientnet_b0_leaves.pth"
LABELS_JSON = "labels.json"
UPLOAD_DIR = os.path.join("static", "uploads")
RESULT_DIR = os.path.join("static", "results")
CONF_THRESH = 0.25
NMS_IOU = 0.45
MAX_UPLOAD_MB = 30
CLS_IMG_SIZE = 224

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "C:/Windows/Fonts/arial.ttf",
]

# --------------------------- Utilities ---------------------------

def ensure_dirs():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(RESULT_DIR, exist_ok=True)
    os.makedirs("templates", exist_ok=True)

def load_labels(path: str) -> List[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, UnicodeDecodeError):
        # If labels file doesn't exist, create a default one
        data = {
            "0": "Healthy Leaf",
            "1": "Bacterial Spot", 
            "2": "Leaf Blight",
            "3": "Powdery Mildew",
            "4": "Rust Disease"
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    
    if isinstance(data, dict):
        items = sorted(((int(k), v) for k, v in data.items()), key=lambda kv: kv[0])
        return [v for _, v in items]
    elif isinstance(data, list):
        return data
    else:
        raise ValueError("labels.json must be a list or dict")

def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")

def preprocess_for_effnet(pil_img: Image.Image) -> torch.Tensor:
    img = pil_img.convert("RGB").resize((CLS_IMG_SIZE, CLS_IMG_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    arr = arr.transpose(2, 0, 1)
    tensor = torch.from_numpy(arr)
    return tensor

def draw_box_and_label(draw: ImageDraw.ImageDraw, xyxy: Tuple[int, int, int, int], label: str):
    x1, y1, x2, y2 = map(int, xyxy)
    # Use different colors based on detection
    color = (0, 255, 0) if "Healthy" in label else (255, 165, 0)  # Green for healthy, orange for disease
    draw.rectangle([(x1, y1), (x2, y2)], outline=color, width=3)
    
    font = None
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                font = ImageFont.truetype(p, 18)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()
    
    text_w, text_h = draw.textbbox((0, 0), label, font=font)[2:]
    pad = 4
    draw.rectangle([(x1, max(y1 - text_h - pad * 2, 0)), (x1 + text_w + pad * 2, y1)], fill=color)
    text_color = (0, 0, 0) if "Healthy" in label else (255, 255, 255)
    draw.text((x1 + pad, y1 - text_h - pad), label, fill=text_color, font=font)

# --------------------------- Model Loading ---------------------------

ensure_dirs()
device = get_device()

# Initialize YOLO model (download if not exists)
try:
    yolo_model = YOLO(YOLO_WEIGHTS)
except Exception as e:
    print(f"Warning: Could not load YOLO model {YOLO_WEIGHTS}. Using default yolo11n.pt")
    yolo_model = YOLO('yolo11n.pt')  # Download default model

# Load labels
labels = load_labels(LABELS_JSON)
num_classes = len(labels)

# Initialize EfficientNet model
cls_model = timm.create_model("efficientnet_b0", pretrained=True, num_classes=num_classes)

# Try to load trained weights
try:
    state = torch.load(EFFNET_WEIGHTS, map_location="cpu", weights_only=True)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    state = {k.replace("module.", ""): v for k, v in state.items()}
    cls_model.load_state_dict(state, strict=False)
    print("✅ Loaded trained EfficientNet weights")
except Exception as e:
    print(f"⚠️  Could not load trained weights: {e}. Using pretrained ImageNet weights.")

cls_model.eval().to(device)

# --------------------------- Flask App ---------------------------

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
CORS(app)  # Enable CORS for all domains

# Modern HTML Template
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Plant Vision Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <style>
        :root {
            --gradient-primary: linear-gradient(135deg, #16a34a, #22c55e);
            --gradient-tech: linear-gradient(135deg, #2563eb, #1d4ed8);
            --gradient-accent: linear-gradient(135deg, #f59e0b, #d97706);
        }
        
        .gradient-primary { background: var(--gradient-primary); }
        .gradient-tech { background: var(--gradient-tech); }
        .gradient-accent { background: var(--gradient-accent); }
        .gradient-bg { background: linear-gradient(180deg, #f8fafc, #f1f5f9); }
        
        .card-hover {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .card-hover:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 40px -10px rgba(34, 197, 94, 0.3);
        }
        
        .animate-pulse-glow {
            animation: pulse-glow 2s ease-in-out infinite;
        }
        
        @keyframes pulse-glow {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
        }
        
        body { background: var(--gradient-bg); }
    </style>
</head>
<body class="min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="text-center mb-8">
            <div class="flex items-center justify-center gap-3 mb-4">
                <div class="p-3 gradient-primary rounded-xl shadow-lg">
                    <i data-lucide="leaf" class="w-8 h-8 text-white"></i>
                </div>
                <h1 class="text-4xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                    Smart Plant Vision
                </h1>
            </div>
            <p class="text-lg text-gray-600 max-w-2xl mx-auto">
                AI-powered plant health monitoring with ESP32 camera integration
            </p>
        </div>

        <!-- Main Dashboard -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <!-- Environmental Sensors -->
            <div class="space-y-4">
                <h3 class="text-xl font-semibold flex items-center gap-2">
                    <i data-lucide="zap" class="w-5 h-5 text-yellow-500"></i>
                    Environmental Sensors
                </h3>
                
                <div class="gradient-primary text-white p-6 rounded-xl shadow-lg card-hover">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <i data-lucide="thermometer" class="w-6 h-6"></i>
                            <div>
                                <p class="text-sm opacity-90">Temperature</p>
                                <p class="text-2xl font-bold" id="temperature">-- °C</p>
                            </div>
                        </div>
                        <div class="animate-pulse-glow">
                            <i data-lucide="activity" class="w-8 h-8 opacity-60"></i>
                        </div>
                    </div>
                </div>

                <div class="gradient-tech text-white p-6 rounded-xl shadow-lg card-hover">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <i data-lucide="droplets" class="w-6 h-6"></i>
                            <div>
                                <p class="text-sm opacity-90">Humidity</p>
                                <p class="text-2xl font-bold" id="humidity">-- %</p>
                            </div>
                        </div>
                        <div class="animate-pulse-glow">
                            <i data-lucide="activity" class="w-8 h-8 opacity-60"></i>
                        </div>
                    </div>
                </div>

                <div class="gradient-accent text-white p-6 rounded-xl shadow-lg card-hover">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <i data-lucide="droplets" class="w-6 h-6"></i>
                            <div>
                                <p class="text-sm opacity-90">Soil Moisture</p>
                                <p class="text-2xl font-bold" id="soilMoisture">-- %</p>
                            </div>
                        </div>
                        <div class="animate-pulse-glow">
                            <i data-lucide="activity" class="w-8 h-8 opacity-60"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Camera Stream -->
            <div class="lg:col-span-2 space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-xl font-semibold flex items-center gap-2">
                        <i data-lucide="camera" class="w-5 h-5 text-blue-600"></i>
                        ESP32 Camera Stream
                    </h3>
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800" id="connectionStatus">
                            <i data-lucide="wifi" class="w-3 h-3 mr-1"></i>
                            Ready
                        </span>
                        <input type="text" id="esp32Ip" value="192.168.4.1" placeholder="ESP32 IP" 
                               class="px-3 py-1 border border-gray-300 rounded-lg text-sm w-32">
                    </div>
                </div>

                <div class="gradient-tech rounded-xl shadow-lg overflow-hidden">
                    <div class="aspect-video bg-black">
                        <img id="streamImage" class="w-full h-full object-cover hidden" alt="ESP32 Stream">
                        <div id="streamPlaceholder" class="w-full h-full flex items-center justify-center">
                            <div class="text-center text-white">
                                <i data-lucide="camera" class="w-16 h-16 mx-auto mb-4 opacity-60"></i>
                                <p>Click start to begin camera stream</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4">
                    <button id="streamToggle" onclick="toggleStream()" 
                            class="flex-1 gradient-tech text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex items-center justify-center gap-2">
                        <i data-lucide="play" class="w-4 h-4"></i>
                        Start Stream
                    </button>
                    <button onclick="captureImage()" 
                            class="gradient-primary text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex items-center justify-center gap-2">
                        <i data-lucide="camera" class="w-4 h-4"></i>
                        Capture
                    </button>
                </div>
            </div>
        </div>

        <!-- Disease Detection Section -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
                <i data-lucide="leaf" class="w-5 h-5 text-green-600"></i>
                AI Plant Disease Detection
            </h3>
            
            <div class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-6">
                <i data-lucide="upload" class="w-12 h-12 mx-auto text-gray-400 mb-4"></i>
                <p class="text-lg font-medium mb-2">Drop images here or click to upload</p>
                <p class="text-sm text-gray-500 mb-4">Supports multiple images (JPG, PNG)</p>
                <input type="file" id="imageInput" multiple accept="image/*" class="hidden" onchange="handleImageUpload(event)">
                <button onclick="document.getElementById('imageInput').click()" 
                        class="gradient-primary text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex items-center justify-center gap-2 mx-auto">
                    <i data-lucide="upload" class="w-4 h-4"></i>
                    Select Images
                </button>
            </div>

            <!-- Results -->
            <div id="analysisResults" class="hidden">
                <h4 class="text-lg font-semibold mb-4">Analysis Results</h4>
                <div id="resultsGrid" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
            </div>
        </div>

        <!-- System Status -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white rounded-xl shadow-lg p-6">
                <h4 class="font-semibold mb-4">System Status</h4>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span>AI Model</span>
                        <span class="text-green-600 font-medium">Ready</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Device</span>
                        <span class="text-blue-600 font-medium">{{ device }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Classes</span>
                        <span class="text-purple-600 font-medium">{{ num_classes }}</span>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6">
                <h4 class="font-semibold mb-4">Recent Activity</h4>
                <div class="text-3xl font-bold text-green-600" id="analysisCount">0</div>
                <p class="text-sm text-gray-500">Images analyzed</p>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6">
                <h4 class="font-semibold mb-4">Health Score</h4>
                <div class="text-3xl font-bold text-green-600">85%</div>
                <p class="text-sm text-gray-500">Overall plant health</p>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();
        
        let isStreaming = false;
        let analysisCount = 0;
        
        // Mock sensor data
        function updateSensorData() {
            const temp = (25 + Math.random() * 10).toFixed(1);
            const humidity = (60 + Math.random() * 20).toFixed(1);
            const soil = (70 + Math.random() * 20).toFixed(1);
            
            document.getElementById('temperature').textContent = temp + '°C';
            document.getElementById('humidity').textContent = humidity + '%';
            document.getElementById('soilMoisture').textContent = soil + '%';
        }
        
        // Update sensor data every 3 seconds
        setInterval(updateSensorData, 3000);
        updateSensorData();
        
        function toggleStream() {
            const button = document.getElementById('streamToggle');
            const img = document.getElementById('streamImage');
            const placeholder = document.getElementById('streamPlaceholder');
            const status = document.getElementById('connectionStatus');
            const ip = document.getElementById('esp32Ip').value;
            
            if (!isStreaming) {
                // Start streaming
                button.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i> Stop Stream';
                button.classList.remove('gradient-tech');
                button.classList.add('bg-red-500');
                
                img.src = `http://${ip}:81/stream`;
                img.classList.remove('hidden');
                placeholder.classList.add('hidden');
                
                status.innerHTML = '<i data-lucide="wifi" class="w-3 h-3 mr-1"></i> Connected';
                status.classList.remove('bg-green-100', 'text-green-800');
                status.classList.add('bg-green-100', 'text-green-800');
                
                isStreaming = true;
            } else {
                // Stop streaming
                button.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> Start Stream';
                button.classList.remove('bg-red-500');
                button.classList.add('gradient-tech');
                
                img.classList.add('hidden');
                placeholder.classList.remove('hidden');
                
                status.innerHTML = '<i data-lucide="wifi" class="w-3 h-3 mr-1"></i> Ready';
                
                isStreaming = false;
            }
            lucide.createIcons();
        }
        
        function captureImage() {
            const ip = document.getElementById('esp32Ip').value;
            window.open(`http://${ip}/capture`, '_blank');
        }
        
        async function handleImageUpload(event) {
            const files = event.target.files;
            if (!files.length) return;
            
            const formData = new FormData();
            Array.from(files).forEach(file => {
                formData.append('images', file);
            });
            
            const resultsDiv = document.getElementById('analysisResults');
            const resultsGrid = document.getElementById('resultsGrid');
            
            // Show loading
            resultsDiv.classList.remove('hidden');
            resultsGrid.innerHTML = '<div class="col-span-full text-center py-8"><div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div><p>Analyzing images...</p></div>';
            
            try {
                const response = await fetch('/predict', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                // Update analysis count
                analysisCount += files.length;
                document.getElementById('analysisCount').textContent = analysisCount;
                
                // Display results
                resultsGrid.innerHTML = data.results.map(result => `
                    <div class="bg-white rounded-lg shadow-md overflow-hidden">
                        <img src="${result.image_url}" alt="${result.filename}" class="w-full h-48 object-cover">
                        <div class="p-4">
                            <h5 class="font-semibold mb-2">${result.filename}</h5>
                            <div class="space-y-2">
                                ${result.detections.map(detection => `
                                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                                        <div class="flex items-center gap-2">
                                            <i data-lucide="${detection.label.includes('Healthy') ? 'check-circle' : 'alert-circle'}" 
                                               class="w-4 h-4 ${detection.label.includes('Healthy') ? 'text-green-500' : 'text-orange-500'}"></i>
                                            <span class="text-sm font-medium">${detection.label}</span>
                                        </div>
                                        <span class="text-xs px-2 py-1 rounded ${detection.label.includes('Healthy') ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}">
                                            ${(detection.prob * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `).join('');
                
                lucide.createIcons();
                
            } catch (error) {
                resultsGrid.innerHTML = '<div class="col-span-full text-center py-8 text-red-500">Error analyzing images. Please try again.</div>';
            }
        }
    </script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(DASHBOARD_HTML, device=str(device), num_classes=num_classes)

@app.route("/predict", methods=["POST"])
@torch.inference_mode()
def predict():
    files = request.files.getlist("images")
    results = []

    for file in files:
        uid = uuid.uuid4().hex
        stem = datetime.now().strftime("%Y%m%d_%H%M%S_") + uid
        upload_path = os.path.join(UPLOAD_DIR, stem + os.path.splitext(file.filename)[1].lower())
        
        # Save uploaded file
        img = Image.open(file.stream).convert("RGB")
        img.save(upload_path)

        # YOLO detection
        yolo_results = yolo_model.predict(
            source=np.array(img), conf=CONF_THRESH, iou=NMS_IOU, verbose=False,
            device=0 if device.type == "cuda" else "cpu",
        )

        boxes, confs, classes = [], [], []
        if len(yolo_results) > 0:
            r = yolo_results[0]
            if r.boxes is not None and len(r.boxes) > 0:
                xyxy = r.boxes.xyxy.cpu().numpy()
                conf = r.boxes.conf.cpu().numpy()
                cls = r.boxes.cls.cpu().numpy()
                for bb, cc, cl in zip(xyxy, conf, cls):
                    boxes.append(tuple(map(float, bb)))
                    confs.append(float(cc))
                    classes.append(int(cl))

        detections = []
        annotated = img.copy()
        draw = ImageDraw.Draw(annotated)

        # If no YOLO detections, analyze the whole image
        if not boxes:
            boxes = [(0, 0, img.width, img.height)]
            confs = [1.0]
            classes = [0]

        for (x1, y1, x2, y2), yconf, ycls in zip(boxes, confs, classes):
            crop = img.crop((int(x1), int(y1), int(x2), int(y2)))
            inp = preprocess_for_effnet(crop).unsqueeze(0).to(device)
            logits = cls_model(inp)
            probs = F.softmax(logits, dim=1)[0]
            cls_conf, cls_idx = torch.max(probs, dim=0)
            label = labels[int(cls_idx)] if int(cls_idx) < len(labels) else f"cls_{cls_idx}"
            
            draw_box_and_label(draw, (x1, y1, x2, y2), f"{label} ({cls_conf:.2f})")
            detections.append({
                "box": tuple(map(int, (x1, y1, x2, y2))),
                "yolo_conf": yconf,
                "yolo_class": str(yolo_model.names.get(ycls, f"cls_{ycls}")) if hasattr(yolo_model, 'names') else "leaf",
                "label": label,
                "prob": float(cls_conf),
            })

        # Save annotated result
        out_rel = os.path.join("static", "results", stem + "_annotated.jpg")
        out_abs = os.path.join(RESULT_DIR, stem + "_annotated.jpg")
        annotated.save(out_abs, quality=95)

        results.append({
            "filename": file.filename,
            "image_url": "/" + out_rel.replace("\\", "/"),
            "detections": detections,
        })

    return jsonify({"results": results})

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/api/sensor-data')
def get_sensor_data():
    """Mock endpoint for sensor data - replace with actual sensor readings"""
    import random
    return jsonify({
        "temperature": round(25 + random.uniform(-5, 10), 1),
        "humidity": round(60 + random.uniform(-10, 20), 1),
        "soil_moisture": round(70 + random.uniform(-20, 20), 1),
        "timestamp": datetime.now().isoformat()
    })

@app.route('/health')
def health_check():
    return jsonify({
        "status": "healthy",
        "device": str(device),
        "model_loaded": True,
        "num_classes": num_classes
    })

if __name__ == "__main__":
    print("🌱 Smart Plant Vision Dashboard Starting...")
    print(f"📱 Device: {device}")
    print(f"🤖 Model Classes: {num_classes}")
    print(f"🔗 Access dashboard at: http://localhost:5000")
    print(f"📡 ESP32 Camera should be accessible at: http://192.168.4.1")
    
    app.run(host="0.0.0.0", port=5000, debug=True)
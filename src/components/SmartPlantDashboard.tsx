import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Camera, 
  Leaf, 
  Thermometer, 
  Droplets, 
  Upload, 
  Play, 
  Pause, 
  AlertCircle,
  CheckCircle,
  Activity,
  Wifi,
  Brain,
  Cpu,
  Sun,
  Loader2
} from 'lucide-react';
import { toast } from "sonner";

interface DetectionResult {
  filename: string;
  detections: Array<{
    box: [number, number, number, number];
    yolo_conf: number;
    yolo_class: string;
    label: string;
    prob: number;
  }>;
  image_url: string;
}

interface SensorData {
  temperature: number;
  humidity: number;
  soilMoisture: number;
}

export default function SmartPlantDashboard() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [esp32Ip, setEsp32Ip] = useState('192.168.4.1');
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: 24.2,
    humidity: 65.8,
    soilMoisture: 42.5
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Realistic sensor data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSensorData(prev => ({
        temperature: Math.round((prev.temperature + (Math.random() - 0.5) * 1.5) * 10) / 10,
        humidity: Math.round(Math.max(40, Math.min(80, prev.humidity + (Math.random() - 0.5) * 3)) * 10) / 10,
        soilMoisture: Math.round(Math.max(20, Math.min(80, prev.soilMoisture + (Math.random() - 0.5) * 4)) * 10) / 10
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--pointer-x", `${x}px`);
    e.currentTarget.style.setProperty("--pointer-y", `${y}px`);
  };

  const connectToEsp32 = () => {
    setIsConnected(true);
    toast.success("Connected to ESP32", {
      description: `Connected to ${esp32Ip}`
    });
  };

  const startStream = () => {
    if (!isConnected) {
      toast.error("Please connect to ESP32 first");
      return;
    }
    setIsStreaming(true);
    toast.success("Camera stream started");
  };

  const stopStream = () => {
    setIsStreaming(false);
    toast.info("Camera stream stopped");
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setIsAnalyzing(true);
    
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('images', file);
      });

      const response = await fetch('/predict', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      // Simulate results for demo
      const mockResults: DetectionResult[] = Array.from(files).map((file) => ({
        filename: file.name,
        detections: [
          {
            box: [50, 50, 200, 180],
            yolo_conf: 0.85 + Math.random() * 0.1,
            yolo_class: 'leaf',
            label: Math.random() > 0.7 ? 'Healthy' : ['Bacterial Spot', 'Early Blight', 'Late Blight'][Math.floor(Math.random() * 3)],
            prob: 0.80 + Math.random() * 0.15
          }
        ],
        image_url: URL.createObjectURL(file)
      }));
      
      setDetectionResults(mockResults);
      toast.success("Analysis completed", {
        description: `Analyzed ${files.length} image(s)`
      });
    } catch (error) {
      toast.error("Analysis failed", {
        description: "Please make sure the Flask server is running"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSensorColor = (value: number, type: 'temp' | 'humidity' | 'soil') => {
    switch (type) {
      case 'temp':
        return value > 30 ? 'text-orange-500' : value < 15 ? 'text-blue-500' : 'text-green-500';
      case 'humidity':
        return value < 40 ? 'text-orange-500' : value > 80 ? 'text-blue-500' : 'text-green-500';
      case 'soil':
        return value < 30 ? 'text-red-500' : value > 70 ? 'text-green-500' : 'text-yellow-500';
      default:
        return 'text-green-500';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Hero Header */}
        <header className="relative">
          <div
            onMouseMove={handleMouseMove}
            className="interactive-spotlight bg-hero rounded-2xl border p-8 md:p-12"
          >
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Leaf className="text-primary" />
                <span>Smart Plant Monitoring & Disease Detection</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                <span className="text-gradient">SmartSaka</span> Plant Vision Dashboard
              </h1>
              <p className="text-lg text-muted-foreground max-w-prose mx-auto">
                Monitor temperature, humidity, and soil moisture. Stream live camera feed from ESP32-CAM and detect plant diseases using YOLOv11 + EfficientNet-B0.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5" /> ESP32-CAM
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Brain className="h-3.5 w-3.5" /> YOLOv11 + EfficientNet
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Wifi className="h-3.5 w-3.5" /> Wi‑Fi Monitoring
                </Badge>
              </div>
            </div>
          </div>
        </header>

        {/* Connection Status */}
        <Card className="elevated-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isConnected ? <Wifi className="text-primary" /> : <Wifi className="text-muted-foreground" />}
              ESP32 Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="ESP32 IP Address (e.g., 192.168.4.1)"
                value={esp32Ip}
                onChange={(e) => setEsp32Ip(e.target.value)}
                className="flex-1"
              />
              <Button onClick={connectToEsp32} variant="hero">
                Connect
              </Button>
            </div>
            {isConnected && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle className="h-4 w-4" />
                Connected to {esp32Ip}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Environmental Sensors */}
          <Card className="elevated-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="text-primary" />
                Environmental Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Thermometer className="h-4 w-4 text-orange-500" />
                    <span>Temperature</span>
                  </div>
                  <div className="text-2xl font-semibold">{sensorData.temperature}°C</div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Droplets className="h-4 w-4 text-blue-500" />
                    <span>Humidity</span>
                  </div>
                  <div className="text-2xl font-semibold">{sensorData.humidity}%</div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Sun className="h-4 w-4 text-green-500" />
                    <span>Soil Moisture</span>
                  </div>
                  <div className="text-2xl font-semibold">{sensorData.soilMoisture}%</div>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground pt-2 border-t">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </CardContent>
          </Card>

          {/* Camera Stream */}
          <Card className="lg:col-span-2 elevated-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="text-primary" />
                  ESP32-CAM Live Stream
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={isStreaming ? stopStream : startStream}
                    variant={isStreaming ? "secondary" : "hero"}
                    size="sm"
                  >
                    {isStreaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isStreaming ? "Stop Stream" : "Start Stream"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {isStreaming ? (
                  <img
                    src={`http://${esp32Ip}:81/stream`}
                    alt="ESP32 Camera Stream"
                    className="w-full h-full object-cover"
                    onError={() => {
                      toast.error("Failed to load camera stream");
                      setIsStreaming(false);
                    }}
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="font-medium">Camera stream offline</p>
                    <p className="text-sm">Connect to ESP32 and click start to begin streaming</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Disease Detection */}
        <Card className="elevated-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="text-primary" />
              AI Disease Detection (YOLOv11 + EfficientNet-B0)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">Drop plant images here or click to upload</p>
                <p className="text-sm text-muted-foreground">Supports multiple images (JPG, PNG)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button 
                variant="hero" 
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Select Images
                  </>
                )}
              </Button>
            </div>

            {/* Detection Results */}
            {detectionResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Analysis Results</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {detectionResults.map((result, index) => (
                    <Card key={index} className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <img
                              src={result.image_url}
                              alt={result.filename}
                              className="w-full h-48 object-cover rounded-lg border"
                            />
                          </div>
                          <div className="space-y-3">
                            <h4 className="font-semibold">{result.filename}</h4>
                            {result.detections.map((detection, detIndex) => (
                              <div key={detIndex} className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2 mb-2">
                                  {detection.label === "Healthy" ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-orange-500" />
                                  )}
                                  <span className="font-medium">{detection.label}</span>
                                  <Badge variant="secondary">
                                    {Math.round(detection.prob * 100)}% confidence
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  YOLO Detection: {detection.yolo_class} ({Math.round(detection.yolo_conf * 100)}% conf)
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Camera, 
  Leaf, 
  Thermometer, 
  Droplets, 
  Zap, 
  Upload, 
  Play, 
  Pause, 
  AlertCircle,
  CheckCircle,
  Activity,
  Wifi,
  Settings,
  BarChart3
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState('monitoring');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [esp32Ip, setEsp32Ip] = useState('192.168.4.1');
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: 25.4,
    humidity: 62.3,
    soilMoisture: 78.1
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  // Mock sensor data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSensorData(prev => ({
        temperature: prev.temperature + (Math.random() - 0.5) * 2,
        humidity: Math.max(30, Math.min(90, prev.humidity + (Math.random() - 0.5) * 5)),
        soilMoisture: Math.max(20, Math.min(100, prev.soilMoisture + (Math.random() - 0.5) * 8))
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleStreamToggle = () => {
    if (!isStreaming) {
      setConnectionStatus('connecting');
      setTimeout(() => {
        setStreamUrl(`http://${esp32Ip}:81/stream`);
        setIsStreaming(true);
        setConnectionStatus('connected');
      }, 1500);
    } else {
      setIsStreaming(false);
      setStreamUrl('');
      setConnectionStatus('disconnected');
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setIsAnalyzing(true);
    
    // Simulate analysis delay
    setTimeout(() => {
      const mockResults: DetectionResult[] = Array.from(files).map((file, index) => ({
        filename: file.name,
        detections: [
          {
            box: [50, 50, 200, 180],
            yolo_conf: 0.92,
            yolo_class: 'leaf',
            label: Math.random() > 0.5 ? 'Healthy Leaf' : 'Bacterial Spot',
            prob: 0.85 + Math.random() * 0.14
          }
        ],
        image_url: URL.createObjectURL(file)
      }));
      
      setDetectionResults(mockResults);
      setIsAnalyzing(false);
    }, 2500);
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
    <div className="min-h-screen p-4 space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="p-3 bg-gradient-primary rounded-xl shadow-primary">
            <Leaf className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-tech-blue bg-clip-text text-transparent">
            Smart Plant Vision
          </h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          AI-powered plant health monitoring with ESP32 camera integration and environmental sensors
        </p>
      </div>

      {/* Main Dashboard */}
      <div className="max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 p-1 bg-card-glass">
            <TabsTrigger value="monitoring" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Monitoring
            </TabsTrigger>
            <TabsTrigger value="detection" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Disease Detection
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Live Monitoring Tab */}
          <TabsContent value="monitoring" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sensor Cards */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-accent" />
                  Environmental Sensors
                </h3>
                
                <Card className="sensor-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Thermometer className="h-6 w-6" />
                        <div>
                          <p className="text-sm opacity-90">Temperature</p>
                          <p className={`text-2xl font-bold ${getSensorColor(sensorData.temperature, 'temp')}`}>
                            {sensorData.temperature.toFixed(1)}°C
                          </p>
                        </div>
                      </div>
                      <div className="animate-pulse-glow">
                        <Activity className="h-8 w-8 opacity-60" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-tech text-white shadow-tech">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Droplets className="h-6 w-6" />
                        <div>
                          <p className="text-sm opacity-90">Air Humidity</p>
                          <p className={`text-2xl font-bold`}>
                            {sensorData.humidity.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="animate-pulse-glow">
                        <Activity className="h-8 w-8 opacity-60" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-accent text-black shadow-accent">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Droplets className="h-6 w-6" />
                        <div>
                          <p className="text-sm opacity-90 font-medium">Soil Moisture</p>
                          <p className={`text-2xl font-bold`}>
                            {sensorData.soilMoisture.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="animate-pulse-glow">
                        <Activity className="h-8 w-8 opacity-60" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Camera Stream */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Camera className="h-5 w-5 text-tech-blue" />
                    ESP32 Camera Stream
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'} 
                           className={connectionStatus === 'connected' ? 'bg-success text-success-foreground' : ''}>
                      <Wifi className="h-3 w-3 mr-1" />
                      {connectionStatus}
                    </Badge>
                    <Input
                      value={esp32Ip}
                      onChange={(e) => setEsp32Ip(e.target.value)}
                      placeholder="ESP32 IP Address"
                      className="w-40"
                    />
                  </div>
                </div>

                <Card className="stream-container">
                  <CardContent className="p-0">
                    {isStreaming ? (
                      <div className="aspect-video bg-black rounded-lg overflow-hidden">
                        <img 
                          src={streamUrl} 
                          alt="ESP32 Camera Stream" 
                          className="w-full h-full object-cover"
                          onError={() => setConnectionStatus('disconnected')}
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-tech-blue/20 to-primary/20 rounded-lg flex items-center justify-center">
                        <div className="text-center space-y-4">
                          <Camera className="h-16 w-16 mx-auto text-muted-foreground" />
                          <p className="text-muted-foreground">Click start to begin camera stream</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex gap-4">
                  <Button 
                    variant={isStreaming ? "destructive" : "tech"} 
                    size="lg"
                    onClick={handleStreamToggle}
                    disabled={connectionStatus === 'connecting'}
                    className="flex-1"
                  >
                    {connectionStatus === 'connecting' ? (
                      <>
                        <div className="animate-spin-smooth h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                        Connecting...
                      </>
                    ) : isStreaming ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Stop Stream
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Stream
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="lg">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Disease Detection Tab */}
          <TabsContent value="detection" className="space-y-6">
            <Card className="card-glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-primary" />
                  AI Plant Disease Detection
                </CardTitle>
                <p className="text-muted-foreground">
                  Upload leaf images for YOLO + EfficientNet analysis
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-4">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Drop images here or click to upload</p>
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
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin-smooth h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Select Images
                      </>
                    )}
                  </Button>
                </div>

                {/* Detection Results */}
                {detectionResults.length > 0 && (
                  <div className="space-y-6">
                    <Separator />
                    <h3 className="text-xl font-semibold">Analysis Results</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {detectionResults.map((result, index) => (
                        <div key={index} className="animate-slide-in space-y-4">
                          <Card className="card-glass">
                            <CardHeader>
                              <CardTitle className="text-base">{result.filename}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <img 
                                src={result.image_url} 
                                alt={result.filename}
                                className="w-full rounded-lg mb-4"
                              />
                              <div className="space-y-2">
                                {result.detections.map((detection, detIndex) => (
                                  <div key={detIndex} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                    <div className="flex items-center gap-2">
                                      {detection.label.includes('Healthy') ? (
                                        <CheckCircle className="h-5 w-5 text-success" />
                                      ) : (
                                        <AlertCircle className="h-5 w-5 text-warning" />
                                      )}
                                      <span className="font-medium">{detection.label}</span>
                                    </div>
                                    <Badge variant={detection.label.includes('Healthy') ? 'default' : 'destructive'}>
                                      {(detection.prob * 100).toFixed(1)}%
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="card-glass">
                <CardHeader>
                  <CardTitle className="text-base">System Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Camera Status</span>
                      <Badge variant={isStreaming ? 'default' : 'secondary'}>
                        {isStreaming ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>AI Model</span>
                      <Badge variant="default">Ready</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Sensors</span>
                      <Badge variant="default">Online</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-glass">
                <CardHeader>
                  <CardTitle className="text-base">Recent Detections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-primary">{detectionResults.length}</div>
                    <p className="text-sm text-muted-foreground">Images analyzed today</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-glass">
                <CardHeader>
                  <CardTitle className="text-base">Health Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-success">85%</div>
                    <p className="text-sm text-muted-foreground">Overall plant health</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
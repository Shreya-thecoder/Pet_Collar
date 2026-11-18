import { useState, useEffect, useRef } from 'react';
import { calculateDistanceMeters } from '../utils/geofence';

export function useCollarSystem() {
  // --- Persistent Settings ---
  const [petName, setPetName] = useState(() => localStorage.getItem('collar_petName') || 'Max');
  const [homeCoords, setHomeCoords] = useState(() => {
    const saved = localStorage.getItem('collar_homeCoords');
    return saved ? JSON.parse(saved) : { lat: 28.6139, lng: 77.2090, address: 'New Delhi, India' };
  });
  const [safeRadius, setSafeRadius] = useState(() => Number(localStorage.getItem('collar_safeRadius')) || 500);
  const [geofenceEnabled, setGeofenceEnabled] = useState(() => localStorage.getItem('collar_geofence') !== 'false');
  const [serialPort, setSerialPort] = useState(() => localStorage.getItem('collar_port') || 'COM3');
  const [demoMode, setDemoMode] = useState(false);

  // --- Live Sensor Telemetry State ---
  const [telemetry, setTelemetry] = useState({
    esp32_connected: false,
    gps_connected: false,
    gps_valid: false,
    mpu_connected: false,
    latitude: 28.6139,
    longitude: 77.2090,
    speed_kmh: 0.0,
    satellites: 0,
    activity: 'UNKNOWN',
    acceleration: { x: 0, y: 0, z: 9.8 },
    timestamp: new Date().toISOString(),
  });

  const [alerts, setAlerts] = useState([]);
  const [trail, setTrail] = useState([]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('collar_petName', petName);
    localStorage.setItem('collar_homeCoords', JSON.stringify(homeCoords));
    localStorage.setItem('collar_safeRadius', safeRadius);
    localStorage.setItem('collar_geofence', geofenceEnabled);
    localStorage.setItem('collar_port', serialPort);
  }, [petName, homeCoords, safeRadius, geofenceEnabled, serialPort]);

  // Alert helper with deduplication
  const addAlert = (severity, message) => {
    const newAlert = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      severity,
      message,
    };
    setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
  };

  // --- Demo Mode Simulation Loop ---
  useEffect(() => {
    if (!demoMode) return;

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      const angle = step * 0.1;
      const radiusOffset = 0.003 * Math.sin(angle); 
      const simLat = homeCoords.lat + radiusOffset;
      const simLng = homeCoords.lng + radiusOffset;

      setTelemetry({
        esp32_connected: true,
        gps_connected: true,
        gps_valid: true,
        mpu_connected: true,
        latitude: simLat,
        longitude: simLng,
        speed_kmh: Number((Math.sin(angle) * 3 + 3).toFixed(1)),
        satellites: 9,
        activity: step % 4 === 0 ? 'STATIONARY' : 'MOVING',
        acceleration: { x: 0.2, y: 0.4, z: 9.7 },
        timestamp: new Date().toISOString(),
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [demoMode, homeCoords]);

  // --- WebSocket Connection to FastAPI Backend ---
  useEffect(() => {
    if (demoMode) return;

    const ws = new WebSocket('ws://localhost:8000/ws/telemetry');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setTelemetry(data);
      } catch (e) {
        console.error('Invalid WebSocket JSON', e);
      }
    };

    ws.onerror = () => {
      setTelemetry((prev) => ({ ...prev, esp32_connected: false }));
    };

    return () => ws.close();
  }, [demoMode]);

  // --- Geofence & Status Transition Monitoring ---
  const distance = calculateDistanceMeters(homeCoords.lat, homeCoords.lng, telemetry.latitude, telemetry.longitude);
  const isOutside = geofenceEnabled && distance > safeRadius;
  
  const prevStateRef = useRef({ isOutside, espConnected: telemetry.esp32_connected });
  useEffect(() => {
    const prev = prevStateRef.current;

    if (geofenceEnabled && telemetry.gps_valid) {
      if (!prev.isOutside && isOutside) {
        addAlert('CRITICAL', `Your pet has left the Safe Zone! (${distance}m away)`);
      } else if (prev.isOutside && !isOutside) {
        addAlert('INFO', 'Your pet has returned to the Safe Zone.');
      }
    }

    if (!prev.espConnected && telemetry.esp32_connected) {
      addAlert('INFO', 'Collar ESP32 hardware connected successfully.');
    } else if (prev.espConnected && !telemetry.esp32_connected && !demoMode) {
      addAlert('WARNING', 'Collar disconnected! Sensors offline.');
    }

    prevStateRef.current = { isOutside, espConnected: telemetry.esp32_connected };
  }, [isOutside, telemetry.esp32_connected, geofenceEnabled, telemetry.gps_valid, distance, demoMode]);

  useEffect(() => {
    if (telemetry.gps_valid && telemetry.latitude && telemetry.longitude) {
      setTrail((prev) => [...prev.slice(-20), [telemetry.latitude, telemetry.longitude]]);
    }
  }, [telemetry.latitude, telemetry.longitude, telemetry.gps_valid]);

  return {
    petName, setPetName,
    homeCoords, setHomeCoords,
    safeRadius, setSafeRadius,
    geofenceEnabled, setGeofenceEnabled,
    serialPort, setSerialPort,
    demoMode, setDemoMode,
    telemetry,
    alerts,
    trail,
    distance,
    isOutside,
  };
}
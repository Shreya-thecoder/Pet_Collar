import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom paw icon for pet
const pawIcon = L.divIcon({
  className: 'custom-pet-marker',
  html: `<div style="background-color: #3b82f6; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.2); font-weight: bold; font-size: 14px;">🐾</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const homeIcon = L.divIcon({
  className: 'custom-home-marker',
  html: `<div style="background-color: #10b981; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.2); font-weight: bold; font-size: 14px;">🏠</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export function LiveMap({ telemetry, homeCoords, safeRadius, isOutside, trail, petName }) {
  // State 1: ESP32 Disconnected
  if (!telemetry.esp32_connected) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center h-[550px] flex flex-col items-center justify-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-xl font-semibold text-slate-800">Sensors Not Connected</h3>
        <p className="text-slate-500 mt-1 max-w-md">
          Please connect your ESP32 via USB or enable <b>Demo Mode</b> in the top navigation bar to preview live tracking.
        </p>
      </div>
    );
  }

  // State 2: GPS Searching
  if (!telemetry.gps_valid) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center h-[550px] flex flex-col items-center justify-center">
        <div className="animate-spin text-4xl mb-3">📡</div>
        <h3 className="text-xl font-semibold text-slate-800">GPS Signal Searching...</h3>
        <p className="text-slate-500 mt-1">
          Satellites locked: <span className="font-bold text-slate-700">{telemetry.satellites}</span>. Waiting for valid GPS fix.
        </p>
      </div>
    );
  }

  // State 3: Valid GPS Fix
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="font-semibold text-slate-800">Live GPS & Geofence Map</h2>
          <p className="text-xs text-slate-500">Real-time NEO-6M coordinate telemetry</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${isOutside ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isOutside ? '🚨 OUTSIDE SAFE ZONE' : '🟢 INSIDE SAFE ZONE'}
        </span>
      </div>

      <div className="h-[500px] w-full">
        <MapContainer
          center={[telemetry.latitude, telemetry.longitude]}
          zoom={16}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Home Marker */}
          <Marker position={[homeCoords.lat, homeCoords.lng]} icon={homeIcon}>
            <Popup><b>Home</b><br />{homeCoords.address}</Popup>
          </Marker>

          {/* Safe Zone Circle */}
          <Circle
            center={[homeCoords.lat, homeCoords.lng]}
            radius={safeRadius}
            pathOptions={{
              color: isOutside ? '#ef4444' : '#10b981',
              fillColor: isOutside ? '#ef4444' : '#10b981',
              fillOpacity: 0.15,
            }}
          />

          {/* Movement Trail */}
          <Polyline positions={trail} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.7 }} />

          {/* Pet Marker */}
          <Marker position={[telemetry.latitude, telemetry.longitude]} icon={pawIcon}>
            <Popup>
              <b>{petName}</b><br />
              Speed: {telemetry.speed_kmh} km/h<br />
              Activity: {telemetry.activity}
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}
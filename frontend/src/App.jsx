import React, { useState } from 'react';
import { useCollarSystem } from './hooks/useCollarSystem';
import { LiveMap } from './components/LiveMap';
import { Activity, MapPin, Settings as SettingsIcon, LayoutDashboard, Bell } from 'lucide-react';

export default function App() {
  const collar = useCollarSystem();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [addressInput, setAddressInput] = useState(collar.homeCoords.address);

  // Handle Nominatim Geocoding for Home Setup
  const handleSearchAddress = async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressInput)}`,
        { headers: { 'User-Agent': 'SmartPetCollarCollegeProject/1.0' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        collar.setHomeCoords({ lat, lng, address: addressInput });
        alert('Home location successfully updated!');
      } else {
        alert('Address not found. Please try a more specific location.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to Nominatim geocoding service.');
    }
  };

  // Handle Browser GPS for Home Setup
  const handleBrowserGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const newAddr = `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        collar.setHomeCoords({ lat, lng, address: newAddr });
        setAddressInput(newAddr);
        alert('Home location updated to your current browser GPS!');
      },
      () => {
        alert('Unable to retrieve your location.');
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Top Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🐾</span>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              {collar.petName}&apos;s Smart Collar
            </h1>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                collar.telemetry.esp32_connected
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {collar.telemetry.esp32_connected ? '● Hardware Connected' : '○ Disconnected'}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Demo Mode Toggle */}
            <label className="flex items-center cursor-pointer bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 transition">
              <span className="text-xs font-semibold mr-2 text-slate-700">DEMO MODE</span>
              <input
                type="checkbox"
                checked={collar.demoMode}
                onChange={(e) => collar.setDemoMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
            </label>
          </div>
        </div>
      </header>

      {/* Sub-Navbar Tabs */}
      <nav className="bg-white border-b border-slate-200 shadow-sm overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 flex space-x-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'map', label: 'Live Location', icon: MapPin },
            { id: 'activity', label: 'Activity', icon: Activity },
            { id: 'alerts', label: `Alerts (${collar.alerts.length})`, icon: Bell },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {collar.demoMode && (
          <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl flex items-center justify-between">
            <span className="text-sm font-medium">
              ✨ DEMO DATA ACTIVE: Simulating movement, speed, and geofence boundary crossings.
            </span>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pet Activity</p>
                <p className="text-2xl font-bold text-slate-800 mt-2">
                  {collar.telemetry.mpu_connected ? collar.telemetry.activity : 'Not Connected'}
                </p>
                <p className="text-xs text-slate-500 mt-1">MPU6050 Motion Sensor</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">GPS Status</p>
                <p className="text-2xl font-bold text-slate-800 mt-2">
                  {!collar.telemetry.esp32_connected
                    ? 'Offline'
                    : collar.telemetry.gps_valid
                    ? 'Locked 🟢'
                    : 'Searching 📡'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{collar.telemetry.satellites} Satellites</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Distance from Home</p>
                <p className="text-2xl font-bold text-slate-800 mt-2">
                  {collar.telemetry.gps_valid ? `${collar.distance} m` : 'Unknown'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Safe Radius: {collar.safeRadius}m</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Safety Status</p>
                <p
                  className={`text-2xl font-bold mt-2 ${
                    !collar.telemetry.gps_valid
                      ? 'text-slate-400'
                      : collar.isOutside
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {!collar.telemetry.gps_valid
                    ? 'UNKNOWN'
                    : collar.isOutside
                    ? 'OUTSIDE'
                    : 'SAFE'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Geofence: {collar.geofenceEnabled ? 'Active' : 'Disabled'}
                </p>
              </div>
            </div>

            <LiveMap
              telemetry={collar.telemetry}
              homeCoords={collar.homeCoords}
              safeRadius={collar.safeRadius}
              isOutside={collar.isOutside}
              trail={collar.trail}
              petName={collar.petName}
            />
          </div>
        )}

        {/* TAB 2: LIVE MAP */}
        {activeTab === 'map' && (
          <LiveMap
            telemetry={collar.telemetry}
            homeCoords={collar.homeCoords}
            safeRadius={collar.safeRadius}
            isOutside={collar.isOutside}
            trail={collar.trail}
            petName={collar.petName}
          />
        )}

        {/* TAB 3: ACTIVITY */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">MPU6050 Motion Sensor Telemetry</h2>
              <p className="text-xs text-slate-500">Raw accelerometer readings and motion classification</p>
            </div>

            {!collar.telemetry.mpu_connected ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-700">Motion Sensor Not Connected</p>
                <p className="text-xs text-slate-500 mt-1">Connect ESP32 + MPU6050 or turn on Demo Mode.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                    <span className="text-xs text-slate-500">Acceleration X</span>
                    <p className="text-xl font-bold text-slate-800">{collar.telemetry.acceleration.x} m/s²</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                    <span className="text-xs text-slate-500">Acceleration Y</span>
                    <p className="text-xl font-bold text-slate-800">{collar.telemetry.acceleration.y} m/s²</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                    <span className="text-xs text-slate-500">Acceleration Z</span>
                    <p className="text-xl font-bold text-slate-800">{collar.telemetry.acceleration.z} m/s²</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-800">Current Activity State</h4>
                    <p className="text-xs text-slate-500">Threshold-based motion filter</p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-lg font-bold text-sm ${
                      collar.telemetry.activity === 'MOVING'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {collar.telemetry.activity}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 4: ALERTS */}
        {activeTab === 'alerts' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">System Safety Alerts</h2>
            {collar.alerts.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No alerts recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {collar.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between"
                  >
                    <div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded mr-2 ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700'
                            : alert.severity === 'WARNING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-sm text-slate-800">{alert.message}</span>
                    </div>
                    <span className="text-xs text-slate-400">{alert.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-800">Collar & Geofence Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Pet Name</label>
                <input
                  type="text"
                  value={collar.petName}
                  onChange={(e) => collar.setPetName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">
                  Home Address Setup (OpenStreetMap Nominatim)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="Enter city, street, or landmark..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSearchAddress}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                  >
                    Convert
                  </button>
                  <button
                    onClick={handleBrowserGPS}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
                  >
                    Detect My Location
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Saved Home Coords: {collar.homeCoords.lat.toFixed(5)}, {collar.homeCoords.lng.toFixed(5)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">
                  Safe Zone Radius ({collar.safeRadius} meters)
                </label>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="50"
                  value={collar.safeRadius}
                  onChange={(e) => collar.setSafeRadius(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <h4 className="text-sm font-medium text-slate-800">Enable Geofencing Alerts</h4>
                  <p className="text-xs text-slate-400">Trigger critical alerts when pet leaves safe zone</p>
                </div>
                <input
                  type="checkbox"
                  checked={collar.geofenceEnabled}
                  onChange={(e) => collar.setGeofenceEnabled(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
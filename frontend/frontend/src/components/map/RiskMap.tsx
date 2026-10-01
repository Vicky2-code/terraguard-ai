import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRiskStore } from '../context/RiskContext';

// Fix for default Leaflet marker icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const getRiskColor = (level: string) => {
  switch (level) {
    case 'CRITICAL': return '#ef4444'; // Red
    case 'HIGH': return '#f97316';     // Orange
    case 'MODERATE': return '#eab308'; // Yellow
    default: return '#22c55e';         // Green
  }
};

export const RiskMap: React.FC = () => {
  const locations = useRiskStore((state) => state.locations);
  const locationList = Object.values(locations);

  // Center map on Northeast India
  const center: [number, number] = [27.33, 88.61];

  return (
    <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%', borderRadius: '1rem' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {locationList.map((loc) => (
        <React.Fragment key={loc.location_id}>
          <Marker
            position={[27.33 + (loc.location_id * 0.1), 88.61 + (loc.location_id * 0.1)]} // Simulated spread
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-bold text-gray-800">{loc.location_name}</h3>
                <p className="text-sm text-gray-600">Risk Score: <span className="font-bold">{loc.risk_score}</span></p>
                <p className="text-sm font-bold" style={{ color: getRiskColor(loc.risk_level) }}>
                  {loc.risk_level}
                </p>
                <div className="mt-2 text-xs text-gray-500">
                  Rain: {loc.readings.rainfall}mm | Moisture: {loc.readings.soil_moisture}%
                </div>
              </div>
            </Popup>
          </Marker>
          <Circle
            center={[27.33 + (loc.location_id * 0.1), 88.61 + (loc.location_id * 0.1)]}
            radius={5000}
            pathOptions={{ color: getRiskColor(loc.risk_level), fillColor: getRiskColor(loc.risk_level), fillOpacity: 0.4 }}
          />
        </React.Fragment>
      ))}
    </MapContainer>
  );
};

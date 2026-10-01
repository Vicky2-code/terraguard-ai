import React from 'react';
import { useRiskStore } from '../../context/RiskContext';

export const LiveMonitor: React.FC = () => {
  const locations = useRiskStore((state) => state.locations);
  const sortedLocations = Object.values(locations).sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
      <h2 className="text-xl font-bold mb-4 text-white">Live Risk Feed</h2>
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {sortedLocations.length === 0 ? (
          <p className="text-gray-400 italic">Waiting for sensor data...</p>
        ) : (
          sortedLocations.map((loc) => (
            <div key={loc.location_id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <div>
                <p className="font-semibold text-white">{loc.location_name}</p>
                <p className="text-xs text-gray-400">{new Date(loc.timestamp).toLocaleTimeString()}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${
                  loc.risk_level === 'CRITICAL' ? 'text-red-500' :
                  loc.risk_level === 'HIGH' ? 'text-orange-500' :
                  loc.risk_level === 'MODERATE' ? 'text-yellow-500' : 'text-green-500'
                }`}>
                  {loc.risk_score}/100
                </p>
                <p className="text-xs font-medium uppercase text-gray-300">{loc.risk_level}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

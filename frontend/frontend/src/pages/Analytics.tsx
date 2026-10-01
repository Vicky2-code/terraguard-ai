import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useRiskStore } from '../context/RiskContext';

export const RiskAnalytics: React.FC = () => {
  const locations = useRiskStore((state) => state.locations);
  const locationList = Object.values(locations);

  if (locationList.length === 0) {
    return <div className="p-8 text-center text-gray-400">No data available for analytics.</div>;
  }

  const mainLocation = locationList[0];
  // In a real app, we would fetch historical data from /api/analytics/risk
  // For the prototype, we simulate a trend line
  const trendData = Array.from({ length: 20 }).map((_, i) => ({
    time: `${i}:00`,
    risk: Math.floor(Math.random() * 40) + (i > 10 ? 40 : 0), // Simulate a spike
  }));

  return (
    <div className="space-y-8 p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Risk Analysis: {mainLocation.location_name}</h2>
        <select className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1">
          <option>Last 24 Hours</option>
          <option>Last 7 Days</option>
        </select>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
            <XAxis dataKey="time" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1B4332', border: '1px solid #ffffff30', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="risk" stroke="#ef4444" fillOpacity={1} fill="url(#colorRisk)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <p className="text-sm text-gray-400">Peak Risk</p>
          <p className="text-2xl font-bold text-red-500">88/100</p>
        </div>
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <p className="text-sm text-gray-400">Avg. Soil Moisture</p>
          <p className="text-2xl font-bold text-white">72%</p>
        </div>
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <p className="text-sm text-gray-400">Trend</p>
          <p className="text-2xl font-bold text-orange-500">Increasing</p>
        </div>
      </div>
    </div>
  );
};

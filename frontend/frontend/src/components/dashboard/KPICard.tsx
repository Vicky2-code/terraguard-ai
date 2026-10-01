import React from 'react';
import { useRiskStore } from '../../context/RiskContext';
import { AlertTriangle, CheckCircle, Info, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';

interface KPICardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, icon, color }) => (
  <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center space-x-4">
    <div className={`p-3 rounded-xl ${color} bg-opacity-20 text-white`}>
      {icon}
    </div>
    <div>
      <p className="text-sm text-gray-300 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  </div>
);

export const DashboardKPIs: React.FC = () => {
  const { criticalZones, highRiskZones, activeAlerts, locations } = useRiskStore();
  const totalLocations = Object.keys(locations).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <KPICard
        title="Monitored Sites"
        value={totalLocations}
        icon={<Info size={24} />}
        color="bg-blue-500"
      />
      <KPICard
        title="High Risk"
        value={highRiskZones}
        icon={<TrendingUp size={24} />}
        color="bg-orange-500"
      />
      <KPICard
        title="Critical Risk"
        value={criticalZones}
        icon={<AlertTriangle size={24} />}
        color="bg-red-500"
      />
      <KPICard
        title="Active Alerts"
        value={activeAlerts}
        icon={<CheckCircle size={24} />}
        color="bg-green-500"
      />
    </div>
  );
};

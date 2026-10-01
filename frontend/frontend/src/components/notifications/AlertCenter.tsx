import React from 'react';
import { useRiskStore } from '../context/RiskContext';

export const AlertNotification: React.FC<{alert: any}> = ({ alert }) => (
  <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg animate-bounce border-2 border-white">
    <div className="flex items-center space-x-2">
      <span className="text-2xl">🚨</span>
      <span className="font-bold">{alert.message}</span>
    </div>
    <p className="text-xs mt-1">{alert.timestamp}</p>
  </div>
);

export const NotificationCenter: React.FC = () => {
  const [alerts, setAlerts] = React.useState<any[]>([]);

  React.useEffect(() => {
    const socket = new WebSocket(`ws://localhost:8000/ws/notifications`);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'ALERT_NOTIFICATION') {
        setAlerts(prev => [data, ...prev].slice(0, 5));
      }
    };
    return () => socket.close();
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2">
      {alerts.map((alert, i) => (
        <AlertNotification key={i} alert={alert} />
      ))}
    </div>
  );
};

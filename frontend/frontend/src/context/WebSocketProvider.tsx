import React, { useEffect } from 'react';
import { useRiskStore } from '../context/RiskContext';

export const WebSocketProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const updateRisk = useRiskStore((state) => state.updateRisk);

  useEffect(() => {
    const clientId = Math.random().toString(36).substring(7);
    const socket = new WebSocket(`ws://localhost:8000/ws/${clientId}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'RISK_UPDATE') {
        updateRisk(data);
      }
    };

    socket.onclose = () => console.log("WebSocket disconnected");
    socket.onerror = (err) => console.error("WebSocket error:", err);

    return () => socket.close();
  }, [updateRisk]);

  return <>{children}</>;
};

import { create } from 'zustand';

export interface RiskUpdate {
  location_id: number;
  location_name: string;
  risk_score: number;
  risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  readings: {
    rainfall: number;
    rainfall_accumulation: number;
    soil_moisture: number;
    temperature: number;
    humidity: number;
    slope_movement: number;
  };
  timestamp: string;
}

interface RiskState {
  locations: Record<number, RiskUpdate>;
  activeAlerts: number;
  criticalZones: number;
  highRiskZones: number;
  updateRisk: (update: RiskUpdate) => void;
  resetRisk: () => void;
}

export const useRiskStore = create<RiskState>((set) => ({
  locations: {},
  activeAlerts: 0,
  criticalZones: 0,
  highRiskZones: 0,
  updateRisk: (update) => set((state) => {
    const newLocations = { ...state.locations, [update.location_id]: update };

    // Recalculate counts
    const allValues = Object.values(newLocations);
    const critical = allValues.filter(l => l.risk_level === 'CRITICAL').length;
    const high = allValues.filter(l => l.risk_level === 'HIGH').length;

    return {
      locations: newLocations,
      criticalZones: critical,
      highRiskZones: high,
      activeAlerts: critical // Simplified for prototype
    };
  }),
  resetRisk: () => set({ locations: {}, activeAlerts: 0, criticalZones: 0, highRiskZones: 0 }),
}));

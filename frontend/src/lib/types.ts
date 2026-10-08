/** Shared API types — mirrors docs/api-contract.md */

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "CRITICAL";
export type SourceStatus = "LIVE" | "STALE" | "UNAVAILABLE" | "DEMO";

export interface Meta {
  source: string;
  source_status: SourceStatus;
  last_updated: string | null;
  data_age_seconds: number;
  refresh_interval_seconds?: number;
}

export interface KpiValue {
  value: number | null;
  status?: string;
  updated_at?: string;
  source?: string;
  delta?: number | null;
}

export interface TimelineEvent {
  id: string | number;
  type: string;
  message: string;
  location?: string;
  timestamp: string;
  severity?: string;
}

export interface PriorityRow {
  id: string | number;
  location: string;
  risk_score: number;
  population?: number;
  priority: "P1" | "P2" | "P3";
  reason?: string;
}

export interface DashboardResponse {
  kpis: Record<string, KpiValue>;
  timeline: TimelineEvent[];
  priority_queue: PriorityRow[];
  generated_at: string;
}

export interface LocationRec {
  id: number;
  name: string;
  state: string;
  district?: string;
  latitude: number;
  longitude: number;
  elevation_m?: number;
  slope_deg?: number;
  land_cover?: string;
  population: number;
  risk_score: number;
  risk_level: RiskLevel;
  rainfall_mm_24h?: number;
  soil_moisture?: number;
  status?: string;
  assessed_at?: string;
}

export interface RiskMapResponse {
  features: LocationRec[];
  legend: { level: RiskLevel; min: number; max: number; color: string }[];
  regions: string[];
  meta: Meta;
}

export interface RiskDetail {
  location: LocationRec;
  current: {
    risk_score: number;
    risk_level: RiskLevel;
    confidence: number | null;
    model_version: string;
    assessed_at: string;
    contributions: { feature: string; value: string | number; contribution: number }[];
  };
  history: { assessed_at: string; risk_score: number; risk_level: RiskLevel }[];
}

export interface WeatherReading {
  location_id?: number | null;
  location_name?: string;
  temperature_c: number;
  humidity_pct: number;
  wind_kmh: number;
  pressure_hpa?: number;
  rainfall_mm_1h: number;
  rainfall_mm_6h: number;
  rainfall_mm_24h: number;
  forecast_24h_mm?: number;
  observed_at: string;
  meta: Meta;
}

export interface WeatherHistory {
  series: { time: string; rainfall_mm: number; temperature_c: number }[];
  meta: Meta;
}

export interface SoilLayer {
  label: string;
  moisture: number;
  saturation_pct: number;
  status: string;
}

export interface SoilMoistureResponse {
  location_id?: number | null;
  location_name?: string;
  layers: SoilLayer[];
  trend: { time: string; moisture: number }[];
  observed_at: string;
  meta: Meta;
}

export interface Incident {
  id: number;
  public_id: string;
  type: string;
  description: string;
  location_name: string;
  latitude?: number | null;
  longitude?: number | null;
  severity: string;
  status: string;
  reporter: string;
  region?: string;
  assigned_to?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface IncidentList {
  items: Incident[];
  total: number;
  meta: Meta;
}

export interface Alert {
  id: number;
  location_id?: number | null;
  location_name: string;
  risk_level: RiskLevel;
  risk_score: number;
  trigger: string;
  message: string;
  status: string;
  delivery_status: string;
  simulation?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface AlertList {
  items: Alert[];
  meta: Meta;
}

export interface Thresholds {
  low: number;
  moderate: number;
  high: number;
  very_high: number;
  critical: number;
}

export interface PredictResponse {
  risk_score: number;
  risk_level: RiskLevel;
  model_version: string;
  timestamp: string;
  confidence: number | null;
  feature_contributions: { feature: string; contribution: number }[];
  model_status: string;
  latency_ms?: number;
}

export interface ScenarioState {
  state: "IDLE" | "RUNNING" | "PAUSED";
  started_at: string | null;
  step: number;
  events: TimelineEvent[];
  simulation: boolean;
}

export interface AnalyticsResponse {
  kpis: Record<string, number | null>;
  regional_risk: { region: string; risk_score: number }[];
  incident_distribution: { type: string; count: number }[];
  alert_history: { time: string; count: number }[];
  meta: Meta;
}

export interface TemporalResponse {
  rainfall: { time: string; value: number }[];
  risk: { time: string; value: number }[];
  incidents: { time: string; value: number }[];
  alerts: { time: string; value: number }[];
  meta: Meta;
}

export interface ModelInfo {
  name: string;
  version: string;
  status: string;
  trained_at: string | null;
  dataset_version: string | null;
  metrics: Record<string, number | null> | null;
  deployed_at: string | null;
  drift_status: string | null;
  model_type: string;
  notes?: string | null;
}

export interface PipelineComponent {
  name: string;
  status: "ONLINE" | "DEGRADED" | "OFFLINE";
  detail: string;
  last_checked: string;
}

export interface PipelineRun {
  job_name: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  message?: string | null;
}

export interface PipelineResponse {
  components: PipelineComponent[];
  runs: PipelineRun[];
  meta: Meta;
}

export interface SettingsResponse {
  thresholds: Thresholds;
  region: string;
  language: string;
  refresh_interval_seconds: number;
  notifications: Record<string, boolean>;
  updated_at?: string | null;
}

export interface Corridor {
  id: number;
  name: string;
  route: string;
  from: string;
  to: string;
  status: string;
  risk_level: RiskLevel;
  blockage?: string | null;
  incident_count: number;
  last_update: string;
  demo?: boolean;
}

export interface Infrastructure {
  id: number;
  name: string;
  type: string;
  region: string;
  latitude: number;
  longitude: number;
  criticality: string;
  status: string;
  risk_score: number;
}

export interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  timestamp: string;
  checks: Record<string, { status: string; detail: string; last_checked: string }>;
}

export interface StatusResponse {
  system: "LIVE" | "DEMO";
  last_sync: string;
  uptime_seconds: number;
  backend_version: string;
  weather_source: string;
  demo_mode: boolean;
  connection?: Record<string, unknown>;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "VIEWER" | "FIELD_OFFICER" | "ANALYST" | "ADMIN";
}

export interface LoginResponse {
  token: string;
  token_type: string;
  user: AuthUser;
}

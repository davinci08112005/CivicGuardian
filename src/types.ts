export interface EmergencyCall {
  id: string;
  incident_type: string;
  timestamp: string;
  hour: number;
  dayOfWeek: string;
  location: string;
  latitude: number;
  longitude: number;
  priority: string;
  district: string;
}

export interface DailyTrend {
  date: string;
  count: number;
}

export interface HourlyTrend {
  hour: number;
  count: number;
}

export interface IncidentTypeDistribution {
  type: string;
  count: number;
}

export interface DistrictStats {
  district: string;
  count: number;
}

export interface SafetyAlert {
  id: string;
  type: 'Anomaly' | 'Critical' | 'Trend';
  title: string;
  description: string;
  location: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
}

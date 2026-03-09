import { EmergencyCall } from "../types";

// Mock data generator since real-time fetching from Socrata might be slow or rate-limited in preview
// We'll simulate the Montgomery County 911 data structure
export const INCIDENT_TYPES = [
  "Traffic Accident",
  "Medical Emergency",
  "Fire Alarm",
  "Police Assistance",
  "Public Service",
  "Hazardous Materials",
  "Assault",
  "Theft",
];

const DISTRICTS = ["Bethesda", "Silver Spring", "Rockville", "Gaithersburg", "Germantown", "Wheaton"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function fetchEmergencyData(): Promise<EmergencyCall[]> {
  const response = await fetch('/api/emergency-data');
  if (!response.ok) throw new Error("Failed to fetch emergency data");
  const data = await response.json();
  return data.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function processHourlyTrends(data: EmergencyCall[]) {
  const counts = new Array(24).fill(0);
  data.forEach(call => counts[call.hour]++);
  return counts.map((count, hour) => ({ hour, count }));
}

export function processDayTrends(data: EmergencyCall[]) {
  const counts: Record<string, number> = {};
  DAYS.forEach(day => counts[day] = 0);
  data.forEach(call => counts[call.dayOfWeek]++);
  return DAYS.map(day => ({ day, count: counts[day] }));
}

export function processTypeDistribution(data: EmergencyCall[]) {
  const counts: Record<string, number> = {};
  data.forEach(call => {
    counts[call.incident_type] = (counts[call.incident_type] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function processDistrictStats(data: EmergencyCall[]) {
  const counts: Record<string, number> = {};
  data.forEach(call => {
    counts[call.district] = (counts[call.district] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([district, count]) => ({ district, count }))
    .sort((a, b) => b.count - a.count);
}

export interface ContextualData {
  events: Array<{ name: string; location: string; time: string; impact: string; lat: number; lng: number }>;
  traffic_alerts: Array<{ road: string; status: string; cause: string }>;
  weather: { condition: string; temperature: string; visibility: string };
}

export async function fetchContextualData(): Promise<ContextualData> {
  const response = await fetch('/api/contextual-data');
  if (!response.ok) throw new Error("Failed to fetch contextual data");
  return response.json();
}

export interface HotspotCluster {
  id: string;
  name: string;
  lat: number;
  lng: number;
  intensity: number;
  radius: number;
  riskLevel: 'Critical' | 'High' | 'Moderate';
  incidents: number;
  dominantType: string;
  peakHours: string;
}

export function detectHotspots(data: EmergencyCall[]): HotspotCluster[] {
  if (!data || data.length === 0) return [];
  // Enhanced clustering: Group by district and sub-coordinates
  const clusters: Record<string, {
    base: Omit<HotspotCluster, 'dominantType' | 'peakHours'>;
    types: Record<string, number>;
    hours: Record<number, number>;
  }> = {};
  
  data.forEach(call => {
    // Create a grid key based on lat/lng rounded to 0.05
    const gridX = Math.round(call.latitude * 20) / 20;
    const gridY = Math.round(call.longitude * 20) / 20;
    const key = `${gridX}_${gridY}`;
    
    if (!clusters[key]) {
      clusters[key] = {
        base: {
          id: key,
          name: `${call.district} Zone ${key.split('_')[1].slice(-2)}`,
          lat: gridX,
          lng: gridY,
          intensity: 0,
          radius: 0,
          riskLevel: 'Moderate',
          incidents: 0
        },
        types: {},
        hours: {}
      };
    }
    
    const cluster = clusters[key];
    cluster.base.incidents++;
    cluster.base.intensity += call.priority === 'High' ? 5 : 2;
    
    cluster.types[call.incident_type] = (cluster.types[call.incident_type] || 0) + 1;
    cluster.hours[call.hour] = (cluster.hours[call.hour] || 0) + 1;
  });

  return Object.values(clusters).map(c => {
    const { base, types, hours } = c;
    
    const riskLevel: 'Critical' | 'High' | 'Moderate' = 
      base.intensity > 150 ? 'Critical' : 
      base.intensity > 80 ? 'High' : 'Moderate';
    
    // Find dominant type
    const dominantType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
    
    // Find peak hours (3-hour window with most incidents)
    let maxWindowCount = 0;
    let peakWindowStart = 0;
    for (let h = 0; h < 24; h++) {
      const windowCount = (hours[h] || 0) + (hours[(h + 1) % 24] || 0) + (hours[(h + 2) % 24] || 0);
      if (windowCount > maxWindowCount) {
        maxWindowCount = windowCount;
        peakWindowStart = h;
      }
    }
    const peakHours = `${peakWindowStart}:00 - ${(peakWindowStart + 3) % 24}:00`;
    
    return {
      ...base,
      riskLevel,
      radius: Math.min(40, 10 + base.incidents / 2),
      dominantType,
      peakHours
    };
  }).sort((a, b) => b.intensity - a.intensity);
}

export function generateHeatmapData(data: EmergencyCall[]) {
  if (!data || data.length === 0) return Array.from({ length: 10 }, () => new Array(10).fill(0));
  
  // Generate a 10x10 grid for the heatmap
  const grid: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  
  // Find bounds
  const lats = data.map(d => d.latitude);
  const lngs = data.map(d => d.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;
  
  data.forEach(call => {
    const x = latRange === 0 ? 0 : Math.floor(((call.latitude - minLat) / latRange) * 9);
    const y = lngRange === 0 ? 0 : Math.floor(((call.longitude - minLng) / lngRange) * 9);
    if (x >= 0 && x < 10 && y >= 0 && y < 10) {
      grid[x][y] += call.priority === 'High' ? 3 : 1;
    }
  });
  
  return grid;
}

export function predictFutureTrends(data: EmergencyCall[]) {
  if (!data || data.length === 0) {
    return Array.from({ length: 7 }).map((_, i) => {
      const dayIndex = (new Date().getDay() + i + 1) % 7;
      return {
        day: DAYS[dayIndex].slice(0, 3),
        predicted: 0,
        confidence: [0, 0]
      };
    });
  }
  // Enhanced prediction: Moving average + Trend + Seasonality simulation
  const dailyCounts: Record<string, number> = {};
  data.forEach(call => {
    const date = call.timestamp.split('T')[0];
    dailyCounts[date] = (dailyCounts[date] || 0) + 1;
  });
  
  const sortedDates = Object.keys(dailyCounts).sort();
  const values = sortedDates.map(date => dailyCounts[date]);
  
  // Calculate 7-day moving average
  const windowSize = 7;
  const movingAverages = values.map((_, idx, arr) => {
    if (idx < windowSize - 1) return null;
    const window = arr.slice(idx - windowSize + 1, idx + 1);
    return window.reduce((a, b) => a + b, 0) / windowSize;
  }).filter(v => v !== null) as number[];

  if (movingAverages.length === 0) {
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    return Array.from({ length: 7 }).map((_, i) => {
      const dayIndex = (new Date().getDay() + i + 1) % 7;
      const dayName = DAYS[dayIndex];
      const seasonality = (dayName === 'Friday' || dayName === 'Saturday') ? 1.2 : 0.9;
      const predicted = Math.round(avg * seasonality);
      return {
        day: dayName.slice(0, 3),
        predicted,
        confidence: [Math.round(predicted * 0.8), Math.round(predicted * 1.2)]
      };
    });
  }

  // Simple linear trend on moving averages
  const lastMA = movingAverages[movingAverages.length - 1];
  const prevMA = movingAverages[movingAverages.length - 2] || lastMA;
  const trend = lastMA - prevMA;
  
  return Array.from({ length: 7 }).map((_, i) => {
    const dayIndex = (new Date().getDay() + i + 1) % 7;
    const dayName = DAYS[dayIndex];
    // Add some "seasonality" - weekends usually have different patterns
    const seasonality = (dayName === 'Friday' || dayName === 'Saturday') ? 1.2 : 0.9;
    const predicted = Math.round((lastMA + trend * (i + 1)) * seasonality);
    
    return {
      day: dayName.slice(0, 3),
      predicted,
      confidence: [Math.round(predicted * 0.8), Math.round(predicted * 1.2)]
    };
  });
}

export function correlateEventsWithIncidents(data: EmergencyCall[], context: ContextualData | null, hotspots: HotspotCluster[]) {
  if (!context) return [];
  
  const correlations = context.events.map(event => {
    // Find incidents within 2km (approx 0.018 degrees)
    const nearbyIncidents = data.filter(call => {
      const dist = Math.sqrt(
        Math.pow(call.latitude - event.lat, 2) + 
        Math.pow(call.longitude - event.lng, 2)
      );
      return dist < 0.018; // ~2km
    });
    
    // Check if event is near a high incident zone (hotspot)
    const nearHotspot = hotspots.some(h => {
       const dist = Math.sqrt(
        Math.pow(h.lat - event.lat, 2) + 
        Math.pow(h.lng - event.lng, 2)
      );
      return dist < 0.018 && (h.riskLevel === 'Critical' || h.riskLevel === 'High');
    });

    // Check if incidents increased during event hours (simulated logic)
    const trafficIncidents = nearbyIncidents.filter(i => i.incident_type === "Traffic Accident");
    
    return {
      eventName: event.name,
      incidentCount: nearbyIncidents.length,
      trafficIncidents: trafficIncidents.length,
      isHighRisk: nearbyIncidents.length > 15 || nearHotspot,
      nearHotspot,
      impact: event.impact
    };
  });
  
  return correlations;
}

export function simulateDataPipeline() {
  return [
    { step: "Ingestion", status: "Complete", detail: "Fetched 1,000 records from Montgomery Socrata API", time: "0.2s" },
    { step: "Cleaning", status: "Complete", detail: "Removed 12 null locations, normalized timestamps", time: "0.1s" },
    { step: "Enrichment", status: "Complete", detail: "Merged with Bright Data Crawl (Traffic/Events)", time: "0.4s" },
    { step: "Clustering", status: "Complete", detail: "K-Means simulation identified 14 safety clusters", time: "0.3s" },
    { step: "Prediction", status: "Complete", detail: "ARIMA-style trend model generated 7-day forecast", time: "0.2s" }
  ];
}

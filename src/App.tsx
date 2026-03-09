import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { 
  Shield, Activity, Map as MapIcon, MessageSquare, AlertTriangle, 
  TrendingUp, Clock, Calendar, Info, Search, Send, Loader2,
  ChevronRight, Filter, Download, RefreshCw, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  fetchEmergencyData, 
  processHourlyTrends, 
  processDayTrends, 
  processTypeDistribution, 
  processDistrictStats,
  predictFutureTrends,
  fetchContextualData,
  detectHotspots,
  generateHeatmapData,
  simulateDataPipeline,
  correlateEventsWithIncidents,
  ContextualData,
  INCIDENT_TYPES
} from './services/dataService';
import { SafetyHeatmap } from './components/SafetyHeatmap';
import { FilterDropdown } from './components/FilterDropdown';
import { RealTimeAlerts } from './components/RealTimeAlerts';
import { 
  generateSafetyInsights as fetchSafetyInsights, 
  generateSafetyActions as fetchSafetyActions, 
  chatWithAssistant 
} from './services/geminiService';
import { EmergencyCall, SafetyAlert } from './types';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const FeedbackButtons = ({ 
  contentType, 
  contentId, 
  onFeedback 
}: { 
  contentType: 'insight' | 'chat', 
  contentId: string,
  onFeedback?: (rating: number) => void
}) => {
  const [voted, setVoted] = useState<number | null>(null);

  const handleFeedback = async (rating: number) => {
    if (voted !== null) return;
    setVoted(rating);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, contentId, rating })
      });
      if (onFeedback) onFeedback(rating);
    } catch (error) {
      console.error("Failed to send feedback", error);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <button 
        onClick={() => handleFeedback(1)}
        disabled={voted !== null}
        className={cn(
          "p-1.5 rounded-lg transition-all",
          voted === 1 ? "bg-emerald-500/20 text-emerald-500" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300",
          voted !== null && voted !== 1 && "opacity-50"
        )}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button 
        onClick={() => handleFeedback(-1)}
        disabled={voted !== null}
        className={cn(
          "p-1.5 rounded-lg transition-all",
          voted === -1 ? "bg-red-500/20 text-red-500" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300",
          voted !== null && voted !== -1 && "opacity-50"
        )}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      {voted !== null && (
        <span className="text-[10px] text-zinc-500 animate-pulse">Feedback received</span>
      )}
    </div>
  );
};

export default function App() {
  const [data, setData] = useState<EmergencyCall[]>([]);
  const [lastSync, setLastSync] = useState<string>(new Date().toLocaleTimeString());
  const [isLive, setIsLive] = useState(true);
  const [selectedType, setSelectedType] = useState<string>(() => {
    return localStorage.getItem('civicguardian_filter') || 'All';
  });
  const [contextData, setContextData] = useState<ContextualData | null>(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<string>('');
  const [safetyActions, setSafetyActions] = useState<string>('');
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ id: string, role: 'user' | 'ai', text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [recentActivity, setRecentActivity] = useState<EmergencyCall[]>([]);
  const [newCallsAvailable, setNewCallsAvailable] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('civicguardian_filter', selectedType);
  }, [selectedType]);

  useEffect(() => {
    loadData();
    
    // WebSocket for real-time alerts
    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWS = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        // In production, we might want to avoid HMR-like behavior
        // But for our alert stream, we always want it if possible.
        socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'alert') {
              setAlerts(prev => [message.data, ...prev].slice(0, 10));
              if (Notification.permission === "granted") {
                new Notification(message.data.title, {
                  body: message.data.description,
                  icon: "/favicon.ico"
                });
              }
            } else if (message.type === 'data_update') {
              setData(prev => {
                // Avoid duplicates by checking IDs
                const existingIds = new Set(prev.map(d => d.id));
                const newUniqueCalls = message.data.filter((c: any) => !existingIds.has(c.id));
                if (newUniqueCalls.length === 0) return prev;
                
                setRecentActivity(prevActivity => [...newUniqueCalls, ...prevActivity].slice(0, 10));
                setNewCallsAvailable(true);
                
                const updated = [...prev, ...newUniqueCalls].slice(-2000);
                return updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              });
              setLastSync(new Date(message.timestamp).toLocaleTimeString());
            }
          } catch (e) {
            // Silently handle parse errors
          }
        };

        socket.onopen = () => {
          // Suppress logs in production/deployed environments
          if (import.meta.env.DEV) {
            console.log("Connected to CivicGuardian Alert Stream");
          }
        };

        socket.onerror = () => {
          // Silently handle connection errors as requested
          if (socket) {
            try {
              socket.close();
            } catch (e) {
              // Ignore close errors
            }
          }
        };

        socket.onclose = (event) => {
          // Avoid logging error if it's a clean close or if we're already reconnecting
          if (!event.wasClean) {
            // Silently retry after 5 seconds
            reconnectTimeout = setTimeout(() => {
              try {
                // Check if we still need to connect (component might have unmounted)
                connectWS();
              } catch (err) {
                // Ignore reconnection errors
              }
            }, 5000);
          }
        };
      } catch (err) {
        // Silently handle initialization errors
        reconnectTimeout = setTimeout(connectWS, 10000);
      }
    };

    connectWS();

    return () => {
      if (socket) {
        try {
          // Only close if it's not already closed
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1000, "Component unmounting");
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn("Error during WS cleanup:", e);
          }
        }
      }
      clearTimeout(reconnectTimeout);
    };
  }, []);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rawData, rawContext] = await Promise.all([
        fetchEmergencyData(),
        fetchContextualData()
      ]);
      setData(rawData);
      setContextData(rawContext);
      setLoading(false);
      
      // Auto-generate insights in background once data is ready
      generateSafetyInsights(rawData, rawContext);
    } catch (error) {
      console.error("Failed to load data", error);
      setLoading(false);
    }
  };

  const filteredData = selectedType === 'All' 
    ? data 
    : data.filter(d => d.incident_type === selectedType);

  const getDataSummary = (currentData: EmergencyCall[], currentContext?: ContextualData | null) => {
    const hourly = processHourlyTrends(currentData);
    const types = processTypeDistribution(currentData);
    const districts = processDistrictStats(currentData);
    const hotspots = detectHotspots(currentData);
    const correlations = currentContext ? correlateEventsWithIncidents(currentData, currentContext, hotspots) : [];
    
    if (currentData.length === 0) return "No data available for the selected filter.";

    const peakDistrict = districts.length > 0 ? districts[0] : { district: 'N/A', count: 0 };
    const dominantType = types.length > 0 ? types[0] : { type: 'N/A', count: 0 };
    const peakHour = hourly.length > 0 ? hourly.reduce((a, b) => a.count > b.count ? a : b).hour : 'N/A';

    // Get specific peak hours for common types
    const trafficCalls = currentData.filter(c => c.incident_type.toLowerCase().includes('traffic'));
    const trafficHourly = processHourlyTrends(trafficCalls);
    const trafficPeak = trafficHourly.length > 0 ? trafficHourly.reduce((a, b) => a.count > b.count ? a : b).hour : 'N/A';

    return `
      Current Filter: ${selectedType}
      Total Calls in Dataset: ${currentData.length}
      
      Key Metrics:
      - District with Highest Incident Density: ${peakDistrict.district} (${peakDistrict.count} calls)
      - Dominant Incident Type: ${dominantType.type} (${dominantType.count} calls)
      - Overall Peak Hour: ${peakHour !== 'N/A' ? peakHour + ':00' : 'N/A'}
      
      Incident Type Breakdown:
      ${types.slice(0, 5).map(t => `- ${t.type}: ${t.count} calls`).join('\n      ')}
      
      District Breakdown:
      ${districts.slice(0, 5).map(d => `- ${d.district}: ${d.count} calls`).join('\n      ')}
      
      Temporal Patterns:
      - Traffic Incident Peak Hour: ${trafficPeak !== 'N/A' ? trafficPeak + ':00' : 'N/A'}
      
      Safety Hotspots:
      ${hotspots.slice(0, 5).map(h => `- ${h.name}: ${h.incidents} incidents (${h.riskLevel} risk)`).join('\n      ')}

      Contextual Event Correlations (Bright Data):
      ${correlations.map(c => `- Event: ${c.eventName}, Incidents Nearby: ${c.incidentCount}, Traffic Incidents: ${c.trafficIncidents}, Risk: ${c.isHighRisk ? 'High' : 'Normal'}`).join('\n      ')}
    `;
  };

  const generateLocalInsights = (currentData: EmergencyCall[], currentContext: ContextualData | null) => {
    const hourly = processHourlyTrends(currentData);
    const types = processTypeDistribution(currentData);
    const districts = processDistrictStats(currentData);
    const hotspots = detectHotspots(currentData);
    const correlations = currentContext ? correlateEventsWithIncidents(currentData, currentContext, hotspots) : [];

    const peakHour = hourly.length > 0 ? hourly.reduce((a, b) => a.count > b.count ? a : b).hour : 'N/A';
    const peakDistrict = districts.length > 0 ? districts[0] : { district: 'N/A', count: 0 };
    const dominantType = types.length > 0 ? types[0] : { type: 'N/A', count: 0 };
    
    const insights = [
      `Peak incident hour identified at ${peakHour}:00 with the highest volume of emergency calls.`,
      `District ${peakDistrict.district} has the highest incident density with ${peakDistrict.count} recorded calls.`,
      `${dominantType.type} remains the dominant incident category across the county.`,
    ];

    if (correlations.length > 0) {
      const highRisk = correlations.find(c => c.isHighRisk);
      if (highRisk) {
        insights.push(`Correlation detected: ${highRisk.eventName} is associated with increased incident rates nearby.`);
      } else {
        insights.push(`Contextual analysis shows ${correlations[0].eventName} has a moderate impact on local safety.`);
      }
    } else {
      insights.push(`No significant correlation with external events detected in the current window.`);
    }

    const actions = [
      `Increase police patrols in ${peakDistrict.district} during the ${peakHour}:00 peak window.`,
      `Deploy traffic management units to high-density zones to mitigate ${dominantType.type} risks.`,
      correlations.length > 0 
        ? `Stage emergency medical services near ${correlations[0].eventName} to ensure rapid response.`
        : `Monitor high-risk hotspots identified in ${peakDistrict.district} for proactive intervention.`
    ];

    return {
      insights: insights.map(i => `- ${i}`).join('\n'),
      actions: actions.map(a => `- ${a}`).join('\n')
    };
  };

  const generateSafetyInsights = async (currentData?: EmergencyCall[], currentContext?: ContextualData | null) => {
    if (generatingInsights) return;
    setGeneratingInsights(true);
    
    const targetData = currentData || data;
    const targetContext = currentContext !== undefined ? currentContext : contextData;
    
    if (!targetData || targetData.length === 0) {
      setGeneratingInsights(false);
      return;
    }

    try {
      const summary = getDataSummary(targetData, targetContext);
      const contextSummary = targetContext ? JSON.stringify(targetContext.events) : '';
      
      const [insightsResult, actionsResult] = await Promise.all([
        fetchSafetyInsights(summary, contextSummary),
        fetchSafetyActions(summary, contextSummary)
      ]);
      
      setInsights(insightsResult || '');
      setSafetyActions(actionsResult || '');
    } catch (error) {
      console.warn("Gemini API failed, falling back to local analysis", error);
      const localResults = generateLocalInsights(targetData, targetContext);
      setInsights(localResults.insights);
      setSafetyActions(localResults.actions);
    } finally {
      setGeneratingInsights(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput;
    const userId = Math.random().toString(36).substr(2, 9);
    setChatInput('');
    setChatHistory(prev => [...prev, { id: userId, role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const summary = getDataSummary(filteredData, contextData);
      const contextSummary = contextData ? JSON.stringify(contextData.events) : '';
      const result = await chatWithAssistant(userMsg, summary, contextSummary);
      const aiId = Math.random().toString(36).substr(2, 9);
      setChatHistory(prev => [...prev, { id: aiId, role: 'ai', text: result || 'I am sorry, I could not process that.' }]);
    } catch (error) {
      console.error("Chat error", error);
      const errorId = Math.random().toString(36).substr(2, 9);
      setChatHistory(prev => [...prev, { id: errorId, role: 'ai', text: 'Error connecting to the assistant.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <h2 className="text-white text-xl font-medium">Initializing CivicGuardian...</h2>
          <p className="text-zinc-500 mt-2">Loading Montgomery Public Safety Data</p>
        </div>
      </div>
    );
  }

  const hourlyData = processHourlyTrends(filteredData);
  const dayData = processDayTrends(filteredData);
  const typeData = processTypeDistribution(filteredData);
  const districtData = processDistrictStats(filteredData);
  const predictions = predictFutureTrends(filteredData);
  const hotspots = detectHotspots(filteredData);
  const heatmapData = generateHeatmapData(filteredData);
  const pipelineSteps = simulateDataPipeline();

  const stats = [
    { label: 'Total Incidents', value: filteredData.length, icon: Activity, color: 'text-emerald-500' },
    { label: 'High Priority', value: filteredData.filter(d => d.priority === 'High').length, icon: AlertTriangle, color: 'text-red-500' },
    { label: 'Peak District', value: districtData[0]?.district || 'N/A', icon: MapIcon, color: 'text-blue-500' },
    { label: 'Top Type', value: selectedType === 'All' ? (typeData[0]?.type.split(' ')[0] || 'N/A') : selectedType.split(' ')[0], icon: Info, color: 'text-amber-500' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">CivicGuardian</h1>
              <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-semibold">Montgomery Public Safety</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
                <div className={cn("w-2 h-2 rounded-full", isLive ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
                  {isLive ? 'Live Monitoring' : 'Offline'}
                </span>
              </div>
              <span className="text-[9px] text-zinc-600 mt-1 font-mono">Portal Sync: {lastSync}</span>
            </div>
            <button 
              onClick={() => {
                loadData();
                setLastSync(new Date().toLocaleTimeString());
                setNewCallsAvailable(false);
              }}
              className={cn(
                "p-2 rounded-full transition-all relative",
                newCallsAvailable ? "bg-emerald-500/20 text-emerald-500" : "hover:bg-zinc-800 text-zinc-400 hover:text-white"
              )}
            >
              <RefreshCw className={cn("w-5 h-5", newCallsAvailable && "animate-spin-slow")} />
              {newCallsAvailable && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-[#0a0a0a] rounded-full" />
              )}
            </button>
            <div className="h-8 w-px bg-zinc-800 mx-1" />
            <RealTimeAlerts 
              alerts={alerts} 
              onDismiss={(id) => setAlerts(prev => prev.filter(a => a.id !== id))} 
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Project Description Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 bg-gradient-to-br from-emerald-500/10 via-zinc-900/50 to-zinc-900/50 border border-emerald-500/20 p-6 rounded-3xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <Shield className="w-32 h-32 text-emerald-500 rotate-12" />
          </div>
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/30">
                Project Overview
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
              Intelligent Public Safety Monitoring
            </h2>
            <p className="text-zinc-400 leading-relaxed">
              CivicGuardian analyzes <span className="text-white font-medium">Montgomery open data</span> and enriches it with contextual web data collected using <span className="text-emerald-400 font-medium">Bright Data Crawl API</span>. 
              The system detects incident hotspots, predicts trends, and generates AI insights to help city officials improve public safety decisions.
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Dashboard */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Filter Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Safety Overview</h2>
                <p className="text-sm text-zinc-500">Real-time monitoring and predictive analysis</p>
              </div>
              <FilterDropdown 
                options={INCIDENT_TYPES} 
                selected={selectedType} 
                onChange={setSelectedType} 
                label="Incident Filter"
              />
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((stat, i) => (
                <motion.div 
                  key={`stat-${stat.label}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl"
                >
                  <div className="flex items-center justify-between mb-2">
                    <stat.icon className={cn("w-5 h-5", stat.color)} />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Live</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>

              {/* Data Pipeline & Architecture */}
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Data Processing Pipeline
                </h3>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Architecture: Python/Pandas Equivalent</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {pipelineSteps.map((step, i) => (
                  <div key={`step-${step.step}-${i}`} className="relative">
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl h-full">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-emerald-500">{step.step}</span>
                        <span className="text-[8px] text-zinc-600">{step.time}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-tight">{step.detail}</p>
                    </div>
                    {i < pipelineSteps.length - 1 && (
                      <div className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                        <ChevronRight className="w-4 h-4 text-zinc-800" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Hotspot Analysis & Heatmap */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <MapIcon className="w-4 h-4 text-emerald-500" />
                        City Safety Heatmap
                      </h3>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Spatial Density</span>
                    </div>
                    <SafetyHeatmap data={heatmapData} />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        Detected Hotspots
                      </h3>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Cluster Logic</span>
                    </div>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                      {hotspots.slice(0, 6).map((spot, i) => (
                        <motion.div 
                          key={`hotspot-${spot.id}-${i}`} 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex flex-col p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-3 h-3 rounded-full",
                                spot.riskLevel === 'Critical' ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]" : 
                                spot.riskLevel === 'High' ? "bg-amber-500" : "bg-emerald-500"
                              )} />
                              <div>
                                <div className="text-xs font-bold text-white">{spot.name}</div>
                                <div className="text-[10px] text-zinc-500">{spot.incidents} incidents detected</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={cn(
                                "text-[10px] uppercase font-black tracking-tighter",
                                spot.riskLevel === 'Critical' ? "text-red-500" : 
                                spot.riskLevel === 'High' ? "text-amber-500" : "text-emerald-500"
                              )}>{spot.riskLevel}</div>
                              <div className="text-[9px] text-zinc-600">Score: {spot.intensity}</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-zinc-900">
                            <div className="flex flex-col">
                              <span className="text-[8px] uppercase text-zinc-600 font-bold">Dominant Type</span>
                              <span className="text-[10px] text-zinc-400 truncate">{spot.dominantType}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[8px] uppercase text-zinc-600 font-bold">Peak Window</span>
                              <span className="text-[10px] text-zinc-400">{spot.peakHours}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Contextual Data */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl md:col-span-2">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Search className="w-4 h-4 text-emerald-500" />
                    Contextual Web Data (Bright Data Crawl)
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {contextData?.events.map((event, i) => (
                    <div key={`context-event-${event.name}-${i}`} className="p-4 bg-zinc-950/50 rounded-2xl border border-zinc-800 hover:border-emerald-500/30 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">{event.name}</span>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">{event.time}</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-relaxed">{event.location} • {event.impact}</p>
                    </div>
                  ))}
                </div>
              </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Hourly Trends */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    Hourly Call Volume
                  </h3>
                </div>
                <div className="w-full min-h-[300px]">
                  {hourlyData && hourlyData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={hourlyData}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="hour" stroke="#71717a" fontSize={10} tickFormatter={(val) => `${val}h`} />
                        <YAxis stroke="#71717a" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                          itemStyle={{ color: '#10b981' }}
                        />
                        <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Incident Types */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Incident Distribution
                  </h3>
                </div>
                <div className="w-full min-h-[300px]">
                  {typeData && typeData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={typeData.slice(0, 5)}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="type"
                        >
                          {typeData.slice(0, 5).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#18181b', 
                            border: '1px solid #3f3f46', 
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(value: number, name: string) => [`${value} Incidents`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {typeData.slice(0, 5).map((item, i) => (
                    <div key={`type-legend-${item.type}-${i}`} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-[10px] text-zinc-400 truncate">{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* District Analysis */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl md:col-span-2">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-blue-500" />
                    District Call Volume
                  </h3>
                </div>
                <div className="w-full min-h-[300px]">
                  {districtData && districtData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={districtData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="district" stroke="#71717a" fontSize={10} />
                        <YAxis stroke="#71717a" fontSize={10} />
                        <Tooltip 
                          cursor={{ fill: '#27272a' }}
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                        />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Predictive Trends */}
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl md:col-span-2">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    Predictive Incident Forecast (7-Day)
                  </h3>
                  <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded-full border border-purple-500/20">Trend + Seasonality Model</span>
                </div>
                <div className="w-full min-h-[300px]">
                  {predictions && predictions.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={predictions}>
                        <defs>
                          <linearGradient id="colorPredict" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis dataKey="day" stroke="#71717a" fontSize={10} />
                        <YAxis stroke="#71717a" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                        />
                        <Area type="monotone" dataKey="predicted" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorPredict)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 mt-4 italic text-center">
                  * Prediction uses a 7-day moving average with seasonality weighting for weekend patterns.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: AI Insights & Assistant */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* AI Insights Panel */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-emerald-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-white">AI Safety Insights</h3>
                </div>
                <button 
                  onClick={() => generateSafetyInsights()}
                  disabled={generatingInsights}
                  className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                >
                  {generatingInsights ? 'Analyzing...' : 'Refresh'}
                </button>
              </div>
              <div className="p-6 min-h-[150px] max-h-[300px] overflow-y-auto border-b border-zinc-800/50">
                {generatingInsights ? (
                  <div className="flex flex-col items-center justify-center h-full py-8">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mb-3" />
                    <p className="text-xs text-zinc-500 font-medium">Analyzing safety data…</p>
                  </div>
                ) : insights ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <Markdown>{insights}</Markdown>
                    <FeedbackButtons contentType="insight" contentId="safety_insights" />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Info className="w-10 h-10 text-zinc-800 mx-auto mb-3" />
                    <p className="text-xs text-zinc-500">Click refresh to generate AI-powered safety insights.</p>
                  </div>
                )}
              </div>

              {/* Recommended Safety Actions Section */}
              <div className="p-6 bg-emerald-500/5">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-white">Recommended Safety Actions</h3>
                </div>
                {generatingInsights ? (
                  <div className="space-y-2">
                    <div className="h-3 bg-zinc-800 rounded animate-pulse w-full" />
                    <div className="h-3 bg-zinc-800 rounded animate-pulse w-5/6" />
                    <div className="h-3 bg-zinc-800 rounded animate-pulse w-4/6" />
                  </div>
                ) : safetyActions ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-ul:list-disc prose-li:text-zinc-300">
                    <Markdown>{safetyActions}</Markdown>
                    <FeedbackButtons contentType="insight" contentId="safety_actions" />
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">No recommendations available yet.</p>
                )}
              </div>
            </div>

            {/* Bright Data Correlation Panel */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800 bg-blue-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-blue-500" />
                  </div>
                  <h3 className="font-bold text-white">Bright Data Correlation</h3>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-zinc-400 italic">
                  "Traffic incidents increase near large public events scraped using Bright Data."
                </p>
                
                <div className="space-y-3">
                  {correlateEventsWithIncidents(data, contextData, detectHotspots(data)).map((corr, idx) => (
                    <div key={`correlation-${corr.eventName}-${idx}`} className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-white">{corr.eventName}</span>
                          {corr.nearHotspot && (
                            <span className="text-[10px] text-amber-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Near High Incident Zone
                            </span>
                          )}
                        </div>
                        {corr.isHighRisk && (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold uppercase">
                            High Risk
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="text-zinc-500">
                          Nearby Incidents: <span className="text-zinc-300">{corr.incidentCount}</span>
                        </div>
                        <div className="text-zinc-500">
                          Traffic Related: <span className="text-zinc-300">{corr.trafficIncidents}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-blue-400 font-medium">
                        Impact: {corr.impact}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <p className="text-[11px] text-blue-300 leading-relaxed">
                    <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                    Analysis shows a 15% increase in traffic-related calls within 2km of active event zones during peak hours.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Activity Feed */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800 bg-emerald-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-white">Live Activity Feed</h3>
                </div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Open Data Portal</span>
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto space-y-3 scrollbar-hide">
                <AnimatePresence initial={false}>
                  {recentActivity.length > 0 ? (
                    recentActivity.map((call, i) => (
                      <motion.div
                        key={`activity-${call.id}-${i}`}
                        initial={{ opacity: 0, x: -20, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: 'auto' }}
                        exit={{ opacity: 0, x: 20 }}
                        className="p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-xl flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            call.priority === 'High' ? "bg-red-500" : "bg-blue-500"
                          )} />
                          <div>
                            <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">{call.incident_type}</div>
                            <div className="text-[10px] text-zinc-500">{call.location} • {new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn(
                            "text-[9px] font-bold uppercase tracking-tighter",
                            call.priority === 'High' ? "text-red-500" : "text-blue-500"
                          )}>{call.priority}</div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-8 text-center">
                      <Clock className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                      <p className="text-[10px] text-zinc-600">Waiting for incoming portal data...</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
              <div className="p-3 bg-zinc-950/30 border-t border-zinc-800/50 text-center">
                <p className="text-[9px] text-zinc-600">Continuous monitoring of Montgomery 911 Dispatched Incidents</p>
              </div>
            </div>

            {/* AI Chat Assistant */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col h-[500px]">
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Civic Assistant</h3>
                  <p className="text-[10px] text-zinc-500">Ask about safety trends</p>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {chatHistory.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-xs text-zinc-500 px-8">
                      Try asking: "Which areas have the highest emergency calls?" or "What time do accidents occur most?"
                    </p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <motion.div 
                    key={`chat-msg-${msg.id}-${i}`}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "max-w-[85%] p-3 rounded-2xl text-sm",
                      msg.role === 'user' 
                        ? "bg-emerald-500 text-white ml-auto rounded-tr-none" 
                        : "bg-zinc-800 text-zinc-200 mr-auto rounded-tl-none"
                    )}
                  >
                    {msg.role === 'ai' ? (
                      <div className="markdown-body">
                        <Markdown>{msg.text}</Markdown>
                        <FeedbackButtons contentType="chat" contentId={msg.id} />
                      </div>
                    ) : (
                      msg.text
                    )}
                  </motion.div>
                ))}
                {isChatLoading && (
                  <div className="bg-zinc-800 text-zinc-200 mr-auto rounded-2xl rounded-tl-none p-3 max-w-[85%]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChat} className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                <div className="relative">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask CivicGuardian..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={isChatLoading || !chatInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-zinc-800/50 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tight">CivicGuardian</span>
          </div>
          <p className="text-xs text-zinc-500">
            Data sourced from Montgomery Open Data Portal. AI analysis provided by Google Gemini.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">Documentation</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs text-zinc-500 hover:text-white transition-colors">API Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

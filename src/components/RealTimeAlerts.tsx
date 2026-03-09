import React, { useState, useEffect } from 'react';
import { Bell, X, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SafetyAlert } from '../types';

interface RealTimeAlertsProps {
  alerts: SafetyAlert[];
  onDismiss: (id: string) => void;
}

export const RealTimeAlerts: React.FC<RealTimeAlertsProps> = ({ alerts, onDismiss }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-500 bg-red-50 border-red-100';
      case 'medium': return 'text-orange-500 bg-orange-50 border-orange-100';
      default: return 'text-blue-500 bg-blue-50 border-blue-100';
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <ShieldAlert className="w-5 h-5" />;
      case 'medium': return <AlertTriangle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  return (
    <div className="relative">
      <button
        id="alert-bell-button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-black/5 transition-colors"
      >
        <Bell className="w-6 h-6 text-slate-600" />
        {alerts.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-pulse">
            {alerts.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden"
          >
            <div className="p-4 border-bottom border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-600" />
                Real-Time Alerts
              </h3>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {alerts.length} New
              </span>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500 text-sm">No active alerts at this time.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {alerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="p-4 hover:bg-slate-50 transition-colors relative group"
                    >
                      <div className="flex gap-3">
                        <div className={`mt-1 p-1.5 rounded-lg border ${getSeverityColor(alert.severity)}`}>
                          {getIcon(alert.severity)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                              {alert.type} • {alert.location}
                            </span>
                            <button
                              onClick={() => onDismiss(alert.id)}
                              className="text-slate-400 hover:text-slate-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-800 mb-1 leading-tight">
                            {alert.title}
                          </h4>
                          <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                            {alert.description}
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
            
            {alerts.length > 0 && (
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <button 
                  onClick={() => alerts.forEach(a => onDismiss(a.id))}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Dismiss All
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

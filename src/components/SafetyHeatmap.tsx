import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface HeatmapProps {
  data: number[][];
}

export const SafetyHeatmap: React.FC<HeatmapProps> = ({ data }) => {
  const maxVal = Math.max(...data.flat());

  return (
    <div className="relative w-full aspect-square bg-zinc-950 rounded-2xl border border-zinc-800 p-4 overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="w-full h-full" style={{ 
          backgroundImage: 'radial-gradient(circle at 2px 2px, #3f3f46 1px, transparent 0)',
          backgroundSize: '20px 20px' 
        }} />
      </div>
      
      <div className="grid grid-cols-10 grid-rows-10 gap-1 h-full w-full">
        {data.map((row, i) => 
          row.map((val, j) => {
            const intensity = maxVal === 0 ? 0 : val / maxVal;
            return (
              <motion.div
                key={`${i}-${j}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (i * 10 + j) * 0.002 }}
                className="rounded-sm relative group cursor-crosshair"
                style={{
                  backgroundColor: intensity > 0 
                    ? `rgba(${intensity > 0.7 ? '239, 68, 68' : intensity > 0.4 ? '245, 158, 11' : '16, 185, 129'}, ${0.1 + intensity * 0.8})`
                    : 'rgba(39, 39, 42, 0.1)',
                  border: intensity > 0.5 ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent'
                }}
              >
                <div className="absolute inset-0 border border-white/0 group-hover:border-white/40 rounded-sm transition-colors z-10" />
                
                {intensity > 0.8 && (
                  <div className="absolute inset-0 animate-pulse bg-red-500/20 rounded-sm" />
                )}
                
                <div className={cn(
                  "absolute left-1/2 -translate-x-1/2 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-[10px] text-white opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20 whitespace-nowrap shadow-xl shadow-black/50",
                  i < 2 ? "top-full mt-2" : "bottom-full mb-2"
                )}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-zinc-400 font-medium uppercase text-[7px] tracking-wider">Safety Score</span>
                    <span className="font-bold text-emerald-400">{val}</span>
                    <span className="text-[8px] text-zinc-500">({Math.round(intensity * 100)}% Density)</span>
                  </div>
                  {/* Tooltip Arrow */}
                  <div className={cn(
                    "absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-900 border-zinc-700 rotate-45",
                    i < 2 ? "-top-1 border-t border-l" : "-bottom-1 border-b border-r"
                  )} />
                </div>
              </motion.div>
            );
          })
        )}
      </div>
      
      <div className="absolute bottom-2 right-2 flex items-center gap-3 bg-zinc-900/80 backdrop-blur px-2 py-1 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[8px] text-zinc-400">Low</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[8px] text-zinc-400">Med</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[8px] text-zinc-400">High</span>
        </div>
      </div>
    </div>
  );
};

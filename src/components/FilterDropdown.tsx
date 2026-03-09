import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

interface FilterDropdownProps {
  options: string[];
  selected: string;
  onChange: (value: string) => void;
  label?: string;
}

export function FilterDropdown({ options, selected, onChange, label = "Filter by Incident" }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allOptions = ["All", ...options];

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex flex-col gap-1.5">
        {label && <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">{label}</span>}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-between w-full md:w-64 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-medium transition-all hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20",
            isOpen && "border-emerald-500/50 ring-2 ring-emerald-500/10"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Filter className="w-4 h-4 text-emerald-500" />
            <span className="text-zinc-200 truncate">{selected === 'All' ? 'All Incidents' : selected}</span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-[100] w-full md:w-64 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto p-1.5 scrollbar-hide">
              {allOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors",
                    selected === option 
                      ? "bg-emerald-500/10 text-emerald-500 font-semibold" 
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  <span className="truncate">{option === 'All' ? 'All Incidents' : option}</span>
                  {selected === option && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

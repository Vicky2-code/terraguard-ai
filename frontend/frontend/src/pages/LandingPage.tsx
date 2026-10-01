import React, { useState } from 'react';
import { Terra3DScene } from './three/Terrain';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ShieldAlert, Activity, Map as MapIcon } from 'lucide-react';
import { App } from './App'; // Note: We will restructure App to handle landing vs dashboard

export const LandingPage: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-forest-green">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <Terra3DScene />
      </div>

      {/* Overlay Content */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4 bg-gradient-to-b from-transparent via-forest-green/20 to-forest-green">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="max-w-4xl"
        >
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-4">
            TERRAGUARD <span className="text-moss-green">AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-sand-beige font-light mb-8 opacity-90">
            XGBoost-Powered Multi-Source Slope Monitoring & Early Warning System
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-12">
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-widest uppercase border border-white/20 text-white">Monitor</span>
            <span className="text-white/30">•</span>
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-widest uppercase border border-white/20 text-white">Predict</span>
            <span className="text-white/30">•</span>
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-widest uppercase border border-white/20 text-white">Protect</span>
          </div>
          <div className="flex items-center justify-center space-x-6">
            <button
              onClick={onLaunch}
              className="group relative px-8 py-4 bg-moss-green hover:bg-green-500 text-white font-bold rounded-full transition-all flex items-center space-x-2 overflow-hidden"
            >
              <span className="relative z-10">LAUNCH LIVE MONITOR</span>
              <ArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" size={20} />
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
            <button className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-full backdrop-blur-sm transition-all border border-white/20">
              EXPLORE PLATFORM
            </button>
          </div>
        </motion.div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-10 left-10 z-20 hidden md:block">
        <div className="flex space-x-6 text-sand-beige/60 text-sm">
          <div className="flex items-center space-x-2">
            <Activity size={16} />
            <span>Real-time XGBoost Analysis</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapIcon size={16} />
            <span>GIS Risk Intelligence</span>
          </div>
          <div className="flex items-center space-x-2">
            <ShieldAlert size={16} />
            <span>Early Warning System</span>
          </div>
        </div>
      </div>
    </div>
  );
};

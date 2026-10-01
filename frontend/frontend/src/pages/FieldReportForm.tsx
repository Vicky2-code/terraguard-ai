import React, { useState } from 'react';
import axios from 'axios';

export const FieldReportForm: React.FC = () => {
  const [report, setReport] = useState({
    location_id: '',
    observation: '',
    severity: 'MODERATE',
    description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:8000/api/field-reports', report);
      alert('Report submitted successfully!');
      setReport({ location_id: '', observation: '', severity: 'MODERATE', description: '' });
    } catch (err) {
      alert('Error submitting report');
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-white">Submit Field Report</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Location ID</label>
          <input
            className="w-full bg-white/5 border border-white/20 rounded-lg p-2 text-white"
            value={report.location_id}
            onChange={e => setReport({...report, location_id: e.target.value})}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Observation</label>
          <input
            className="w-full bg-white/5 border border-white/20 rounded-lg p-2 text-white"
            value={report.observation}
            onChange={e => setReport({...report, observation: e.target.value})}
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Severity</label>
          <select
            className="w-full bg-white/5 border border-white/20 rounded-lg p-2 text-white"
            value={report.severity}
            onChange={e => setReport({...report, severity: e.target.value})}
          >
            <option value="LOW">LOW</option>
            <option value="MODERATE">MODERATE</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Description</label>
          <textarea
            className="w-full bg-white/5 border border-white/20 rounded-lg p-2 text-white"
            value={report.description}
            onChange={e => setReport({...report, description: e.target.value})}
          />
        </div>
        <button className="w-full bg-moss-green hover:bg-green-600 text-white font-bold py-2 rounded-lg transition-colors">
          Submit Ground Truth Report
        </button>
      </form>
    </div>
  );
};

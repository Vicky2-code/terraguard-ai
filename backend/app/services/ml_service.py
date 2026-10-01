import joblib
import numpy as np
import os
from app.models.models import RiskLevel

MODEL_PATH = "backend/ml/model/xgboost_model.pkl"

class MLService:
    def __init__(self):
        self.model = None
        self._load_model()

    def _load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
            except Exception as e:
                print(f"Error loading model: {e}")
        else:
            print("Model file not found. Please run train.py first.")

    def predict_risk(self, data: dict):
        if self.model is None:
            # Fallback to a simple rule-based prediction if model isn't trained
            return self._fallback_prediction(data)

        # Prepare feature vector in the exact order as training
        features = np.array([[
            data.get('rainfall', 0),
            data.get('rainfall_accumulation', 0),
            data.get('soil_moisture', 0),
            data.get('temperature', 0),
            data.get('humidity', 0),
            data.get('slope', 0),
            data.get('elevation', 0),
            data.get('historical_frequency', 0),
            data.get('land_cover_risk', 0),
            data.get('slope_movement', 0),
        ]])

        probability = self.model.predict_proba(features)[0][1]
        risk_score = int(probability * 100)

        # Determine risk level
        if risk_score >= 76:
            level = RiskLevel.CRITICAL
        elif risk_score >= 51:
            level = RiskLevel.HIGH
        elif risk_score >= 26:
            level = RiskLevel.MODERATE
        else:
            level = RiskLevel.LOW

        # Identify top factors (simplified for prototype: based on high normalized values)
        factors = []
        if data.get('rainfall', 0) > 200: factors.append("Heavy Rainfall")
        if data.get('soil_moisture', 0) > 70: factors.append("High Soil Moisture")
        if data.get('slope', 0) > 30: factors.append("Steep Slope")
        if data.get('slope_movement', 0) > 10: factors.append("Significant Slope Movement")

        if not factors:
            factors.append("Stable Conditions")

        return {
            "probability": float(probability),
            "risk_score": risk_score,
            "risk_level": level,
            "top_factors": factors
        }

    def _fallback_prediction(self, data):
        # Simple heuristic for demo purposes when model is missing
        score = 20
        if data.get('rainfall', 0) > 200: score += 30
        if data.get('soil_moisture', 0) > 70: score += 20
        if data.get('slope', 0) > 35: score += 20

        score = min(100, score)

        if score >= 76: level = RiskLevel.CRITICAL
        elif score >= 51: level = RiskLevel.HIGH
        elif score >= 26: level = RiskLevel.MODERATE
        else: level = RiskLevel.LOW

        return {
            "probability": score / 100,
            "risk_score": score,
            "risk_level": level,
            "top_factors": ["Simulation Mode (No Model)"]
        }

# Singleton instance
ml_service = MLService()

import asyncio
import random
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.main import SessionLocal
from app.models.models import EnvironmentalReading, Location, Prediction, Alert, RiskLevel
from app.services.ml_service import ml_service
from app.api.simulation import SIMULATION_STATE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SimulationEngine")

class SimulationEngine:
    def __init__(self):
        self.is_active = False
        self.interval = 5  # Update every 5 seconds for demo responsiveness

    async def run(self):
        logger.info("Simulation Engine initialized and waiting for START signal...")
        while True:
            if SIMULATION_STATE["is_running"]:
                try:
                    await self._update_all_locations()
                except Exception as e:
                    logger.error(f"Simulation loop error: {e}")

            await asyncio.sleep(self.interval)

    async def _update_all_locations(self):
        db = SessionLocal()
        try:
            locations = db.query(Location).all()
            if not locations:
                # Seed demo locations if none exist
                self._seed_demo_locations(db)
                locations = db.query(Location).all()

            scenario = SIMULATION_STATE["current_scenario"]
            logger.info(f"Running simulation update. Scenario: {scenario} | Locations: {len(locations)}")

from app.websocket.manager import manager

# ... (existing imports)

            for loc in locations:
                # 1. Generate reading based on scenario
                reading_data = self._generate_reading_for_scenario(loc, scenario)

                # 2. Save reading to DB
                reading = EnvironmentalReading(
                    location_id=loc.id,
                    **reading_data,
                    timestamp=datetime.utcnow()
                )
                db.add(reading)

                # 3. Run AI Prediction
                prediction_res = ml_service.predict_risk(reading_data)

                # 4. Save Prediction to DB
                prediction = Prediction(
                    location_id=loc.id,
                    probability=prediction_res["probability"],
                    risk_score=prediction_res["risk_score"],
                    risk_level=prediction_res["risk_level"],
                    top_factors=",".join(prediction_res["top_factors"]),
                    timestamp=datetime.utcnow()
                )
                db.add(prediction)

                # 5. Broadcast update via WebSocket
                # We send a payload that the frontend can use to update markers and KPIs
                update_payload = {
                    "type": "RISK_UPDATE",
                    "location_id": loc.id,
                    "location_name": loc.name,
                    "risk_score": prediction_res["risk_score"],
                    "risk_level": prediction_res["risk_level"].value,
                    "readings": reading_data,
                    "timestamp": datetime.utcnow().isoformat()
                }
                # Note: simulation_engine is async, so we can await the broadcast
                await manager.broadcast(update_payload)

                # 6. Check for Alert trigger
                if prediction_res["risk_level"] == RiskLevel.CRITICAL:
                    # Create alert if no active critical alert exists for this location
                    existing_alert = db.query(Alert).filter(
                        Alert.location_id == loc.id,
                        Alert.status != "RESOLVED"
                    ).first()

                    if not existing_alert:
                        alert = Alert(
                            location_id=loc.id,
                            prediction_id=prediction.id,
                            risk_level=RiskLevel.CRITICAL,
                            trigger_reason=f"Critical risk detected: {','.join(prediction_res['top_factors'])}",
                            timestamp=datetime.utcnow()
                        )
                        db.add(alert)

            db.commit()
        finally:
            db.close()

    def _generate_reading_for_scenario(self, loc, scenario):
        # Base values influenced by location's terrain
        # We simulate a "drift" from these values

        if scenario == "NORMAL":
            return {
                "rainfall": random.uniform(0, 10),
                "rainfall_accumulation": random.uniform(0, 50),
                "soil_moisture": random.uniform(20, 40),
                "temperature": random.uniform(15, 25),
                "humidity": random.uniform(40, 60),
                "slope_movement": random.uniform(0, 0.5),
            }

        elif scenario == "HEAVY_RAINFALL":
            return {
                "rainfall": random.uniform(50, 150),
                "rainfall_accumulation": random.uniform(300, 600),
                "soil_moisture": random.uniform(60, 85),
                "temperature": random.uniform(10, 18),
                "humidity": random.uniform(80, 95),
                "slope_movement": random.uniform(0.5, 5.0),
            }

        elif scenario == "SOIL_SATURATION":
            return {
                "rainfall": random.uniform(10, 30),
                "rainfall_accumulation": random.uniform(600, 900),
                "soil_moisture": random.uniform(85, 98),
                "temperature": random.uniform(12, 20),
                "humidity": random.uniform(70, 90),
                "slope_movement": random.uniform(1.0, 10.0),
            }

        elif scenario == "CRITICAL":
            return {
                "rainfall": random.uniform(100, 300),
                "rainfall_accumulation": random.uniform(700, 1000),
                "soil_moisture": random.uniform(90, 100),
                "temperature": random.uniform(8, 15),
                "humidity": random.uniform(90, 100),
                "slope_movement": random.uniform(10.0, 50.0),
            }

        return self._generate_reading_for_scenario(loc, "NORMAL")

    def _seed_demo_locations(self, db: Session):
        logger.info("Seeding demo locations...")
        demo_locs = [
            Location(name="Gangtok North", state="Sikkim", district="East", latitude=27.33, longitude=88.61, elevation=1800, slope=35, historical_frequency=0.4),
            Location(name="Lachung Valley", state="Sikkim", district="North", latitude=27.65, longitude=88.52, elevation=2700, slope=42, historical_frequency=0.6),
            Location(name="Tawang Slope", state="Arunachal", district="Tawang", latitude=27.58, longitude=91.86, elevation=3000, slope=38, historical_frequency=0.5),
            Location(name="Kohima Ridge", state="Nagaland", district="Kohima", latitude=25.67, longitude=94.10, elevation=1200, slope=30, historical_frequency=0.3),
        ]
        db.add_all(demo_locs)
        db.commit()
        logger.info("Demo locations seeded successfully.")

# Singleton instance
simulation_engine = SimulationEngine()

import pandas as pd
import numpy as np
import os
from datetime import datetime

def generate_landslide_dataset(num_samples=5000, output_path="backend/ml/dataset/landslide_demo.csv"):
    np.random.seed(42)

    # Feature ranges
    # rainfall: 0-500mm
    # rainfall_accumulation: 0-1000mm
    # soil_moisture: 0-100%
    # temperature: 5-40C
    # humidity: 30-100%
    # slope: 0-60 degrees
    # elevation: 100-5000m
    # historical_freq: 0.0-1.0
    # land_cover_risk: 0.0-1.0 (1.0 is most risky, e.g., deforested)
    # slope_movement: 0-50mm

    data = {
        "rainfall": np.random.uniform(0, 500, num_samples),
        "rainfall_accumulation": np.random.uniform(0, 1000, num_samples),
        "soil_moisture": np.random.uniform(20, 100, num_samples),
        "temperature": np.random.uniform(5, 40, num_samples),
        "humidity": np.random.uniform(30, 100, num_samples),
        "slope": np.random.uniform(0, 60, num_samples),
        "elevation": np.random.uniform(100, 5000, num_samples),
        "historical_frequency": np.random.uniform(0, 1, num_samples),
        "land_cover_risk": np.random.uniform(0, 1, num_samples),
        "slope_movement": np.random.uniform(0, 50, num_samples),
    }

    df = pd.DataFrame(data)

    # Define a risk function based on physical logic
    # Risk increases with: rainfall, accumulation, moisture, slope, slope_movement, historical_freq, land_cover_risk
    # Risk decreases with: (temperature/humidity are less direct, but very high humidity usually correlates with rain)

    def calculate_risk(row):
        score = (
            (row['rainfall'] / 500) * 0.2 +
            (row['rainfall_accumulation'] / 1000) * 0.2 +
            (row['soil_moisture'] / 100) * 0.15 +
            (row['slope'] / 60) * 0.2 +
            (row['slope_movement'] / 50) * 0.15 +
            row['historical_frequency'] * 0.05 +
            row['land_cover_risk'] * 0.05
        )
        # Add some noise
        score += np.random.normal(0, 0.05)
        return 1 if score > 0.6 else 0

    df['landslide'] = df.apply(calculate_risk, axis=1)

    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Dataset generated at {output_path}")

if __name__ == "__main__":
    generate_landslide_dataset()

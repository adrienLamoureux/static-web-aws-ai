import pandas as pd
import os

# Load EV dataset
csv_path = os.path.join(os.path.dirname(__file__), '../data/ev_data.csv')
df = pd.read_csv(csv_path)

# Clean up column names
df.columns = df.columns.str.strip()

# Basic summary
print("=== Head ===")
print(df.head(), "\n")

print("=== Vehicle Counts by Make ===")
print(df['Make'].value_counts(), "\n")

print("=== Average Electric Range by Make ===")
print(df.groupby('Make')['Electric Range'].mean().sort_values(ascending=False), "\n")

print("=== Unique Electric Vehicle Types ===")
print(df['Electric Vehicle Type'].unique(), "\n")
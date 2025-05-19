import pandas as pd
import os
import matplotlib.pyplot as plt
import seaborn as sns
import networkx as nx
import matplotlib.patches as mpatches

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

print("=== Missing Values per Column ===")
print(df.isnull().sum(), "\n")

# # Distribution of Electric Range
# plt.figure(figsize=(8, 4))
# sns.histplot(df['Electric Range'].dropna(), bins=20, kde=True)
# plt.title("Distribution of Electric Range")
# plt.xlabel("Electric Range")
# plt.ylabel("Frequency")
# plt.tight_layout()
# plt.show()

# # Boxplot of Base MSRP
# plt.figure(figsize=(8, 4))
# sns.boxplot(x=df['Base MSRP'].dropna())
# plt.title("Boxplot of Base MSRP")
# plt.tight_layout()
# plt.show()


# print("=== Correlation Matrix ===")
# print(df.corr(numeric_only=True), "\n")

# # Heatmap
# plt.figure(figsize=(10, 6))
# sns.heatmap(df.corr(numeric_only=True), annot=True, cmap="coolwarm", fmt=".2f")
# plt.title("Correlation Heatmap")
# plt.tight_layout()
# plt.show()

print("=== 4. Feature Engineering ===")

# 1. Create a new column for Electric Range Category
bins = [0, 50, 150, float('inf')]
labels = ['Short Range', 'Medium Range', 'Long Range']
df['Range Category'] = pd.cut(df['Electric Range'], bins=bins, labels=labels)
print("Added 'Range Category' column.\n")

# 2. Normalize Base MSRP (z-score)
df['MSRP Z-Score'] = (df['Base MSRP'] - df['Base MSRP'].mean()) / df['Base MSRP'].std()
print("Added 'MSRP Z-Score' column.\n")

# 3. Extract Latitude and Longitude from 'Vehicle Location'
def extract_lat_lon(wkt):
    try:
        wkt = wkt.strip().replace("POINT (", "").replace(")", "")
        lon, lat = map(float, wkt.split())
        return pd.Series({'Latitude': lat, 'Longitude': lon})
    except:
        return pd.Series({'Latitude': None, 'Longitude': None})

coords = df['Vehicle Location'].apply(extract_lat_lon)
df = pd.concat([df, coords], axis=1)
print("Extracted 'Latitude' and 'Longitude' from 'Vehicle Location'.\n")

# --- Visualizing Engineered Features ---

# Boxplot: Base MSRP by Range Category
# plt.figure(figsize=(8, 4))
# sns.boxplot(data=df, x='Range Category', y='Base MSRP')
# plt.title('Base MSRP by Range Category')
# plt.xlabel('Electric Range Category')
# plt.ylabel('Base MSRP')
# plt.tight_layout()
# plt.show()

# Histogram: Electric Range with Range Categories
# plt.figure(figsize=(8, 4))
# sns.histplot(data=df, x='Electric Range', hue='Range Category', bins=20, kde=True)
# plt.title('Electric Range Distribution by Category')
# plt.xlabel('Electric Range')
# plt.ylabel('Count')
# plt.tight_layout()
# plt.show()

# Boxplot: MSRP Z-Score by Range Category
# plt.figure(figsize=(8, 4))
# sns.boxplot(data=df, x='Range Category', y='MSRP Z-Score')
# plt.title('MSRP Z-Score by Range Category')
# plt.xlabel('Electric Range Category')
# plt.ylabel('MSRP Z-Score')
# plt.tight_layout()
# plt.show()

# === Correlation Matrix (with Engineered Features) ===
features_for_corr = df.select_dtypes(include=['number']).columns.tolist()

print("=== Correlation Matrix (with Engineered Features) ===")
print(df[features_for_corr].corr(), "\n")

# Updated Heatmap including engineered features
# plt.figure(figsize=(10, 6))
# sns.heatmap(df[features_for_corr].corr(), annot=True, cmap="coolwarm", fmt=".2f")
# plt.title("Correlation Heatmap with Engineered Features")
# plt.tight_layout()
# plt.show()

# Compute correlation matrix
corr_matrix = df[features_for_corr].corr()

# Threshold to draw edges (e.g., |correlation| > 0.5)
threshold = 0.5

# Create graph from filtered correlations
G = nx.Graph()

# Add nodes
for col in corr_matrix.columns:
    G.add_node(col)

# Add edges with correlation weights
for i in range(len(corr_matrix.columns)):
    for j in range(i):
        corr_value = corr_matrix.iloc[i, j]
        if abs(corr_value) >= threshold:
            G.add_edge(
                corr_matrix.columns[i],
                corr_matrix.columns[j],
                weight=corr_value
            )

# Draw the graph
plt.figure(figsize=(10, 8))
pos = nx.spring_layout(G, seed=42)  # force-directed layout

# Draw nodes and edges
nx.draw_networkx_nodes(G, pos, node_color='lightblue', node_size=1500)
# Color edges based on sign
edge_colors = ['red' if G[u][v]['weight'] < 0 else 'green' for u, v in G.edges()]
edge_weights = [abs(G[u][v]['weight']) * 3 for u, v in G.edges()]  # emphasize strength
edges = nx.draw_networkx_edges(
    G, pos,
    edge_color=edge_colors,
    width=edge_weights
)
nx.draw_networkx_labels(G, pos, font_size=10, font_weight='bold')
red_patch = mpatches.Patch(color='red', label='Negative Correlation')
green_patch = mpatches.Patch(color='green', label='Positive Correlation')
plt.legend(handles=[red_patch, green_patch], loc='upper right')

plt.title("Correlation Network Graph (|r| > 0.5)")
plt.axis('off')
plt.tight_layout()
plt.show()

# Filter for Battery Electric Vehicles (BEV)
bev_df = df[df['Electric Vehicle Type'].str.contains('Battery Electric', na=False)]

print(f"Filtered BEV dataset contains {len(bev_df)} records.\n")

# Select numeric features from BEV-only data
bev_features = bev_df.select_dtypes(include=['number']).columns.tolist()

# Compute correlation matrix
bev_corr = bev_df[bev_features].corr()

# Display correlation matrix
print("=== BEV-Only Correlation Matrix ===")
print(bev_corr, "\n")

# Plot heatmap
plt.figure(figsize=(10, 6))
sns.heatmap(bev_corr, annot=True, cmap="coolwarm", fmt=".2f")
plt.title("Correlation Heatmap (Battery Electric Vehicles Only)")
plt.tight_layout()
plt.show()

phev_df = df[df['Electric Vehicle Type'].str.contains('Plug-in Hybrid', na=False)]
phev_features = phev_df.select_dtypes(include=['number']).columns.tolist()
phev_corr = phev_df[phev_features].corr()

plt.figure(figsize=(10, 6))
sns.heatmap(phev_corr, annot=True, cmap="coolwarm", fmt=".2f")
plt.title("Correlation Heatmap (PHEVs Only)")
plt.tight_layout()
plt.show()
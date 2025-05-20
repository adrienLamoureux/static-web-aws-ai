import pandas as pd
import os
import matplotlib.pyplot as plt
import seaborn as sns
import networkx as nx
import matplotlib.patches as mpatches
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import DBSCAN

# Load EV dataset
csv_path = os.path.join(os.path.dirname(__file__), '../data/ev_data.csv')
df = pd.read_csv(csv_path)

# Clean up column names
df.columns = df.columns.str.strip()

df = df[df['Base MSRP'] > 1000]

cluster_labels = {
    0: 'Early BEV (Tesla S)',
    1: 'Modern PHEVs',
    2: 'Premium BEVs',
    3: 'High MSRP Anomaly 1',
    4: 'High MSRP Anomaly 2',
    -1: 'Noise'
}

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

# Select features for clustering
features = ['Electric Range', 'Base MSRP', 'Model Year']
ev_cluster_df = df[features].dropna()
if len(ev_cluster_df) > 50000:
    ev_cluster_df = ev_cluster_df.sample(n=50000, random_state=42)

# Scale the features
scaler = StandardScaler()
scaled_features = scaler.fit_transform(ev_cluster_df)

print("Feature matrix shape:", scaled_features.shape)

# === DBSCAN Clustering ===
dbscan = DBSCAN(eps=1.5, min_samples=5)
df_clustered = ev_cluster_df.copy()
df_clustered['Cluster'] = dbscan.fit_predict(scaled_features)
df_clustered_tmp = df_clustered.copy()
df_clustered_tmp['Cluster'] = dbscan.fit_predict(scaled_features)
df_clustered_tmp['Cluster Label'] = df_clustered_tmp['Cluster'].map(cluster_labels)

plt.figure(figsize=(8, 5))
sns.scatterplot(
    data=df_clustered_tmp,
    x='Electric Range',
    y='Base MSRP',
    hue='Cluster',
    palette='tab10'
)
plt.title('DBSCAN Clustering of EVs')
plt.xlabel('Electric Range')
plt.ylabel('Base MSRP')
plt.tight_layout()
plt.show()

# Add DBSCAN cluster labels to full DataFrame
df_clusters = df.copy()
df_clusters['Cluster'] = -1  # default
df_clusters.loc[df_clustered.index, 'Cluster'] = df_clustered['Cluster']

df_clusters['Cluster Label'] = df_clusters['Cluster'].map(cluster_labels)

print("=== DBSCAN Cluster Summary ===")
print(df_clusters.groupby('Cluster')[['Electric Range', 'Base MSRP', 'Model Year']].mean(), "\n")

print("=== DBSCAN Cluster Sizes ===")
print(df_clusters['Cluster'].value_counts(), "\n")

sns.pairplot(df_clusters.dropna(subset=['Cluster Label']), 
             vars=['Electric Range', 'Base MSRP', 'Model Year'], 
             hue='Cluster Label', palette='Set2')
plt.suptitle('Pairwise Feature Distribution by Cluster', y=1.02)
plt.show()

print("=== Vehicle Type Breakdown by Cluster ===")
print(df_clusters.groupby('Cluster')['Electric Vehicle Type'].value_counts())

sns.countplot(data=df_clusters, x='Cluster', hue='Electric Vehicle Type')
plt.title("Vehicle Type by Cluster")
plt.tight_layout()
plt.show()

print(df_clusters[df_clusters['Cluster'] == 0][['Make', 'Model', 'Electric Vehicle Type']].value_counts().head(10))

sns.scatterplot(data=df_clusters.loc[df_clustered.index], 
                x='Model Year', y='Base MSRP', hue='Cluster Label', palette='tab10')
plt.title("Model Year vs MSRP by DBSCAN Cluster")
plt.tight_layout()
plt.show()
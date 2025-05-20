import pandas as pd
import os
import matplotlib.pyplot as plt
import seaborn as sns
import networkx as nx
import matplotlib.patches as mpatches
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# Load EV dataset
csv_path = os.path.join(os.path.dirname(__file__), '../data/ev_data.csv')
df = pd.read_csv(csv_path)

# Clean up column names
df.columns = df.columns.str.strip()

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

# Scale the features
scaler = StandardScaler()
scaled_features = scaler.fit_transform(ev_cluster_df)

print("Feature matrix shape:", scaled_features.shape)

# Choose number of clusters (try 3 to start)
kmeans = KMeans(n_clusters=3, random_state=42)
ev_cluster_df['Cluster'] = kmeans.fit_predict(scaled_features)

plt.figure(figsize=(8, 5))
sns.scatterplot(
    data=ev_cluster_df,
    x='Electric Range',
    y='Base MSRP',
    hue='Cluster',
    palette='Set2'
)
plt.title('K-Means Clustering of EVs')
plt.xlabel('Electric Range')
plt.ylabel('Base MSRP')
plt.tight_layout()
plt.show()

# Elbow method to find best k
# inertia = []
# K = range(1, 10)
# for k in K:
#     km = KMeans(n_clusters=k, random_state=42)
#     km.fit(scaled_features)
#     inertia.append(km.inertia_)

# plt.figure(figsize=(6, 4))
# plt.plot(K, inertia, 'o-')
# plt.xlabel('Number of Clusters')
# plt.ylabel('Inertia')
# plt.title('Elbow Method For Optimal K')
# plt.tight_layout()
# plt.show()

# Merge cluster labels back to df
df_clusters = df.copy()
df_clusters['Cluster'] = -1  # default for rows not in training set
df_clusters.loc[ev_cluster_df.index, 'Cluster'] = ev_cluster_df['Cluster']

print("=== Cluster Summary ===")
cluster_profile = df_clusters.groupby('Cluster')[['Electric Range', 'Base MSRP', 'Model Year']].mean()
print(cluster_profile, "\n")

print("=== Cluster Sizes ===")
print(df_clusters['Cluster'].value_counts(), "\n")

sns.pairplot(df_clusters.dropna(subset=['Cluster']), 
             vars=['Electric Range', 'Base MSRP', 'Model Year'], 
             hue='Cluster', palette='Set2')
plt.suptitle('Pairwise Feature Distribution by Cluster', y=1.02)
plt.show()

print("=== Vehicle Type Breakdown by Cluster ===")
print(df_clusters.groupby('Cluster')['Electric Vehicle Type'].value_counts())

sns.countplot(data=df_clusters, x='Cluster', hue='Electric Vehicle Type')
plt.title("Vehicle Type by Cluster")
plt.tight_layout()
plt.show()
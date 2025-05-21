
import pandas as pd
import os
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
from scipy.cluster.hierarchy import linkage, dendrogram, fcluster

def load_and_prepare_data():
    csv_path = os.path.join(os.path.dirname(__file__), '../data/ev_data.csv')
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    df = df[df['Base MSRP'] > 1000]
    return df

def feature_engineering(df):
    bins = [0, 50, 150, float('inf')]
    labels = ['Short Range', 'Medium Range', 'Long Range']
    df['Range Category'] = pd.cut(df['Electric Range'], bins=bins, labels=labels)

    df['MSRP Z-Score'] = (df['Base MSRP'] - df['Base MSRP'].mean()) / df['Base MSRP'].std()

    def extract_lat_lon(wkt):
        try:
            wkt = wkt.strip().replace("POINT (", "").replace(")", "")
            lon, lat = map(float, wkt.split())
            return pd.Series({'Latitude': lat, 'Longitude': lon})
        except:
            return pd.Series({'Latitude': None, 'Longitude': None})

    coords = df['Vehicle Location'].apply(extract_lat_lon)
    df = pd.concat([df, coords], axis=1)
    return df

def run_dbscan(df, features, eps=1.5, min_samples=5, max_samples=50000):
    ev_cluster_df = df[features].dropna()
    if len(ev_cluster_df) > max_samples:
        ev_cluster_df = ev_cluster_df.sample(n=max_samples, random_state=42)

    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(ev_cluster_df)

    dbscan = DBSCAN(eps=eps, min_samples=min_samples)
    ev_cluster_df['Cluster'] = dbscan.fit_predict(scaled_features)
    return df, ev_cluster_df

def run_kmeans(df, features, n_clusters=5, max_samples=50000):
    ev_cluster_df = df[features].dropna()
    if len(ev_cluster_df) > max_samples:
        ev_cluster_df = ev_cluster_df.sample(n=max_samples, random_state=42)

    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(ev_cluster_df)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    ev_cluster_df['Cluster'] = kmeans.fit_predict(scaled_features)
    return df, ev_cluster_df

def run_hierarchical(df, features, n_clusters=5, max_samples=50000):
    ev_cluster_df = df[features].dropna()
    if len(ev_cluster_df) > max_samples:
        ev_cluster_df = ev_cluster_df.sample(n=max_samples, random_state=42)

    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(ev_cluster_df)

    hc = AgglomerativeClustering(n_clusters=n_clusters)
    ev_cluster_df['Cluster'] = hc.fit_predict(scaled_features)
    return df, ev_cluster_df

def compute_hierarchical_clusters(df, features, distance_threshold=25, max_samples=500):
    df_sample = df[features].dropna()
    if len(df_sample) > max_samples:
        df_sample = df_sample.sample(n=max_samples, random_state=42)

    scaler = StandardScaler()
    scaled = scaler.fit_transform(df_sample)

    linked = linkage(scaled, method='ward')
    cluster_assignments = fcluster(linked, t=distance_threshold, criterion='distance')
    df_sample = df_sample.copy()
    df_sample['Cluster'] = cluster_assignments

    return df_sample, linked

def plot_dendrogram(linked, cutoff=None):
    plt.figure(figsize=(12, 6))
    dendrogram(linked,
               orientation='top',
               distance_sort='descending',
               show_leaf_counts=True)

    if cutoff:
        plt.axhline(y=cutoff, c='red', linestyle='--', label=f'Distance Cutoff = {cutoff}')
        plt.legend()

    plt.title("Hierarchical Clustering Dendrogram")
    plt.xlabel("Sample Index")
    plt.ylabel("Distance")
    plt.tight_layout()
    plt.show()

def label_and_merge_clusters(df, ev_cluster_df, cluster_labels):
    df_clusters = df.copy()
    df_clusters['Cluster'] = -1
    df_clusters.loc[ev_cluster_df.index, 'Cluster'] = ev_cluster_df['Cluster']
    df_clusters['Cluster Label'] = df_clusters['Cluster'].map(cluster_labels)
    return df_clusters

def plot_clusters(ev_cluster_df, cluster_labels):
    ev_cluster_df = ev_cluster_df.copy()
    ev_cluster_df['Cluster Label'] = ev_cluster_df['Cluster'].map(cluster_labels)

    plt.figure(figsize=(8, 5))
    sns.scatterplot(
        data=ev_cluster_df,
        x='Electric Range',
        y='Base MSRP',
        hue='Cluster Label',
        palette='tab10'
    )
    plt.title('Clustering of EVs')
    plt.xlabel('Electric Range')
    plt.ylabel('Base MSRP')
    plt.tight_layout()
    plt.show()

def analyze_clusters(df_clusters):
    print("=== Cluster Summary ===")
    print(df_clusters.groupby('Cluster')[['Electric Range', 'Base MSRP', 'Model Year']].mean(), "\n")

    print("=== Cluster Sizes ===")
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

    sns.scatterplot(data=df_clusters[df_clusters['Cluster'] != -1], 
                    x='Model Year', y='Base MSRP', hue='Cluster Label', palette='tab10')
    plt.title("Model Year vs MSRP by Cluster")
    plt.tight_layout()
    plt.show()

def cluster_dispatch(method, df, features, **kwargs):
    if method == 'dbscan':
        return run_dbscan(df, features, **kwargs)
    elif method == 'kmeans':
        return run_kmeans(df, features, **kwargs)
    elif method == 'hierarchical':
        return run_hierarchical(df, features, **kwargs)
    elif method == 'hierarchical_fcluster':
        return compute_hierarchical_clusters(df, features, **kwargs)
    else:
        raise ValueError(f"Unknown clustering method: {method}")

def generate_cluster_labels(df_clusters):
    grouped = df_clusters.groupby('Cluster')[['Electric Range', 'Base MSRP', 'Model Year']].mean()
    labels = {}
    for cluster, row in grouped.iterrows():
        label = f"Range≈{int(row['Electric Range'])} MSRP≈{int(row['Base MSRP']/1000)}k Year≈{int(row['Model Year'])}"
        labels[cluster] = label
    return labels

def main():
    df = load_and_prepare_data()
    df = feature_engineering(df)
    features = ['Electric Range', 'Base MSRP', 'Model Year']

    clustering_method = 'kmeans'  # Options: 'dbscan', 'kmeans', 'hierarchical', 'hierarchical_fcluster'

    cluster_kwargs = {}

    if clustering_method in ['kmeans', 'hierarchical']:
        cluster_kwargs['n_clusters'] = 5
    elif clustering_method == 'dbscan':
        cluster_kwargs = {'eps': 1.5, 'min_samples': 5}
    elif clustering_method == 'hierarchical_fcluster':
        cluster_kwargs = {'distance_threshold': 25}

    # Run the selected clustering method
    if clustering_method == 'hierarchical_fcluster':
        df_clustered, linkage_matrix = cluster_dispatch(clustering_method, df, features, **cluster_kwargs)
        plot_dendrogram(linkage_matrix, cutoff=25)
    else:
        df, df_clustered = cluster_dispatch(clustering_method, df, features, **cluster_kwargs)

    cluster_labels = generate_cluster_labels(df_clustered)

    df_clusters = label_and_merge_clusters(df, df_clustered, cluster_labels)
    plot_clusters(df_clustered, cluster_labels)
    analyze_clusters(df_clusters)

if __name__ == "__main__":
    main()

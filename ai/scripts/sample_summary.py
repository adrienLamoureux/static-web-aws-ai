import pandas as pd
import os
import seaborn as sns
import matplotlib.pyplot as plt

# Load the CSV file
csv_path = os.path.join(os.path.dirname(__file__), '../data/sample.csv')
df = pd.read_csv(csv_path)

# Summary
print("=== HEAD ===")
print(df.head(), "\n")

print("=== INFO ===")
print(df.info(), "\n")

print("=== DESCRIBE ===")
print(df.describe(include='all'), "\n")

print("=== DEPARTMENT COUNTS ===")
print(df['department'].value_counts())

df.groupby('department')['salary'].mean()
df.groupby('department').agg({'salary': ['mean', 'max', 'count']})

df[df['salary'] > 80000]
df[df['department'] == 'Engineering']

df.sort_values(by='salary', ascending=False)

sns.boxplot(data=df, x='department', y='salary')
plt.title("Salary by Department")
plt.show()
# Static web aws ai

## AI

cd ai

python3.12 -m venv env

source env/bin/activate

python3.12 -m pip install -r requirements.txt

python3.12 -m ipykernel install --user --name=ai-env --display-name "Python (AI)"

cd data

curl -L -o ev_data.csv "https://data.wa.gov/api/views/f6w7-q2d2/rows.csv?accessType=DOWNLOAD"
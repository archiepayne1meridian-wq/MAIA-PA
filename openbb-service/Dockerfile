FROM python:3.11-slim

WORKDIR /app

# Build tools for any native extensions in the dependency tree
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# openbb is large; no-cache keeps the layer lean
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8080
ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]

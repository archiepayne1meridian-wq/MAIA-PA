FROM python:3.11-slim

WORKDIR /app

# Build tools for any native extensions in the dependency tree
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Verify the installed version and confirm openbb-api CLI exists.
# If either check fails the build fails fast with a clear error — better than a runtime crash.
RUN python -c "import openbb; print('[build] openbb version:', openbb.__version__)" && \
    which openbb-api && echo "[build] openbb-api CLI found at: $(which openbb-api)"

COPY main.py .

EXPOSE 8080
ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]

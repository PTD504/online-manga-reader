# --- Stage 1: Builder ---
FROM python:3.13-slim AS builder

WORKDIR /app
COPY requirements.txt .

# Upgrade pip and build wheels for all dependencies to optimize installation
RUN pip install --upgrade pip && \
    pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# --- Stage 2: Runtime ---
FROM python:3.13-slim

WORKDIR /app

# Install necessary system libraries for OpenCV (cv2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy the built wheels from the builder stage and install them
COPY --from=builder /app/wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir /wheels/*

# Copy source code of the backend
COPY app/ ./app/
COPY models/ ./models/

# Expose port of FastAPI
EXPOSE 8080

# Start the server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
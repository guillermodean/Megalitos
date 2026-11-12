FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 && rm -rf /var/lib/apt/lists/*
# numpy pinned < 2.3: newer wheels require x86-64-v2, which the homelab VM CPU (Proxmox kvm64) lacks.
RUN pip install --no-cache-dir numpy==2.2.6 osmium==4.3.2 shapely==2.2.0 pyproj==3.8.0 pymysql==1.2.4
WORKDIR /app
COPY build_routes.py /app/build_routes.py
ENTRYPOINT ["python", "-I", "/app/build_routes.py"]

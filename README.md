<div align="center">

# 🏥 Dr. Eman Ameen Pharmacy Management & Predictive Inventory System

**An enterprise-grade pharmacy ERP powered by automated time-series forecasting, FEFO batch allocation, and intelligent replenishment workflows.**

[![Python Version](https://img.shields.io/badge/Python-3.11%2B-blue?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Machine Learning](https://img.shields.io/badge/ML-LightGBM%20%7C%20Prophet-FF6F00?style=for-the-badge&logo=scikitlearn&logoColor=white)](https://scikit-learn.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[Key Features](#-core-features) • [Architecture](#-system-architecture) • [Tech Stack](#-tech-stack) • [Quickstart](#-getting-started) • [API Documentation](#-api-reference)

</div>

---

## 📌 Project Overview & Problem Statement

Retail and clinical pharmacies operate under razor-thin margins, strict regulatory compliance, and volatile consumer demand patterns. **Dr. Eman Ameen Pharmacy** faced three critical operational bottlenecks prior to system deployment:

1. **High Waste from Expired Stock:** Outdated inventory tracking led to older stock sitting unnoticed on shelves while newer deliveries were dispensed first.
2. **Costly Out-of-Stock Incidents:** Frequent stockouts of chronic therapeutics and seasonal antibiotics caused lost sales and disrupted patient care plans.
3. **Manual, Error-Prone Reordering:** Purchasing decisions relied heavily on guesswork and manual cycle checks, tying up capital in slow-moving stock.

### 💡 The Solution
A full-stack, enterprise-grade management ecosystem featuring an asynchronous **FastAPI** backend, a **PostgreSQL** relational core normalized to 3NF, and an integrated **Machine Learning Demand Forecasting Engine**. The system continuously monitors consumption trends, automates **FEFO (First Expired, First Out)** lot assignments, calculates statistical **Safety Stock & Reorder Points (ROP)**, and dispatches automated Purchase Orders before shortages occur.

---

## 🌟 Core Features

### 🧠 1. Machine Learning & Predictive Inventory Intelligence
* **Hybrid Time-Series Forecasting:** Leverages LightGBM and additive decomposition (Prophet) to model seasonal fluctuations, drug category trends, and local holiday spikes.
* **Dynamic Safety Stock & ROP Calculator:** Computes automated reorder points based on variable lead times and target service levels ($Z = 1.96$ for 97.5% availability):
  $$\text{Safety Stock} = Z \times \sqrt{\bar{L} \cdot \sigma_D^2 + \bar{D}^2 \cdot \sigma_L^2}$$
* **Dead Stock & Understock Detection:** Automatically flags slow-moving SKUs to prevent capital stagnation.

### 📦 2. Real-Time Inventory & FEFO Batch Engine
* **FEFO Lot Allocation:** Point-of-Sale (POS) and dispensing queues automatically reserve units from lots nearest their expiration date.
* **Automated Expiry Sentinel:** Tiered warning stages:
  * 🟢 **Normal:** $> 6$ months shelf life
  * 🟡 **Approaching Expiry:** $3\text{--}6$ months (triggers return-to-vendor / promotional alerts)
  * 🔴 **Critical:** $< 3$ months (locks auto-dispense; requires pharmacist override)
* **Atomic Concurrency Control:** Row-level locks (`SELECT ... FOR UPDATE`) prevent race conditions during high-volume sales.

### 💳 3. POS, Dispensing & Procurement Workflow
* **Split-Batch Fulfillment:** Seamlessly fulfills single line-item requests across multiple distinct batches if a single lot cannot satisfy the quantity.
* **Purchase Order Lifecycle:** Complete state machine from `DRAFT` $\rightarrow$ `ORDERED` $\rightarrow$ `RECEIVED` $\rightarrow$ `RECONCILED`.
* **Vendor Performance Scoring:** Tracks supplier fulfillment accuracy, delivery lead-time drift, and unit-cost variations.

### 🔒 4. Enterprise Security & Audit Compliance
* **Role-Based Access Control (RBAC):** Strict permissions dividing `ADMIN`, `HEAD_PHARMACIST`, and `STAFF_CASHIER` privileges.
* **Immutable Audit Trail:** Append-only cryptographic audit logging capturing user ID, timestamp, IP address, and JSON diffs of before/after states for all stock mutations.
* **Secure Authentication:** Stateles JWT authentication with Argon2id password hashing.

---

## 🏗️ System Architecture

```text
+-----------------------------------------------------------------------------------+
|                                 CLIENT APPLICATIONS                               |
|        [ Cashier POS Terminal ]    [ Admin Dashboard ]    [ Mobile Scanner ]       |
+------------------------------------------+----------------------------------------+
                                           | HTTPS / JSON
                                           v
+-----------------------------------------------------------------------------------+
|                             REVERSE PROXY & GATEWAY                               |
|                     NGINX / Traefik (Rate Limiting, TLS 1.3)                      |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                              FASTAPI BACKEND RUNTIME                              |
|                                                                                   |
|  [ Auth & RBAC Middleware ]  -->  [ Audit Logger ]  -->  [ REST Controllers ]      |
|                                                                  |                |
|       +--------------------------+-------------------------------+                |
|       |                          |                               |                |
|       v                          v                               v                |
|  [ Inventory Service ]    [ Sales & POS Engine ]     [ Procurement Manager ]      |
|  - FEFO Allocation        - Split Fulfillment        - Auto PO Generation         |
|  - Batch Lifecycle        - ACID Transactions        - Vendor Ledgers             |
+-------+--------------------------+-------------------------------+----------------+
        |                          |                               ^
        v                          v                               |
+-------+--------------------------+--------+      +---------------+----------------+
|          DATABASE & STORAGE TIER          |      |    ASYNCHRONOUS ML WORKERS     |
|                                           |      |         (Celery / Redis)       |
|  +-------------------------------------+  |      |                                |
|  | PostgreSQL (3NF Normalized RDBMS)  |  | ===> | [ Feature Engineering Engine ] |
|  | - Medicines, Batches, Orders, Logs  |  | Daily| [ Time-Series Forecast (LGBM) ] |
|  +-------------------------------------+  | Pull | [ Safety Stock & ROP Solver ]  |
|                                           |      |               |                |
|  +-------------------------------------+  |      |               v                |
|  | Redis (Cache & Session Store)       |  | <=== | [ Recommended PO Generation ]  |
|  | - Fast SKU lookup, Task Broker      |  |      +--------------------------------+
|  +-------------------------------------+  |
+-------------------------------------------+
```

---

## 💻 Tech Stack & Tools

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Core** | **Python 3.11+, FastAPI** | High-performance asynchronous REST API framework |
| **Data Persistence** | **PostgreSQL 16** | Relational ACID database with 3NF normalization |
| **ORM & Migrations** | **SQLAlchemy 2.0, Alembic** | Type-safe database queries and declarative schema migrations |
| **In-Memory Cache** | **Redis 7** | Cache store for barcode queries and Celery message broker |
| **Machine Learning** | **LightGBM, Prophet, Scikit-learn** | Demand forecasting and seasonal sales trend modeling |
| **Data Processing** | **Pandas, NumPy** | Feature generation (lags, rolling averages, seasonality) |
| **Security & Auth** | **PyJWT, Passlib (Argon2id)** | Token-based authorization and cryptographic password hashing |
| **Containerization** | **Docker, Docker Compose** | Reproducible multi-service deployment |
| **Validation & Docs** | **Pydantic v2, Swagger / OpenAPI** | Data parsing, strict validation, and interactive documentation |

---

## 🚀 Getting Started

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24.0+)
* [Docker Compose](https://docs.docker.com/compose/) (v2.20+)
* *Optional (for local development without Docker):* Python 3.11+, PostgreSQL 16, Redis

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/dr-eman-ameen-pharmacy-system.git
cd dr-eman-ameen-pharmacy-system
```

### Step 2: Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```

Review and adjust `.env` parameters if needed:
```ini
# Application Configuration
APP_NAME="Dr. Eman Ameen Pharmacy ERP"
APP_ENV=development
DEBUG=True
SECRET_KEY=generate_a_secure_jwt_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Database Settings
POSTGRES_USER=pharmacy_admin
POSTGRES_PASSWORD=secure_password_123
POSTGRES_DB=pharmacy_intelligence_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql+asyncpg://pharmacy_admin:secure_password_123@postgres:5432/pharmacy_intelligence_db

# Redis & Broker Settings
REDIS_URL=redis://redis:6379/0

# ML Engine Settings
MODEL_ARTIFACT_DIR=/app/ml_engine/artifacts
FORECAST_HORIZON_DAYS=30
DEFAULT_SERVICE_LEVEL_Z=1.96
```

---

### Step 3: Run with Docker Compose
Build and launch all services (API, Database, Redis, and Background Workers):
```bash
docker compose up --build -d
```

Verify service health:
```bash
docker compose ps
```

---

### Step 4: Run Migrations & Seed Sample Data
Once containers are running, execute database migrations and seed initial drug/batch records:
```bash
# Run schema migrations via Alembic
docker compose exec api alembic upgrade head

# Seed initial categories, inventory, and role permissions
docker compose exec api python scripts/seed_initial_data.py
```

---

### Step 5: Access the Platform
* **Interactive API Documentation (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
* **Alternative Documentation (ReDoc):** [http://localhost:8000/redoc](http://localhost:8000/redoc)
* **Health Check Endpoint:** [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## 📡 API Reference

A sample of core endpoints exposed by the API:

### 1. Inventory & Batch Management (`/api/v1/inventory`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/inventory/medicines` | Query catalog with stock levels & batch summaries | Staff+ |
| `POST` | `/api/v1/inventory/batches` | Ingest new medication batch with expiration & cost | Pharmacist+ |
| `GET` | `/api/v1/inventory/expiries/critical` | Retrieve batches expiring within 90 days (FEFO) | Pharmacist+ |
| `PATCH`| `/api/v1/inventory/batches/{id}/lock`| Lock or quarantine a compromised batch | Pharmacist+ |

### 2. POS & Sales Operations (`/api/v1/sales`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/sales/checkout` | Process order using FEFO auto-allocation | Cashier+ |
| `GET` | `/api/v1/sales/transactions/{id}` | Retrieve complete order breakdown & batch records | Cashier+ |
| `POST` | `/api/v1/sales/returns` | Process medicine return with batch re-entry logic | Pharmacist+ |

### 3. Predictive Intelligence (`/api/v1/forecast`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/forecast/train` | Trigger model training run over sales history | Admin |
| `GET` | `/api/v1/forecast/{medicine_id}` | Retrieve 30-day projected demand & confidence intervals | Pharmacist+ |
| `GET` | `/api/v1/forecast/replenishment-orders` | Generate auto-computed purchase order recommendations | Pharmacist+ |

---

## 🧪 Engineering Excellence & Quality Standards

* **Comprehensive Test Suite:** Powered by `pytest` and `httpx` for asynchronous endpoint integration and unit tests:
  ```bash
  docker compose exec api pytest tests/ -v --cov=app --cov-report=term-missing
  ```
* **ACID Transactions & FEFO Enforcement:** Strict transaction scopes around checkout routines guarantee that inventory counts remain accurate even during heavy concurrent sales.
* **Strict Schema Normalization:** Decoupled master medication records from batch-specific pricing, dates, and stock quantities to maintain data integrity.
* **Defensive Error Handling:** Standardized error responses using RFC 7807 Problem Details for consistent client error handling.

---

## 👥 Contributors & Acknowledgements

* **Architecture & Engineering:** Principal Architect & Full-Stack Developer
* **Domain Partner:** Dr. Eman Ameen Pharmacy (Consultation, workflow validation, and deployment testing)

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

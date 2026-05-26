# Pulumi Kubernetes Guestbook with Prometheus & Grafana Monitoring

This project deploys the classic Kubernetes Guestbook application with full observability using Prometheus and Grafana, all managed by Pulumi (TypeScript).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                             │
│                                                                   │
│  ┌─────────────── guestbook namespace ───────────────────────┐   │
│  │                                                            │   │
│  │  ┌──────────┐   ┌──────────────┐   ┌────────────────┐    │   │
│  │  │ Frontend │   │ Redis Leader │   │ Redis Follower │    │   │
│  │  │ (x3)     │   │ + Exporter   │   │ (x2)+Exporter  │    │   │
│  │  └──────────┘   └──────────────┘   └────────────────┘    │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────── monitoring namespace ──────────────────────┐   │
│  │                                                            │   │
│  │  ┌────────────┐  ┌─────────┐  ┌──────────────────────┐   │   │
│  │  │ Prometheus │  │ Grafana │  │ kube-state-metrics   │   │   │
│  │  │            │  │ (LB)    │  │ node-exporter        │   │   │
│  │  └────────────┘  └─────────┘  └──────────────────────┘   │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- A running Kubernetes cluster (Minikube, kind, EKS, GKE, AKS, etc.)
- [Helm](https://helm.sh/docs/intro/install/) (Pulumi uses it under the hood for Helm charts)

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd pulumi-guestbook-monitoring
npm install
```

### 2. Configure Pulumi

```bash
# Login to Pulumi (use local backend for testing)
pulumi login --local

# Create a new stack
pulumi stack init dev
```

### 3. Set Configuration (Optional)

```bash
# Set Kubernetes context (if not using default)
pulumi config set kubernetes:context <your-context>

# Customize namespaces (optional, defaults shown)
pulumi config set guestbook:namespace guestbook
pulumi config set monitoring:namespace monitoring
```

### 4. Deploy

```bash
pulumi up
```

This will deploy:
- **Guestbook namespace**: Frontend (3 replicas), Redis Leader, Redis Followers (2 replicas)
- **Monitoring namespace**: Prometheus, Grafana, AlertManager, node-exporter, kube-state-metrics

### 5. Access the Application

After deployment, Pulumi will output access details. You can also use:

```bash
# Guestbook Frontend
kubectl get svc frontend -n guestbook

# If using Minikube
minikube service frontend -n guestbook
```

## Grafana Access

### Access URL

```bash
# Get Grafana external IP (LoadBalancer)
kubectl get svc kube-prometheus-stack-grafana -n monitoring

# Port-forward (for local clusters like Minikube/kind)
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring
# Then open: http://localhost:3000
```

### Default Admin Credentials

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

### Pre-configured Dashboard

A custom **"Guestbook Application Dashboard"** is automatically provisioned with:
- Pod CPU Usage (Guestbook namespace)
- Pod Memory Usage (Guestbook namespace)
- Network Receive/Transmit rates
- Redis Connected Clients
- Redis Commands Per Second
- Redis Memory Usage
- Frontend HTTP Request rates

Navigate to: **Dashboards → Guestbook → Guestbook Application Dashboard**

## Verifying Prometheus is Scraping Guestbook Metrics

### 1. Access Prometheus UI

```bash
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring
# Open: http://localhost:9090
```

### 2. Check Targets

Navigate to **Status → Targets** in the Prometheus UI. You should see:

- `kubernetes-pods` job with guestbook pods listed
- `kubernetes-service-endpoints` job with guestbook services
- Redis exporter targets showing as `UP`

### 3. Query Guestbook Metrics

In the Prometheus expression browser, try these queries:

```promql
# Redis metrics from the guestbook namespace
redis_up{namespace="guestbook"}

# Redis commands processed
rate(redis_commands_processed_total{namespace="guestbook"}[5m])

# Redis connected clients
redis_connected_clients{namespace="guestbook"}

# Redis memory usage
redis_memory_used_bytes{namespace="guestbook"}

# Container CPU usage for guestbook pods
sum(rate(container_cpu_usage_seconds_total{namespace="guestbook"}[5m])) by (pod)

# Container memory for guestbook pods
container_memory_working_set_bytes{namespace="guestbook"}

# Network traffic
rate(container_network_receive_bytes_total{namespace="guestbook"}[5m])
```

### 4. Verify via kubectl

```bash
# Check ServiceMonitors are created
kubectl get servicemonitors -n guestbook

# Check Prometheus is running
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus

# Check Redis exporters are running
kubectl get pods -n guestbook -o wide
```

## Monitoring Stack Components

| Component | Purpose |
|-----------|---------|
| **Prometheus** | Metrics collection and storage |
| **Grafana** | Visualization and dashboards |
| **AlertManager** | Alert routing and notification |
| **node-exporter** | Host-level metrics |
| **kube-state-metrics** | Kubernetes object state metrics |
| **Redis Exporter** | Redis-specific metrics (sidecar) |

## Metrics Collection Strategy

1. **Annotation-based scraping**: Pods with `prometheus.io/scrape: "true"` annotations are automatically discovered
2. **ServiceMonitor CRDs**: Prometheus Operator ServiceMonitors for structured metric collection
3. **Redis Exporter sidecars**: Dedicated exporters running alongside Redis pods expose Redis-specific metrics
4. **kube-state-metrics**: Provides Kubernetes object metrics (deployments, pods, services)
5. **node-exporter**: Provides node-level system metrics

## Cleanup

```bash
pulumi destroy
pulumi stack rm dev
```

## Troubleshooting

### Pods stuck in Pending
```bash
kubectl describe pod <pod-name> -n <namespace>
# Check for resource constraints or scheduling issues
```

### Grafana not accessible
```bash
# Check service status
kubectl get svc -n monitoring
# Check pod logs
kubectl logs -l app.kubernetes.io/name=grafana -n monitoring
```

### Prometheus not scraping targets
```bash
# Check Prometheus config
kubectl get configmap -n monitoring
# Check ServiceMonitor resources
kubectl get servicemonitors --all-namespaces
# View Prometheus logs
kubectl logs -l app.kubernetes.io/name=prometheus -n monitoring -c prometheus
```

### Helm release issues
```bash
# Check Helm release status
helm list -n monitoring
# Get release history
helm history kube-prometheus-stack -n monitoring
```

## Project Structure

```
.
├── index.ts              # Main Pulumi program
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
├── Pulumi.yaml           # Pulumi project definition
├── Pulumi.dev.yaml       # Dev stack configuration
└── README.md             # This file
```

## Technology Stack

- **IaC**: Pulumi (TypeScript)
- **Container Orchestration**: Kubernetes
- **Application**: Guestbook (PHP frontend + Redis backend)
- **Monitoring**: Prometheus + Grafana (via kube-prometheus-stack Helm chart)
- **Metrics Export**: Redis Exporter (oliver006/redis_exporter)

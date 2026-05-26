# Pulumi Kubernetes Guestbook with Prometheus & Grafana Monitoring

This project deploys the classic Kubernetes Guestbook application with full observability using Prometheus and Grafana, all managed by Pulumi (TypeScript).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster (EKS)                       │
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

---

## Before You Start (Prerequisites)

Make sure you have these installed on your machine:

| Tool | Check if installed | Install link |
|------|-------------------|--------------|
| AWS CLI | `aws --version` | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| kubectl | `kubectl version --client` | https://kubernetes.io/docs/tasks/tools/ |
| Pulumi CLI | `pulumi version` | https://www.pulumi.com/docs/get-started/install/ |
| Node.js | `node --version` | https://nodejs.org/ |
| Helm | `helm version` | https://helm.sh/docs/intro/install/ |

You also need a running Kubernetes cluster (EKS, Minikube, kind, GKE, AKS, etc.)

---

### Install Node.js and Pulumi on Amazon Linux (EC2)

If you are running commands from an EC2 instance or Amazon Linux machine, follow these steps:

**1. Install Node.js**

Check whether Node.js is already installed:
```bash
node --version
```

If not installed:

Amazon Linux 2023:
```bash
sudo dnf install nodejs -y
```

Amazon Linux 2:
```bash
sudo yum install nodejs -y
```

Verify:
```bash
node --version
npm --version
```

**2. Install Pulumi CLI**

Install Pulumi using the official installation script:
```bash
curl -fsSL https://get.pulumi.com | sh
```

Add Pulumi to your PATH (if needed):
```bash
export PATH=$PATH:$HOME/.pulumi/bin
```

To make it permanent:
```bash
echo 'export PATH=$PATH:$HOME/.pulumi/bin' >> ~/.bashrc
source ~/.bashrc
```

Verify installation:
```bash
pulumi version
```

**3. Verify All Tools**

```bash
node --version
npm --version
pulumi version
aws --version
kubectl version --client
helm version
```

All commands should return version numbers without errors.

---

## Instructions to Deploy the Application

### Step 1: Clone the Repository

```bash
git clone https://github.com/arumullayaswanth/sre-task.git
cd sre-task
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Connect to Your Kubernetes Cluster

For EKS:
```bash
aws eks update-kubeconfig --name <your-cluster-name> --region <your-region>
```

Verify connection:
```bash
kubectl get nodes
```

### Step 4: Configure Pulumi

```bash
# Login to Pulumi (local backend, no account needed)
pulumi login --local

# Create a new stack
pulumi stack init dev

# Set Kubernetes context
pulumi config set kubernetes:context $(kubectl config current-context)
```

### Step 5: Deploy

```bash
pulumi up
```

When prompted, type `yes` to confirm.

This deploys:
- **guestbook namespace**: Frontend (3 replicas), Redis Leader (1 replica), Redis Followers (2 replicas)
- **monitoring namespace**: Prometheus, Grafana, AlertManager, node-exporter, kube-state-metrics

### Step 6: Get Application URLs

```bash
# Guestbook Frontend URL
kubectl get svc frontend -n guestbook

# Grafana URL
kubectl get svc kube-prometheus-stack-grafana -n monitoring
```

Copy the `EXTERNAL-IP` from the output and open in your browser.

---

## Grafana Access URL and Admin Credentials

### Access URL

```bash
# Get Grafana LoadBalancer URL
kubectl get svc kube-prometheus-stack-grafana -n monitoring
```

The EXTERNAL-IP column shows the Grafana URL. Open: `http://<EXTERNAL-IP>`

If using port-forward (for local clusters):
```bash
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring
```
Then open: http://localhost:3000

### Admin Credentials

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

### Pre-configured Dashboard

A custom **"Guestbook Application Dashboard"** is automatically provisioned with panels for:
- Pod CPU Usage (Guestbook namespace)
- Pod Memory Usage (Guestbook namespace)
- Network Receive/Transmit rates
- Redis Connected Clients
- Redis Commands Per Second
- Redis Memory Usage
- Frontend HTTP Request rates

To find it: **Dashboards > Guestbook > Guestbook Application Dashboard**

---

## How to Verify That Guestbook Metrics Are Being Scraped by Prometheus

### Method 1: Check Prometheus Targets UI

```bash
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring
```

Open http://localhost:9090, then navigate to **Status > Targets**.

You should see:
- `kubernetes-pods` job with guestbook pods listed as **UP**
- `kubernetes-service-endpoints` job with guestbook services as **UP**
- `serviceMonitor/guestbook/redis-metrics` showing Redis exporters as **UP**

### Method 2: Run PromQL Queries

In the Prometheus expression browser (http://localhost:9090/graph), run these queries:

```promql
# Verify Redis exporters are up
redis_up{namespace="guestbook"}
```
Expected result: Value `1` for each Redis pod.

```promql
# Redis commands processed per second
rate(redis_commands_processed_total{namespace="guestbook"}[5m])
```
Expected result: A numeric value showing commands being processed.

```promql
# Redis connected clients
redis_connected_clients{namespace="guestbook"}
```
Expected result: At least 1 connected client per Redis instance.

```promql
# Container CPU usage for guestbook pods
sum(rate(container_cpu_usage_seconds_total{namespace="guestbook"}[5m])) by (pod)
```
Expected result: CPU usage values per pod.

```promql
# Container memory usage for guestbook pods
container_memory_working_set_bytes{namespace="guestbook"}
```
Expected result: Memory usage in bytes per container.

```promql
# Network traffic for guestbook pods
rate(container_network_receive_bytes_total{namespace="guestbook"}[5m])
```
Expected result: Network receive rate per pod.

### Method 3: Verify via kubectl

```bash
# Check ServiceMonitors are created
kubectl get servicemonitors -n guestbook
```

Expected output:
```
NAME               AGE
redis-metrics      5m
frontend-metrics   5m
```

```bash
# Check Prometheus is running
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus
```

```bash
# Check Redis exporters are running (2/2 means exporter sidecar is active)
kubectl get pods -n guestbook
```

```bash
# Check all guestbook services
kubectl get svc -n guestbook
```

---

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

1. **Annotation-based scraping**: Pods with `prometheus.io/scrape: "true"` annotations are automatically discovered by Prometheus
2. **ServiceMonitor CRDs**: Prometheus Operator ServiceMonitors for structured metric collection from Redis and Frontend services
3. **Redis Exporter sidecars**: Dedicated exporters running alongside Redis pods expose Redis-specific metrics (commands/sec, memory, connected clients)
4. **kube-state-metrics**: Provides Kubernetes object metrics (deployments, pods, services)
5. **node-exporter**: Provides node-level system metrics (CPU, memory, disk)

---

## Project Structure

```
.
├── index.ts              # Main Pulumi program (all infrastructure code)
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
├── Pulumi.yaml           # Pulumi project definition
├── Pulumi.dev.yaml       # Dev stack configuration
├── yash.md              # Detailed step-by-step testing guide
└── README.md             # This file
```

---

## Cleanup

```bash
pulumi destroy
pulumi stack rm dev
```

---

## Troubleshooting

### Pods stuck in "Pending"
```bash
kubectl describe pod <pod-name> -n <namespace>
```
Usually means not enough resources on nodes. Add more or bigger nodes.

### LoadBalancer shows `<pending>` forever
Use port-forward as alternative:
```bash
kubectl port-forward svc/frontend 8080:80 -n guestbook
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring
```

### Grafana shows "No data" in panels
- Wait 2-3 minutes for Prometheus to collect initial data
- Access the Guestbook app at least once to generate traffic
- Verify Prometheus targets are UP

### Helm release issues
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

---

## Technology Stack

- **IaC**: Pulumi (TypeScript)
- **Container Orchestration**: Kubernetes (EKS)
- **Application**: Guestbook (PHP frontend + Redis backend)
- **Monitoring**: Prometheus + Grafana (via kube-prometheus-stack Helm chart)
- **Metrics Export**: Redis Exporter (oliver006/redis_exporter)

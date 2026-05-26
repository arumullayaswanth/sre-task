# Yash's Complete Guide: Deploy & Test Guestbook + Monitoring on EKS

> This guide is written like you're explaining it to a kid. Follow each step one by one. Don't skip anything.

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

---

## Step 1: Connect to Your EKS Cluster

You already created your EKS cluster. Now tell your computer to talk to it.

```bash
# Replace <your-cluster-name> with your actual EKS cluster name
# Replace <your-region> with your AWS region (like us-east-1, ap-south-1, etc.)

aws eks update-kubeconfig --name <your-cluster-name> --region <your-region>
```

**Example:**
```bash
aws eks update-kubeconfig --name my-guestbook-cluster --region us-east-1
```

### Verify you're connected:
```bash
kubectl get nodes
```

**What you should see:** A list of your EKS worker nodes with status `Ready`. Something like:
```
NAME                                           STATUS   ROLES    AGE   VERSION
ip-192-168-1-100.ec2.internal                  Ready    <none>   5m    v1.28.x
ip-192-168-2-200.ec2.internal                  Ready    <none>   5m    v1.28.x
```

If you see nodes = you're connected!

---

## Step 2: Install Project Dependencies

Open your terminal, go to the project folder:

```bash
git clone https://github.com/arumullayaswanth/sre-task.git
```

Install the Node.js packages:

```bash
npm install
```

**What happens:** It downloads all the Pulumi libraries needed. Wait until it finishes.

---

## Step 3: Setup Pulumi

### 3a. Login to Pulumi (use local backend — no account needed)

```bash
pulumi login --local
```

### 3b. Create a stack called "dev"

```bash
pulumi stack init dev
```

> If it says "stack already exists", that's fine! Just select it:
> ```bash
> pulumi stack select dev
> ```

### 3c. Set your Kubernetes context (tell Pulumi which cluster to use)

```bash
# Find your current context name
kubectl config current-context
```

Copy that name, then:

```bash
pulumi config set kubernetes:context <paste-your-context-here>
```

**Example:**
```bash
pulumi config set kubernetes:context arn:aws:eks:us-east-1:123456789:cluster/my-guestbook-cluster
```

---

## Step 4: DEPLOY EVERYTHING

This is the big moment. One command deploys the entire application + monitoring:

```bash
pulumi up
```

**What happens next:**
1. Pulumi shows you a preview of everything it will create
2. It asks: `Do you want to perform this update?`
3. Type `yes` and press Enter

**Wait time:** This takes about 3-5 minutes. You'll see resources being created one by one.

**What gets created:**
- `guestbook` namespace with Frontend + Redis
- `monitoring` namespace with Prometheus + Grafana
- ServiceMonitors to connect them
- A pre-built Grafana dashboard

When it's done, you'll see output like:
```
Outputs:
    guestbookFrontendUrl  : "http://a1b2c3d4.us-east-1.elb.amazonaws.com"
    grafanaAdminPass      : "admin123"
    grafanaAdminUsername  : "admin"
    grafanaUrl            : "Access Grafana via: kubectl get svc..."
    ...

Resources:
    + 15 created
```

---

## Step 5: Verify Everything is Running

### 5a. Check all pods are running

```bash
# Check Guestbook pods
kubectl get pods -n guestbook
```

**Expected output (all should be Running):**
```
NAME                              READY   STATUS    RESTARTS   AGE
frontend-xxxxx-yyyyy              1/1     Running   0          2m
frontend-xxxxx-zzzzz              1/1     Running   0          2m
frontend-xxxxx-aaaaa              1/1     Running   0          2m
redis-leader-xxxxx-bbbbb          2/2     Running   0          2m
redis-follower-xxxxx-ccccc        2/2     Running   0          2m
redis-follower-xxxxx-ddddd        2/2     Running   0          2m
```

> Notice redis pods show `2/2` — that's the Redis container + the Redis Exporter sidecar!

```bash
# Check Monitoring pods
kubectl get pods -n monitoring
```

**Expected output:**
```
NAME                                                     READY   STATUS    RESTARTS   AGE
kube-prometheus-stack-grafana-xxxxx                       3/3     Running   0          3m
kube-prometheus-stack-prometheus-node-exporter-xxxxx      1/1     Running   0          3m
kube-prometheus-stack-kube-state-metrics-xxxxx            1/1     Running   0          3m
prometheus-kube-prometheus-stack-prometheus-0             2/2     Running   0          3m
alertmanager-kube-prometheus-stack-alertmanager-0         2/2     Running   0          3m
kube-prometheus-stack-operator-xxxxx                      1/1     Running   0          3m
```

### 5b. Check all services

```bash
kubectl get svc -n guestbook
kubectl get svc -n monitoring
```

---

## Step 6: Access the Guestbook Application

```bash
kubectl get svc frontend -n guestbook
```

**Look at the EXTERNAL-IP column.** Copy that URL.

```
NAME       TYPE           CLUSTER-IP      EXTERNAL-IP                              PORT(S)
frontend   LoadBalancer   10.100.x.x      a1b2c3d4e5.us-east-1.elb.amazonaws.com   80:31234/TCP
```

**Open your browser and go to:** `http://<EXTERNAL-IP>`

You should see the Guestbook app! Try typing a message and clicking Submit.

> Note: EKS LoadBalancers take 2-3 minutes to provision. If EXTERNAL-IP shows `<pending>`, wait and try again.

---

## Step 7: Access Grafana

### Option A: Get the LoadBalancer URL (recommended for EKS)

```bash
kubectl get svc kube-prometheus-stack-grafana -n monitoring
```

Copy the EXTERNAL-IP and open in browser: `http://<EXTERNAL-IP>`

### Option B: Port-forward (if LoadBalancer is slow)

```bash
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring
```

Then open: **http://localhost:3000**

### Login to Grafana:

```
Username: admin
Password: admin123
```

### Find the Guestbook Dashboard:

1. Click the hamburger menu on the left
2. Click **Dashboards**
3. Look for folder called **"Guestbook"**
4. Click **"Guestbook Application Dashboard"**

You'll see panels showing:
- Pod CPU Usage
- Pod Memory Usage
- Network traffic
- Redis commands per second
- Redis memory usage
- Frontend request rates

---

## Step 8: Access Prometheus & Verify Scraping

### 8a. Open Prometheus UI

```bash
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring
```

Open: **http://localhost:9090**

### 8b. Check Targets are being scraped

1. In Prometheus UI, click **Status** then **Targets**
2. Look for these jobs:
   - `kubernetes-pods` — should show guestbook pods as UP
   - `kubernetes-service-endpoints` — should show guestbook services
   - `serviceMonitor/guestbook/redis-metrics` — Redis exporters

### 8c. Run test queries

In the Prometheus query box at the top, paste these one by one:

**Query 1: Is Redis running?**
```
redis_up{namespace="guestbook"}
```
Expected: Shows value `1` for each Redis pod (means Redis exporter is working)

**Query 2: Redis commands per second**
```
rate(redis_commands_processed_total{namespace="guestbook"}[5m])
```
Expected: Shows a number (even if small) — means Redis is processing commands

**Query 3: Redis connected clients**
```
redis_connected_clients{namespace="guestbook"}
```
Expected: Shows at least 1 connected client (the frontend connects to Redis)

**Query 4: CPU usage of guestbook pods**
```
sum(rate(container_cpu_usage_seconds_total{namespace="guestbook"}[5m])) by (pod)
```
Expected: Shows CPU usage per pod

**Query 5: Memory usage**
```
container_memory_working_set_bytes{namespace="guestbook"}
```
Expected: Shows memory in bytes for each container

---

## Step 9: End-to-End Test (Prove Everything Works)

### Test 1: Guestbook works
1. Open the Guestbook URL in browser
2. Type "Hello World" in the text box
3. Click Submit
4. You should see "Hello World" appear in the messages list

### Test 2: Redis is storing data
```bash
# Connect to Redis leader and check
kubectl exec -it $(kubectl get pod -n guestbook -l role=leader -o jsonpath='{.items[0].metadata.name}') -n guestbook -c redis-leader -- redis-cli
```

Inside Redis CLI:
```
KEYS *
GET messages
```
You should see your "Hello World" message stored. Type `exit` to leave.

### Test 3: Prometheus is scraping
```bash
# Check ServiceMonitors exist
kubectl get servicemonitors -n guestbook
```

Expected:
```
NAME               AGE
redis-metrics      5m
frontend-metrics   5m
```

### Test 4: Grafana dashboard has data
1. Open Grafana (http://localhost:3000 or LoadBalancer URL)
2. Go to Dashboards then Guestbook then Guestbook Application Dashboard
3. You should see graphs with actual data points (not empty)

### Test 5: Generate some traffic and watch metrics
```bash
# Run this to send 100 requests to the Guestbook
# Replace <FRONTEND-URL> with your actual frontend URL
for i in $(seq 1 100); do curl -s http://<FRONTEND-URL> > /dev/null; done
```

Now go back to Grafana — you should see a spike in the network/request panels!

---

## Step 10: Take Screenshots for Submission

Take screenshots of:
1. `pulumi up` output showing successful deployment
2. `kubectl get pods -n guestbook` showing all pods Running
3. `kubectl get pods -n monitoring` showing all pods Running
4. Guestbook app working in browser
5. Grafana dashboard with metrics
6. Prometheus Targets page showing guestbook targets as UP
7. Prometheus query `redis_up{namespace="guestbook"}` returning results

---

## Cleanup (After Submission)

When you're done and want to delete everything:

```bash
pulumi destroy
```

Type `yes` when asked. This removes all Kubernetes resources.

Then delete the stack:
```bash
pulumi stack rm dev
```

---

## Troubleshooting

### Problem: Pods stuck in "Pending"
```bash
kubectl describe pod <pod-name> -n <namespace>
```
Usually means: Not enough resources on your EKS nodes. Solution: Add more/bigger nodes.

### Problem: LoadBalancer shows `<pending>` forever
Your EKS cluster might not have the AWS Load Balancer Controller. Check:
```bash
kubectl get svc -n guestbook
kubectl get svc -n monitoring
```
If stuck, use port-forward instead:
```bash
kubectl port-forward svc/frontend 8080:80 -n guestbook
# Then open http://localhost:8080
```

### Problem: Grafana shows "No data" in panels
- Wait 2-3 minutes for Prometheus to collect data
- Make sure you accessed the Guestbook at least once (to generate traffic)
- Check Prometheus targets are UP (Step 8b)

### Problem: `pulumi up` fails with Helm error
```bash
# Make sure Helm is installed
helm version

# If the chart fails, try updating Helm repos
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### Problem: Can't connect to EKS
```bash
# Re-authenticate
aws sts get-caller-identity
aws eks update-kubeconfig --name <cluster-name> --region <region>
kubectl get nodes
```

---

## Quick Reference Card

| What | Command |
|------|---------|
| Deploy everything | `pulumi up` |
| Check guestbook pods | `kubectl get pods -n guestbook` |
| Check monitoring pods | `kubectl get pods -n monitoring` |
| Get Guestbook URL | `kubectl get svc frontend -n guestbook` |
| Get Grafana URL | `kubectl get svc kube-prometheus-stack-grafana -n monitoring` |
| Port-forward Grafana | `kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring` |
| Port-forward Prometheus | `kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring` |
| Grafana login | Username: `admin` / Password: `admin123` |
| Check ServiceMonitors | `kubectl get servicemonitors -n guestbook` |
| Destroy everything | `pulumi destroy` |
| See Pulumi outputs | `pulumi stack output` |

---

## Summary: What This Project Does

```
YOU RUN: pulumi up

WHAT GETS CREATED:
├── guestbook namespace
│   ├── Frontend (3 pods) ← The web app you can visit
│   ├── Redis Leader (1 pod + metrics exporter)
│   └── Redis Followers (2 pods + metrics exporters)
│
└── monitoring namespace
    ├── Prometheus ← Collects metrics from all pods
    ├── Grafana ← Shows pretty dashboards
    ├── AlertManager ← Can send alerts
    ├── node-exporter ← Monitors the EC2 nodes
    └── kube-state-metrics ← Monitors Kubernetes objects

HOW THEY CONNECT:
Guestbook pods have annotations → Prometheus discovers them → Scrapes metrics
Redis Exporter sidecars → Expose Redis metrics → Prometheus scrapes them
Prometheus → Feeds data to → Grafana dashboards
```

---

Good luck with your submission, Yash!

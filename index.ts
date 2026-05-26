import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// ============================================================================
// Configuration
// ============================================================================
const config = new pulumi.Config();
const guestbookNs = config.get("namespace") || "guestbook";

const monitoringConfig = new pulumi.Config("monitoring");
const monitoringNs = monitoringConfig.get("namespace") || "monitoring";

// Grafana admin credentials
const grafanaAdminUser = "admin";
const grafanaAdminPassword = "admin123";

// ============================================================================
// Namespaces
// ============================================================================
const guestbookNamespace = new k8s.core.v1.Namespace("guestbook-ns", {
    metadata: { name: guestbookNs },
});

const monitoringNamespace = new k8s.core.v1.Namespace("monitoring-ns", {
    metadata: { name: monitoringNs },
});

// ============================================================================
// Guestbook Application - Redis Backend
// ============================================================================

// Redis Leader Deployment
const redisLeaderDeployment = new k8s.apps.v1.Deployment("redis-leader", {
    metadata: {
        name: "redis-leader",
        namespace: guestbookNs,
        labels: { app: "redis", role: "leader" },
    },
    spec: {
        replicas: 1,
        selector: { matchLabels: { app: "redis", role: "leader" } },
        template: {
            metadata: {
                labels: { app: "redis", role: "leader" },
                annotations: {
                    "prometheus.io/scrape": "true",
                    "prometheus.io/port": "9121",
                },
            },
            spec: {
                containers: [
                    {
                        name: "redis-leader",
                        image: "redis:7.0",
                        ports: [{ containerPort: 6379 }],
                        resources: {
                            requests: { cpu: "100m", memory: "100Mi" },
                            limits: { cpu: "200m", memory: "200Mi" },
                        },
                    },
                    {
                        name: "redis-exporter",
                        image: "oliver006/redis_exporter:latest",
                        ports: [{ containerPort: 9121, name: "metrics" }],
                        resources: {
                            requests: { cpu: "50m", memory: "50Mi" },
                            limits: { cpu: "100m", memory: "100Mi" },
                        },
                    },
                ],
            },
        },
    },
}, { dependsOn: [guestbookNamespace] });

// Redis Leader Service
const redisLeaderService = new k8s.core.v1.Service("redis-leader-svc", {
    metadata: {
        name: "redis-leader",
        namespace: guestbookNs,
        labels: { app: "redis", role: "leader" },
    },
    spec: {
        ports: [{ port: 6379, targetPort: 6379 }],
        selector: { app: "redis", role: "leader" },
    },
}, { dependsOn: [guestbookNamespace] });

// Redis Follower Deployment
const redisFollowerDeployment = new k8s.apps.v1.Deployment("redis-follower", {
    metadata: {
        name: "redis-follower",
        namespace: guestbookNs,
        labels: { app: "redis", role: "follower" },
    },
    spec: {
        replicas: 2,
        selector: { matchLabels: { app: "redis", role: "follower" } },
        template: {
            metadata: {
                labels: { app: "redis", role: "follower" },
                annotations: {
                    "prometheus.io/scrape": "true",
                    "prometheus.io/port": "9121",
                },
            },
            spec: {
                containers: [
                    {
                        name: "redis-follower",
                        image: "gcr.io/google_samples/gb-redis-follower:v2",
                        ports: [{ containerPort: 6379 }],
                        resources: {
                            requests: { cpu: "100m", memory: "100Mi" },
                            limits: { cpu: "200m", memory: "200Mi" },
                        },
                    },
                    {
                        name: "redis-exporter",
                        image: "oliver006/redis_exporter:latest",
                        ports: [{ containerPort: 9121, name: "metrics" }],
                        resources: {
                            requests: { cpu: "50m", memory: "50Mi" },
                            limits: { cpu: "100m", memory: "100Mi" },
                        },
                    },
                ],
            },
        },
    },
}, { dependsOn: [guestbookNamespace] });

// Redis Follower Service
const redisFollowerService = new k8s.core.v1.Service("redis-follower-svc", {
    metadata: {
        name: "redis-follower",
        namespace: guestbookNs,
        labels: { app: "redis", role: "follower" },
    },
    spec: {
        ports: [{ port: 6379, targetPort: 6379 }],
        selector: { app: "redis", role: "follower" },
    },
}, { dependsOn: [guestbookNamespace] });


// ============================================================================
// Guestbook Application - Frontend
// ============================================================================
const frontendDeployment = new k8s.apps.v1.Deployment("frontend", {
    metadata: {
        name: "frontend",
        namespace: guestbookNs,
        labels: { app: "guestbook", tier: "frontend" },
    },
    spec: {
        replicas: 3,
        selector: { matchLabels: { app: "guestbook", tier: "frontend" } },
        template: {
            metadata: {
                labels: { app: "guestbook", tier: "frontend" },
                annotations: {
                    "prometheus.io/scrape": "true",
                    "prometheus.io/port": "80",
                    "prometheus.io/path": "/metrics",
                },
            },
            spec: {
                containers: [{
                    name: "php-redis",
                    image: "gcr.io/google_samples/gb-frontend:v5",
                    ports: [{ containerPort: 80 }],
                    resources: {
                        requests: { cpu: "100m", memory: "100Mi" },
                        limits: { cpu: "200m", memory: "200Mi" },
                    },
                    env: [
                        { name: "GET_HOSTS_FROM", value: "dns" },
                    ],
                }],
            },
        },
    },
}, { dependsOn: [guestbookNamespace] });

// Frontend Service
const frontendService = new k8s.core.v1.Service("frontend-svc", {
    metadata: {
        name: "frontend",
        namespace: guestbookNs,
        labels: { app: "guestbook", tier: "frontend" },
        annotations: {
            "prometheus.io/scrape": "true",
            "prometheus.io/port": "80",
        },
    },
    spec: {
        type: "LoadBalancer",
        ports: [{ port: 80, targetPort: 80 }],
        selector: { app: "guestbook", tier: "frontend" },
    },
}, { dependsOn: [guestbookNamespace] });

// ============================================================================
// Prometheus - Deployed via Helm Chart (kube-prometheus-stack)
// ============================================================================
const prometheusStack = new k8s.helm.v3.Release("kube-prometheus-stack", {
    name: "kube-prometheus-stack",
    namespace: monitoringNs,
    chart: "kube-prometheus-stack",
    version: "58.2.2",
    repositoryOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
        // Prometheus configuration
        prometheus: {
            prometheusSpec: {
                serviceMonitorSelectorNilUsesHelmValues: false,
                podMonitorSelectorNilUsesHelmValues: false,
                // Scrape all namespaces
                serviceMonitorNamespaceSelector: {},
                podMonitorNamespaceSelector: {},
                // Additional scrape configs for annotation-based discovery
                additionalScrapeConfigs: [
                    {
                        job_name: "kubernetes-pods",
                        kubernetes_sd_configs: [{ role: "pod" }],
                        relabel_configs: [
                            {
                                source_labels: ["__meta_kubernetes_pod_annotation_prometheus_io_scrape"],
                                action: "keep",
                                regex: "true",
                            },
                            {
                                source_labels: ["__meta_kubernetes_pod_annotation_prometheus_io_path"],
                                action: "replace",
                                target_label: "__metrics_path__",
                                regex: "(.+)",
                            },
                            {
                                source_labels: ["__address__", "__meta_kubernetes_pod_annotation_prometheus_io_port"],
                                action: "replace",
                                regex: "([^:]+)(?::\\d+)?;(\\d+)",
                                replacement: "$1:$2",
                                target_label: "__address__",
                            },
                            {
                                source_labels: ["__meta_kubernetes_namespace"],
                                action: "replace",
                                target_label: "namespace",
                            },
                            {
                                source_labels: ["__meta_kubernetes_pod_name"],
                                action: "replace",
                                target_label: "pod",
                            },
                            {
                                source_labels: ["__meta_kubernetes_pod_label_app"],
                                action: "replace",
                                target_label: "app",
                            },
                        ],
                    },
                    {
                        job_name: "kubernetes-service-endpoints",
                        kubernetes_sd_configs: [{ role: "endpoints" }],
                        relabel_configs: [
                            {
                                source_labels: ["__meta_kubernetes_service_annotation_prometheus_io_scrape"],
                                action: "keep",
                                regex: "true",
                            },
                            {
                                source_labels: ["__address__", "__meta_kubernetes_service_annotation_prometheus_io_port"],
                                action: "replace",
                                target_label: "__address__",
                                regex: "([^:]+)(?::\\d+)?;(\\d+)",
                                replacement: "$1:$2",
                            },
                            {
                                source_labels: ["__meta_kubernetes_namespace"],
                                action: "replace",
                                target_label: "namespace",
                            },
                            {
                                source_labels: ["__meta_kubernetes_service_name"],
                                action: "replace",
                                target_label: "service",
                            },
                        ],
                    },
                ],
            },
        },
        // Grafana configuration
        grafana: {
            enabled: true,
            adminUser: grafanaAdminUser,
            adminPassword: grafanaAdminPassword,
            service: {
                type: "LoadBalancer",
                port: 80,
            },
            // Default dashboards
            defaultDashboardsEnabled: true,
            dashboardProviders: {
                "dashboardproviders.yaml": {
                    apiVersion: 1,
                    providers: [
                        {
                            name: "custom",
                            orgId: 1,
                            folder: "Guestbook",
                            type: "file",
                            disableDeletion: false,
                            editable: true,
                            options: {
                                path: "/var/lib/grafana/dashboards/custom",
                            },
                        },
                    ],
                },
            },
            dashboards: {
                custom: {
                    "guestbook-dashboard": {
                        json: JSON.stringify({
                            annotations: { list: [] },
                            editable: true,
                            fiscalYearStartMonth: 0,
                            graphTooltip: 0,
                            id: null,
                            links: [],
                            liveNow: false,
                            panels: [
                                {
                                    title: "Pod CPU Usage - Guestbook Namespace",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 12, x: 0, y: 0 },
                                    targets: [{
                                        expr: 'sum(rate(container_cpu_usage_seconds_total{namespace="guestbook"}[5m])) by (pod)',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "short" },
                                        overrides: [],
                                    },
                                },
                                {
                                    title: "Pod Memory Usage - Guestbook Namespace",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 12, x: 12, y: 0 },
                                    targets: [{
                                        expr: 'sum(container_memory_working_set_bytes{namespace="guestbook"}) by (pod)',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "bytes" },
                                        overrides: [],
                                    },
                                },
                                {
                                    title: "Network Receive - Guestbook Pods",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 12, x: 0, y: 8 },
                                    targets: [{
                                        expr: 'sum(rate(container_network_receive_bytes_total{namespace="guestbook"}[5m])) by (pod)',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "Bps" },
                                        overrides: [],
                                    },
                                },
                                {
                                    title: "Network Transmit - Guestbook Pods",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 12, x: 12, y: 8 },
                                    targets: [{
                                        expr: 'sum(rate(container_network_transmit_bytes_total{namespace="guestbook"}[5m])) by (pod)',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "Bps" },
                                        overrides: [],
                                    },
                                },
                                {
                                    title: "Redis Connected Clients",
                                    type: "stat",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 4, w: 6, x: 0, y: 16 },
                                    targets: [{
                                        expr: 'redis_connected_clients{namespace="guestbook"}',
                                        legendFormat: "{{pod}}",
                                    }],
                                },
                                {
                                    title: "Redis Commands Per Second",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 12, x: 0, y: 20 },
                                    targets: [{
                                        expr: 'rate(redis_commands_processed_total{namespace="guestbook"}[5m])',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "ops" },
                                        overrides: [],
                                    },
                                },
                                {
                                    title: "Redis Memory Usage",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 12, x: 12, y: 20 },
                                    targets: [{
                                        expr: 'redis_memory_used_bytes{namespace="guestbook"}',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "bytes" },
                                        overrides: [],
                                    },
                                },
                                {
                                    title: "HTTP Requests (Frontend)",
                                    type: "timeseries",
                                    datasource: { type: "prometheus", uid: "prometheus" },
                                    gridPos: { h: 8, w: 24, x: 0, y: 28 },
                                    targets: [{
                                        expr: 'sum(rate(container_network_receive_packets_total{namespace="guestbook", pod=~"frontend.*"}[5m])) by (pod)',
                                        legendFormat: "{{pod}}",
                                    }],
                                    fieldConfig: {
                                        defaults: { unit: "pps" },
                                        overrides: [],
                                    },
                                },
                            ],
                            schemaVersion: 38,
                            style: "dark",
                            tags: ["guestbook", "kubernetes"],
                            templating: { list: [] },
                            time: { from: "now-1h", to: "now" },
                            title: "Guestbook Application Dashboard",
                            uid: "guestbook-app",
                        }),
                    },
                },
            },
        },
        // AlertManager
        alertmanager: {
            enabled: true,
        },
        // Node exporter for node-level metrics
        nodeExporter: {
            enabled: true,
        },
        // kube-state-metrics for Kubernetes object metrics
        "kube-state-metrics": {
            enabled: true,
        },
    },
}, { dependsOn: [monitoringNamespace] });


// ============================================================================
// ServiceMonitor for Guestbook Redis (to be picked up by Prometheus Operator)
// ============================================================================
const redisServiceMonitor = new k8s.apiextensions.CustomResource("redis-service-monitor", {
    apiVersion: "monitoring.coreos.com/v1",
    kind: "ServiceMonitor",
    metadata: {
        name: "redis-metrics",
        namespace: guestbookNs,
        labels: {
            release: "kube-prometheus-stack",
        },
    },
    spec: {
        selector: {
            matchLabels: { app: "redis" },
        },
        namespaceSelector: {
            matchNames: [guestbookNs],
        },
        endpoints: [
            {
                port: "metrics",
                interval: "15s",
                path: "/metrics",
            },
        ],
    },
}, { dependsOn: [prometheusStack, guestbookNamespace] });

// ServiceMonitor for Frontend
const frontendServiceMonitor = new k8s.apiextensions.CustomResource("frontend-service-monitor", {
    apiVersion: "monitoring.coreos.com/v1",
    kind: "ServiceMonitor",
    metadata: {
        name: "frontend-metrics",
        namespace: guestbookNs,
        labels: {
            release: "kube-prometheus-stack",
        },
    },
    spec: {
        selector: {
            matchLabels: { app: "guestbook", tier: "frontend" },
        },
        namespaceSelector: {
            matchNames: [guestbookNs],
        },
        endpoints: [
            {
                port: "http",
                interval: "15s",
                path: "/metrics",
            },
        ],
    },
}, { dependsOn: [prometheusStack, guestbookNamespace] });

// ============================================================================
// Add metrics port to Redis services for ServiceMonitor
// ============================================================================
const redisLeaderMetricsService = new k8s.core.v1.Service("redis-leader-metrics-svc", {
    metadata: {
        name: "redis-leader-metrics",
        namespace: guestbookNs,
        labels: { app: "redis", role: "leader" },
    },
    spec: {
        ports: [{ port: 9121, targetPort: 9121, name: "metrics" }],
        selector: { app: "redis", role: "leader" },
    },
}, { dependsOn: [guestbookNamespace] });

const redisFollowerMetricsService = new k8s.core.v1.Service("redis-follower-metrics-svc", {
    metadata: {
        name: "redis-follower-metrics",
        namespace: guestbookNs,
        labels: { app: "redis", role: "follower" },
    },
    spec: {
        ports: [{ port: 9121, targetPort: 9121, name: "metrics" }],
        selector: { app: "redis", role: "follower" },
    },
}, { dependsOn: [guestbookNamespace] });

// ============================================================================
// Outputs
// ============================================================================

// Guestbook Frontend URL
export const guestbookFrontendUrl = frontendService.status.apply((status: any) => {
    const ingress = status?.loadBalancer?.ingress?.[0];
    if (ingress) {
        return `http://${ingress.ip || ingress.hostname}`;
    }
    return "Pending... (use 'kubectl get svc frontend -n guestbook' to check)";
});

// Grafana Access Details
export const grafanaUrl = prometheusStack.status.apply((_status: any) => {
    return `Access Grafana via: kubectl get svc kube-prometheus-stack-grafana -n ${monitoringNs} -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`;
});

export const grafanaAccessInfo = pulumi.interpolate`
=== Grafana Access Details ===
Namespace: ${monitoringNs}
Service: kube-prometheus-stack-grafana
Type: LoadBalancer (port 80)
Admin Username: ${grafanaAdminUser}
Admin Password: ${grafanaAdminPassword}

To get the external IP:
  kubectl get svc kube-prometheus-stack-grafana -n ${monitoringNs}

If using Minikube:
  minikube service kube-prometheus-stack-grafana -n ${monitoringNs}

If using kind/local cluster (port-forward):
  kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n ${monitoringNs}
  Then access: http://localhost:3000
`;

export const prometheusAccessInfo = pulumi.interpolate`
=== Prometheus Access Details ===
Namespace: ${monitoringNs}
Service: kube-prometheus-stack-prometheus

To access Prometheus UI (port-forward):
  kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n ${monitoringNs}
  Then access: http://localhost:9090
`;

export const grafanaAdminUsername = grafanaAdminUser;
export const grafanaAdminPass = grafanaAdminPassword;
export const monitoringNamespaceName = monitoringNs;
export const guestbookNamespaceName = guestbookNs;

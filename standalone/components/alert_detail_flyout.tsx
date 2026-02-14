/**
 * Alert Detail Flyout — comprehensive view of a single alert's
 * state, context, and related information.
 */
import React from 'react';
import ReactECharts from 'echarts-for-react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiPanel,
  EuiDescriptionList,
  EuiAccordion,
  EuiCodeBlock,
  EuiIcon,
  EuiLink,
  EuiHorizontalRule,
  EuiTabs,
  EuiTab,
} from '@opensearch-project/oui';
import { UnifiedAlert, UnifiedAlertState, UnifiedAlertSeverity } from '../../core';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
  info: 'default',
};

const STATE_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  resolved: 'success',
  error: 'danger',
};

export interface AlertDetailFlyoutProps {
  alert: UnifiedAlert;
  onClose: () => void;
}

// Mock data generators for enhanced insights
const generateSummary = (alert: UnifiedAlert): string => {
  const service = alert.labels.service || 'service';
  const metric = alert.labels.metric || 'error rate';
  return `Your ${service} is experiencing increased ${metric} that coincide with database billing-service-python memory usage reaching 85% on three pods. Historical data shows this pattern typically leads to service degradation within 20 minutes.`;
};

const generateRootCause = (alert: UnifiedAlert): string => {
  return 'High CPU/memory usage triggers resource limits';
};

const generateImpactServices = (alert: UnifiedAlert) => {
  const service = alert.labels.service || 'payment-gateway';
  return [
    { name: 'PetClinicMonitor', status: 'warning', icon: 'monitoringApp' },
    { name: service, status: 'critical', icon: 'node' },
    { name: 'billing-service-python', status: 'critical', icon: 'storage' },
  ];
};

const generateRecommendation = (alert: UnifiedAlert): string => {
  return 'Consider adding composite index on (user_id, transaction_date) for performance improvement.';
};

const generateDiveDeeper = (alert: UnifiedAlert) => {
  return {
    summary: '70% of execution time spent in database operations, with the payment_transactions query as the primary bottleneck.',
    traceLink: 'Look into traces from payments-db',
  };
};

const generateRelatedAlerts = (alert: UnifiedAlert): UnifiedAlert[] => {
  // Mock related alerts that are correlated with the current alert
  const baseTime = new Date(alert.startTime).getTime();
  
  return [
    {
      id: 'related-1',
      datasourceId: alert.datasourceId,
      datasourceType: alert.datasourceType,
      name: 'High Database Connection Pool Usage',
      state: 'active' as UnifiedAlertState,
      severity: 'high' as UnifiedAlertSeverity,
      message: 'Database connection pool at 92% capacity',
      startTime: new Date(baseTime - 15 * 60 * 1000).toISOString(),
      lastUpdated: new Date(baseTime - 5 * 60 * 1000).toISOString(),
      labels: { service: 'billing-service-python', metric: 'db_connections' },
      annotations: { correlation: '0.87' },
      raw: {} as any,
    },
    {
      id: 'related-2',
      datasourceId: alert.datasourceId,
      datasourceType: alert.datasourceType,
      name: 'Increased API Response Time',
      state: 'active' as UnifiedAlertState,
      severity: 'medium' as UnifiedAlertSeverity,
      message: 'API response time increased by 45%',
      startTime: new Date(baseTime - 10 * 60 * 1000).toISOString(),
      lastUpdated: new Date(baseTime - 2 * 60 * 1000).toISOString(),
      labels: { service: 'payment-gateway', metric: 'response_time' },
      annotations: { correlation: '0.76' },
      raw: {} as any,
    },
    {
      id: 'related-3',
      datasourceId: alert.datasourceId,
      datasourceType: alert.datasourceType,
      name: 'Pod Restart Detected',
      state: 'resolved' as UnifiedAlertState,
      severity: 'low' as UnifiedAlertSeverity,
      message: 'billing-service-python pod restarted',
      startTime: new Date(baseTime - 25 * 60 * 1000).toISOString(),
      lastUpdated: new Date(baseTime - 20 * 60 * 1000).toISOString(),
      labels: { service: 'billing-service-python', metric: 'pod_restarts' },
      annotations: { correlation: '0.65' },
      raw: {} as any,
    },
  ];
};

// Generate mock time series data for the chart
const generateChartData = () => {
  const now = Date.now();
  const data: [number, number][] = [];
  
  // Generate data points for the last 2 days
  for (let i = 48; i >= 0; i--) {
    const timestamp = now - i * 60 * 60 * 1000; // hourly data
    const baseValue = 2.2;
    const variation = Math.random() * 0.15 - 0.075;
    const spike = i < 12 ? (12 - i) * 0.01 : 0; // spike in recent hours
    data.push([timestamp, baseValue + variation + spike]);
  }
  
  return data;
};

export const AlertDetailFlyout: React.FC<AlertDetailFlyoutProps> = ({ alert, onClose }) => {
  const [selectedTab, setSelectedTab] = React.useState<'insights' | 'details'>('insights');
  const rawDisplay = JSON.stringify(alert.raw, null, 2);
  const summary = generateSummary(alert);
  const rootCause = generateRootCause(alert);
  const impactServices = generateImpactServices(alert);
  const recommendation = generateRecommendation(alert);
  const diveDeeper = generateDiveDeeper(alert);
  const relatedAlerts = generateRelatedAlerts(alert);
  const chartData = generateChartData();

  // Calculate metrics from alert data
  const decreaseRate = alert.annotations.decrease_rate || '4.87%';
  const baseline = alert.annotations.baseline || '0.8%';
  const threshold = alert.annotations.threshold || '1.2%';

  // ECharts configuration
  const thresholdValue = 2.25; // Threshold line value
  
  const chartOption = {
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: {
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
      },
      min: 2.1,
      max: 2.3,
    },
    series: [
      {
        name: 'pod_memory_utilization',
        type: 'line',
        data: chartData,
        smooth: false,
        lineStyle: {
          color: '#0077CC',
          width: 1.5,
        },
        itemStyle: {
          color: '#0077CC',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 119, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 119, 204, 0.05)' },
            ],
          },
        },
        showSymbol: false,
        z: 1,
      },
      {
        name: 'Threshold',
        type: 'line',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#BD271E',
            width: 2,
            type: 'solid',
          },
          label: {
            show: true,
            position: 'end',
            formatter: 'Threshold',
            color: '#BD271E',
            fontSize: 10,
          },
          data: [{ yAxis: thresholdValue }],
        },
        z: 2,
      },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const dataPoint = params.find((p: any) => p.seriesName === 'pod_memory_utilization');
        if (dataPoint) {
          const date = new Date(dataPoint.value[0]);
          const value = dataPoint.value[1].toFixed(3);
          return `${date.toLocaleString()}<br/>Value: ${value}<br/>Threshold: ${thresholdValue}`;
        }
        return '';
      },
    },
  };

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="alertDetailTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="alertDetailTitle">{alert.name}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup gutterSize="l" responsive={false} alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Start time:</strong> {new Date(alert.startTime).toLocaleTimeString()}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Decrease rate:</strong> <span style={{ color: '#F5A700' }}>{decreaseRate}</span>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Baseline:</strong> {baseline}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <strong>Threshold:</strong> {threshold}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[alert.severity]}>{alert.severity}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiTabs style={{ marginBottom: '-25px' }}>
          <EuiTab
            isSelected={selectedTab === 'insights'}
            onClick={() => setSelectedTab('insights')}
          >
            Insights
          </EuiTab>
          <EuiTab
            isSelected={selectedTab === 'details'}
            onClick={() => setSelectedTab('details')}
          >
            Alert details
          </EuiTab>
        </EuiTabs>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Insights Tab */}
        {selectedTab === 'insights' && (
          <>
            {/* Summary Section */}
            <section>
              <EuiTitle size="s">
                <h3>Summary</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiText size="s">
                <p>{summary}</p>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiText size="s">
                <p>
                  <strong>Likely root cause:</strong> {rootCause}
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              
              {/* Metric Chart */}
              <EuiPanel color="subdued" paddingSize="m">
                <EuiText size="xs" color="subdued">
                  <p>pod_memory_utilization</p>
                </EuiText>
                <ReactECharts 
                  option={chartOption} 
                  style={{ height: '180px', width: '100%' }}
                  opts={{ renderer: 'canvas' }}
                />
              </EuiPanel>
            </section>

            <EuiSpacer size="l" />
            <EuiHorizontalRule margin="none" />
            <EuiSpacer size="l" />

            {/* Impact Section */}
            <section>
              <EuiTitle size="s">
                <h3>Impact</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                {impactServices.map((service, idx) => (
                  <React.Fragment key={service.name}>
                    <EuiFlexItem grow={false}>
                      <EuiPanel
                        color={service.status === 'critical' ? 'danger' : 'warning'}
                        paddingSize="m"
                        style={{ minWidth: '180px' }}
                      >
                        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                          <EuiFlexItem grow={false}>
                            <EuiIcon type="alert" color="danger" size="m" />
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiIcon type={service.icon} size="l" />
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiText size="s">
                              <strong>{service.name}</strong>
                            </EuiText>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </EuiPanel>
                    </EuiFlexItem>
                    {idx < impactServices.length - 1 && (
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="arrowRight" size="m" />
                      </EuiFlexItem>
                    )}
                  </React.Fragment>
                ))}
              </EuiFlexGroup>
            </section>

            <EuiSpacer size="l" />
            <EuiHorizontalRule margin="none" />
            <EuiSpacer size="l" />

            {/* Recommendation Section */}
            <section>
              <EuiTitle size="s">
                <h3>Recommendation</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiText size="s">
                <p>{recommendation}</p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiButton size="s" color="text" iconType="wrench">
                Make changes in Kiro
              </EuiButton>
            </section>

            <EuiSpacer size="l" />
            <EuiHorizontalRule margin="none" />
            <EuiSpacer size="l" />

            {/* Dive Deeper Section */}
            <section>
              <EuiTitle size="s">
                <h3>Dive deeper</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiText size="s">
                <p>{diveDeeper.summary}</p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiButton size="s" color="text" iconType="search">
                {diveDeeper.traceLink}
              </EuiButton>
            </section>

            <EuiSpacer size="l" />
            <EuiHorizontalRule margin="none" />
            <EuiSpacer size="l" />

            {/* Related Alerts Section */}
            <section>
              <EuiTitle size="s">
                <h3>Related alerts ({relatedAlerts.length})</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiText size="s" color="subdued">
                <p>Alerts that are correlated with this alert based on timing and service dependencies</p>
              </EuiText>
              <EuiSpacer size="m" />
              {relatedAlerts.length > 0 ? (
                <EuiFlexGroup direction="column" gutterSize="s">
                  {relatedAlerts.map((relatedAlert) => (
                    <EuiFlexItem key={relatedAlert.id}>
                      <EuiPanel paddingSize="m" hasBorder>
                        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                          <EuiFlexItem grow={false}>
                            <EuiBadge color={STATE_COLORS[relatedAlert.state]}>
                              {relatedAlert.state}
                            </EuiBadge>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiBadge color={SEVERITY_COLORS[relatedAlert.severity]}>
                              {relatedAlert.severity}
                            </EuiBadge>
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiText size="s">
                              <strong>{relatedAlert.name}</strong>
                            </EuiText>
                            <EuiSpacer size="xs" />
                            <EuiText size="xs" color="subdued">
                              {relatedAlert.labels.service && `Service: ${relatedAlert.labels.service}`}
                              {relatedAlert.annotations.correlation && 
                                ` • Correlation: ${(parseFloat(relatedAlert.annotations.correlation) * 100).toFixed(0)}%`
                              }
                            </EuiText>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiText size="xs" color="subdued">
                              {new Date(relatedAlert.startTime).toLocaleTimeString()}
                            </EuiText>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiButtonEmpty size="xs" iconType="eye">
                              View
                            </EuiButtonEmpty>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </EuiPanel>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ) : (
                <EuiText size="s" color="subdued">
                  No related alerts found
                </EuiText>
              )}
            </section>
          </>
        )}

        {/* Alert Details Tab */}
        {selectedTab === 'details' && (
          <div>
            {/* Alert Details */}
            <EuiPanel paddingSize="none" hasBorder={false}>
              <EuiTitle size="xs">
                <h4>Alert Details</h4>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  { title: 'Alert ID', description: alert.id },
                  { title: 'State', description: alert.state },
                  { title: 'Severity', description: alert.severity },
                  { title: 'Started', description: new Date(alert.startTime).toLocaleString() },
                  { title: 'Last Updated', description: new Date(alert.lastUpdated).toLocaleString() },
                  { title: 'Backend', description: alert.datasourceType },
                  { title: 'Datasource ID', description: alert.datasourceId },
                ]}
              />
            </EuiPanel>

            <EuiSpacer size="l" />

            {/* Labels */}
            <EuiPanel paddingSize="none" hasBorder={false}>
              <EuiTitle size="xs">
                <h4>Labels</h4>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                {Object.entries(alert.labels).map(([k, v]) => (
                  <EuiFlexItem grow={false} key={k}>
                    <EuiBadge color="hollow">
                      {k}: {v}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
                {Object.keys(alert.labels).length === 0 && (
                  <EuiText size="s" color="subdued">
                    No labels
                  </EuiText>
                )}
              </EuiFlexGroup>
            </EuiPanel>

            <EuiSpacer size="l" />

            {/* Annotations */}
            <EuiPanel paddingSize="none" hasBorder={false}>
              <EuiTitle size="xs">
                <h4>Annotations</h4>
              </EuiTitle>
              <EuiSpacer size="s" />
              {Object.keys(alert.annotations).length > 0 ? (
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={Object.entries(alert.annotations).map(([k, v]) => ({
                    title: k,
                    description: v,
                  }))}
                />
              ) : (
                <EuiText size="s" color="subdued">
                  No annotations
                </EuiText>
              )}
            </EuiPanel>

            <EuiSpacer size="l" />

            {/* Raw Data */}
            <EuiPanel paddingSize="none" hasBorder={false}>
              <EuiTitle size="xs">
                <h4>Raw Alert Data</h4>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                {rawDisplay}
              </EuiCodeBlock>
            </EuiPanel>
          </div>
        )}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton iconType="search" color="primary">
              Start investigation
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill>
              Acknowledge
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

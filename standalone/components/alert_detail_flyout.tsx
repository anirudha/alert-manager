/**
 * Alert Detail Flyout — drill-down view for a single alert
 * showing full context, labels, annotations, and actions.
 */
import React from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiHealth,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiPanel,
  EuiDescriptionList,
  EuiAccordion,
  EuiCodeBlock,
  EuiHorizontalRule,
  EuiIcon,
} from '@opensearch-project/oui';
import { UnifiedAlert, Datasource } from '../../core';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger', high: 'warning', medium: 'primary', low: 'subdued', info: 'default',
};
const STATE_COLORS: Record<string, string> = {
  active: 'danger', pending: 'warning', acknowledged: 'primary', resolved: 'success', error: 'danger',
};

export interface AlertDetailFlyoutProps {
  alert: UnifiedAlert;
  datasources: Datasource[];
  onClose: () => void;
  onAcknowledge: (alertId: string) => void;
  onSilence: (alertId: string) => void;
}

export const AlertDetailFlyout: React.FC<AlertDetailFlyoutProps> = ({
  alert, datasources, onClose, onAcknowledge, onSilence,
}) => {
  const dsName = datasources.find(d => d.id === alert.datasourceId)?.name || alert.datasourceId;
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};

  // Generate a mock AI analysis for the alert
  const aiAnalysis = getAlertAiAnalysis(alert);

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="alertDetailTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem>
            <EuiTitle size="m"><h2 id="alertDetailTitle">{alert.name}</h2></EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiHealth color={STATE_COLORS[alert.state]}>{alert.state}</EuiHealth>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[alert.severity]}>{alert.severity}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {alert.message || 'No message available'}
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* AI Analysis */}
        <EuiAccordion id="alertAiAnalysis" buttonContent={
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}><EuiIcon type="compute" /></EuiFlexItem>
            <EuiFlexItem grow={false}><strong>AI Analysis</strong></EuiFlexItem>
            <EuiFlexItem grow={false}><EuiBadge color="hollow">Beta</EuiBadge></EuiFlexItem>
          </EuiFlexGroup>
        } initialIsOpen={true} paddingSize="m">
          <EuiPanel color="subdued" paddingSize="m">
            <EuiText size="s"><p>{aiAnalysis}</p></EuiText>
          </EuiPanel>
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Alert Details */}
        <EuiAccordion id="alertDetails" buttonContent={<strong>Alert Details</strong>} initialIsOpen={true} paddingSize="m">
          <EuiDescriptionList
            type="column"
            compressed
            listItems={[
              { title: 'Alert ID', description: alert.id },
              { title: 'State', description: alert.state },
              { title: 'Severity', description: alert.severity },
              { title: 'Backend', description: alert.datasourceType },
              { title: 'Datasource', description: dsName },
              { title: 'Started', description: alert.startTime ? new Date(alert.startTime).toLocaleString() : '—' },
              { title: 'Last Updated', description: alert.lastUpdated ? new Date(alert.lastUpdated).toLocaleString() : '—' },
              { title: 'Duration', description: getAlertDuration(alert.startTime) },
            ]}
          />
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Labels */}
        <EuiAccordion id="alertLabels" buttonContent={
          <strong>Labels ({Object.keys(labels).length})</strong>
        } initialIsOpen={true} paddingSize="m">
          {Object.keys(labels).length > 0 ? (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {Object.entries(labels).map(([k, v]) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge color="hollow">{k}: {v}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          ) : (
            <EuiText size="s" color="subdued">No labels</EuiText>
          )}
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Annotations */}
        <EuiAccordion id="alertAnnotations" buttonContent={
          <strong>Annotations ({Object.keys(annotations).length})</strong>
        } initialIsOpen={true} paddingSize="m">
          {Object.keys(annotations).length > 0 ? (
            <EuiDescriptionList
              type="column"
              compressed
              listItems={Object.entries(annotations).map(([k, v]) => ({
                title: k,
                description: v,
              }))}
            />
          ) : (
            <EuiText size="s" color="subdued">No annotations</EuiText>
          )}
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Suppression Status */}
        <EuiAccordion id="suppressionStatus" buttonContent={
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}><EuiIcon type="bellSlash" /></EuiFlexItem>
            <EuiFlexItem grow={false}><strong>Suppression Status</strong></EuiFlexItem>
          </EuiFlexGroup>
        } initialIsOpen={false} paddingSize="m">
          {alert.state === 'resolved' ? (
            <EuiPanel color="subdued" paddingSize="s">
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}><EuiBadge color="default">Silenced</EuiBadge></EuiFlexItem>
                <EuiFlexItem><EuiText size="xs" color="subdued">This alert has been silenced or resolved.</EuiText></EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          ) : (
            <EuiText size="s" color="subdued">No active suppression rules affecting this alert.</EuiText>
          )}
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Routing Information */}
        <EuiAccordion id="routingInfo" buttonContent={
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}><EuiIcon type="bell" /></EuiFlexItem>
            <EuiFlexItem grow={false}><strong>Notification Routing</strong></EuiFlexItem>
          </EuiFlexGroup>
        } initialIsOpen={false} paddingSize="m">
          <EuiText size="s" color="subdued">
            Routing is determined by the monitor's notification configuration and matching routing rules.
            Check the associated monitor's detail view for full routing setup.
          </EuiText>
          {alert.labels.service && (
            <EuiPanel color="subdued" paddingSize="s" style={{ marginTop: 8 }}>
              <EuiText size="xs">
                Service: <EuiBadge color="hollow">{alert.labels.service}</EuiBadge>
                {alert.labels.team && <> | Team: <EuiBadge color="hollow">{alert.labels.team}</EuiBadge></>}
              </EuiText>
            </EuiPanel>
          )}
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Raw Data */}
        <EuiAccordion id="alertRaw" buttonContent={<strong>Raw Alert Data</strong>} initialIsOpen={false} paddingSize="m">
          <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
            {JSON.stringify(alert.raw, null, 2)}
          </EuiCodeBlock>
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Suggested Actions */}
        <EuiAccordion id="suggestedActions" buttonContent={
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}><EuiIcon type="sparkles" /></EuiFlexItem>
            <EuiFlexItem grow={false}><strong>Suggested Actions</strong></EuiFlexItem>
          </EuiFlexGroup>
        } initialIsOpen={true} paddingSize="m">
          {getSuggestedActions(alert).map((action, i) => (
            <EuiPanel key={i} paddingSize="s" color="subdued" style={{ marginBottom: 6 }}>
              <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiIcon type={action.icon} color={action.color} />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="s"><strong>{action.title}</strong></EuiText>
                  <EuiText size="xs" color="subdued">{action.description}</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          ))}
        </EuiAccordion>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>Close</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButton size="s" iconType="bellSlash" onClick={() => onSilence(alert.id)}>
                  Silence
                </EuiButton>
              </EuiFlexItem>
              {alert.state === 'active' && (
                <EuiFlexItem grow={false}>
                  <EuiButton fill size="s" iconType="check" onClick={() => onAcknowledge(alert.id)}>
                    Acknowledge
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

// ============================================================================
// Helpers
// ============================================================================

function getAlertDuration(startTime: string): string {
  if (!startTime) return '—';
  const ms = Date.now() - new Date(startTime).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function getAlertAiAnalysis(alert: UnifiedAlert): string {
  const analyses: Record<string, string> = {
    'HighCpuUsage': 'This host (i-0abc123) has sustained CPU usage above 80% for the past 5 minutes, currently at 92.3%. The spike correlates with increased request traffic. Consider scaling horizontally or investigating the workload causing the spike. Historical data shows this host has been consistently hot for 2 days.',
    'HighMemoryUsage': 'Critical memory pressure detected on i-0def456 at 94.7%. This pattern is consistent with a memory leak — heap usage has been growing ~2% per hour. Immediate action recommended: restart the application and investigate the leak. OOM kill risk is high within the next 2 hours.',
    'DiskSpaceLow': 'Disk space on i-0ghi789 is at 12.1% available. This is a staging environment where test data accumulates. The weekly cleanup job should resolve this automatically. If urgent, manually trigger the cleanup or expand the volume.',
    'HighErrorRate': 'HTTP 5xx error rate is at 8.2%, well above the 5% threshold. The errors are concentrated in the api-gateway service and appear to be caused by connection pool exhaustion to the upstream backend. This started 5 minutes ago and is still climbing. Immediate investigation of the backend service health is recommended.',
    'PodCrashLooping': 'The order-service pod is crash looping with OOMKilled status. Current memory limit is 512Mi but the service requires ~600Mi under load. Recommend increasing the memory limit to 768Mi in the deployment spec. 3 restarts in the last 15 minutes.',
    'CertificateExpiringSoon': 'The TLS certificate for api.example.com expires in 22 days. Auto-renewal via cert-manager has failed twice. Check the DNS-01 challenge configuration and cert-manager logs. Manual renewal may be needed as a fallback.',
  };
  return analyses[alert.name] || `Alert "${alert.name}" is currently ${alert.state} with ${alert.severity} severity. Started ${getAlertDuration(alert.startTime)} ago. Review the labels and annotations for additional context on the root cause.`;
}

function getSuggestedActions(alert: UnifiedAlert): Array<{ title: string; description: string; icon: string; color: string }> {
  const actions: Array<{ title: string; description: string; icon: string; color: string }> = [];

  if (alert.state === 'active') {
    actions.push({
      title: 'Acknowledge this alert',
      description: 'Mark as acknowledged to stop repeated notifications while you investigate.',
      icon: 'check', color: 'primary',
    });
  }

  if (alert.severity === 'critical' || alert.severity === 'high') {
    actions.push({
      title: 'Check related runbook',
      description: alert.annotations?.runbook_url || 'No runbook URL configured — consider adding one.',
      icon: 'document', color: 'warning',
    });
  }

  if (alert.labels?.instance) {
    actions.push({
      title: `Investigate host ${alert.labels.instance}`,
      description: 'Open host metrics dashboard to correlate with other system indicators.',
      icon: 'compute', color: 'default',
    });
  }

  if (alert.labels?.service) {
    actions.push({
      title: `Review ${alert.labels.service} service health`,
      description: 'Check service-level metrics, recent deployments, and dependency health.',
      icon: 'apps', color: 'default',
    });
  }

  actions.push({
    title: 'Silence for maintenance',
    description: 'Create a temporary silence rule if this alert is expected during maintenance.',
    icon: 'bellSlash', color: 'subdued',
  });

  return actions;
}

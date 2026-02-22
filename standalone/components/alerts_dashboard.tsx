/**
 * Alerts Dashboard — visualization-first view of alert history
 * with summary stats, charts, and drill-down table.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiStat,
  EuiSpacer,
  EuiHealth,
  EuiBadge,
  EuiBasicTable,
  EuiText,
  EuiTitle,
  EuiButtonIcon,
  EuiToolTip,
  EuiFieldSearch,
  EuiSelect,
  EuiEmptyPrompt,
  EuiButtonEmpty,
  EuiIcon,
  EuiLoadingContent,
  EuiHorizontalRule,
} from '@opensearch-project/oui';
import { UnifiedAlert, UnifiedAlertSeverity, UnifiedAlertState, Datasource } from '../../core';
import { filterAlerts } from '../../core/filter';

// ============================================================================
// Color maps
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#BD271E', high: '#F5A700', medium: '#006BB4', low: '#98A2B3', info: '#D3DAE6',
};
const SEVERITY_BADGE: Record<string, string> = {
  critical: 'danger', high: 'warning', medium: 'primary', low: 'subdued', info: 'default',
};
const STATE_COLORS: Record<string, string> = {
  active: '#BD271E', pending: '#F5A700', acknowledged: '#006BB4', resolved: '#017D73', error: '#BD271E',
};
const STATE_HEALTH: Record<string, string> = {
  active: 'danger', pending: 'warning', acknowledged: 'primary', resolved: 'success', error: 'danger',
};

// ============================================================================
// Helpers
// ============================================================================

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// ============================================================================
// SVG Severity Donut Chart
// ============================================================================

const SeverityDonut: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const counts = countBy(alerts, a => a.severity);
  const order: UnifiedAlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const total = alerts.length;
  if (total === 0) return <EuiText size="s" color="subdued" textAlign="center">No alerts</EuiText>;

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 58;
  const innerR = 38;
  let cumAngle = -Math.PI / 2;

  const arcs = order
    .filter(s => (counts[s] || 0) > 0)
    .map(s => {
      const count = counts[s] || 0;
      const angle = (count / total) * 2 * Math.PI;
      const startAngle = cumAngle;
      cumAngle += angle;
      const endAngle = cumAngle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1o = cx + outerR * Math.cos(startAngle);
      const y1o = cy + outerR * Math.sin(startAngle);
      const x2o = cx + outerR * Math.cos(endAngle);
      const y2o = cy + outerR * Math.sin(endAngle);
      const x1i = cx + innerR * Math.cos(endAngle);
      const y1i = cy + innerR * Math.sin(endAngle);
      const x2i = cx + innerR * Math.cos(startAngle);
      const y2i = cy + innerR * Math.sin(startAngle);
      const d = [
        `M ${x1o} ${y1o}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
        `L ${x1i} ${y1i}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
        'Z',
      ].join(' ');
      return { severity: s, d, count };
    });

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size}>
        {arcs.map(a => (
          <path key={a.severity} d={a.d} fill={SEVERITY_COLORS[a.severity]} opacity={0.9} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="bold" fill="#343741">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#98A2B3">alerts</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
        {order.filter(s => (counts[s] || 0) > 0).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEVERITY_COLORS[s], display: 'inline-block' }} />
            <span style={{ textTransform: 'capitalize' }}>{s}</span>
            <span style={{ fontWeight: 600 }}>{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SVG Alert Timeline (horizontal bar chart by time buckets)
// ============================================================================

const AlertTimeline: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  if (alerts.length === 0) return <EuiText size="s" color="subdued">No timeline data</EuiText>;

  const width = 520;
  const height = 140;
  const pad = { top: 15, right: 15, bottom: 28, left: 40 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  // Bucket alerts into 12 time buckets over the last 24 hours
  const now = Date.now();
  const bucketCount = 12;
  const bucketDuration = (24 * 60 * 60 * 1000) / bucketCount; // 2 hours each
  const buckets: Array<{ label: string; critical: number; high: number; medium: number; low: number; info: number }> = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = now - (bucketCount - i) * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const label = new Date(bucketStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const inBucket = alerts.filter(a => {
      const t = new Date(a.startTime).getTime();
      return t >= bucketStart && t < bucketEnd;
    });
    buckets.push({
      label,
      critical: inBucket.filter(a => a.severity === 'critical').length,
      high: inBucket.filter(a => a.severity === 'high').length,
      medium: inBucket.filter(a => a.severity === 'medium').length,
      low: inBucket.filter(a => a.severity === 'low').length,
      info: inBucket.filter(a => a.severity === 'info').length,
    });
  }

  const maxCount = Math.max(1, ...buckets.map(b => b.critical + b.high + b.medium + b.low + b.info));
  const barW = chartW / bucketCount - 4;

  return (
    <svg width={width} height={height} style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = pad.top + chartH * (1 - pct);
        return (
          <g key={i}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#EDF0F5" strokeWidth={1} />
            <text x={pad.left - 4} y={y + 3} textAnchor="end" fill="#98A2B3" fontSize={9}>
              {Math.round(maxCount * pct)}
            </text>
          </g>
        );
      })}
      {/* Stacked bars */}
      {buckets.map((b, i) => {
        const x = pad.left + i * (chartW / bucketCount) + 2;
        const sevs: Array<{ key: string; count: number; color: string }> = [
          { key: 'critical', count: b.critical, color: SEVERITY_COLORS.critical },
          { key: 'high', count: b.high, color: SEVERITY_COLORS.high },
          { key: 'medium', count: b.medium, color: SEVERITY_COLORS.medium },
          { key: 'low', count: b.low, color: SEVERITY_COLORS.low },
          { key: 'info', count: b.info, color: SEVERITY_COLORS.info },
        ];
        let yOffset = pad.top + chartH;
        return (
          <g key={i}>
            {sevs.map(s => {
              if (s.count === 0) return null;
              const barH = (s.count / maxCount) * chartH;
              yOffset -= barH;
              return <rect key={s.key} x={x} y={yOffset} width={barW} height={barH} fill={s.color} rx={1} opacity={0.85} />;
            })}
            {/* X label */}
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" fill="#98A2B3" fontSize={8}>
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};


// ============================================================================
// SVG State Breakdown (horizontal bar)
// ============================================================================

const StateBreakdown: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const counts = countBy(alerts, a => a.state);
  const order: UnifiedAlertState[] = ['active', 'pending', 'acknowledged', 'resolved', 'error'];
  const total = alerts.length || 1;
  const barWidth = 260;
  const barHeight = 14;

  let xOffset = 0;
  const segments = order.filter(s => (counts[s] || 0) > 0).map(s => {
    const w = ((counts[s] || 0) / total) * barWidth;
    const seg = { state: s, x: xOffset, w, count: counts[s] || 0 };
    xOffset += w;
    return seg;
  });

  return (
    <div>
      <svg width={barWidth} height={barHeight} style={{ borderRadius: 4, overflow: 'hidden' }}>
        {segments.map(s => (
          <rect key={s.state} x={s.x} y={0} width={s.w} height={barHeight} fill={STATE_COLORS[s.state]} />
        ))}
        {alerts.length === 0 && <rect x={0} y={0} width={barWidth} height={barHeight} fill="#EDF0F5" />}
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {order.filter(s => (counts[s] || 0) > 0).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: STATE_COLORS[s], display: 'inline-block' }} />
            <span style={{ textTransform: 'capitalize' }}>{s}</span>
            <span style={{ fontWeight: 600 }}>{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Alerts by Service mini-table
// ============================================================================

const AlertsByGroup: React.FC<{ alerts: UnifiedAlert[]; groupKey: string }> = ({ alerts, groupKey }) => {
  const groups = countBy(alerts, a => a.labels[groupKey] || 'unknown');
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (sorted.length === 0) return <EuiText size="s" color="subdued">No data</EuiText>;

  const maxCount = sorted[0][1];

  return (
    <div style={{ fontSize: 12 }}>
      {sorted.map(([name, count]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: '#343741' }}>{name}</span>
          <div style={{ flex: 1, height: 8, background: '#EDF0F5', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(count / maxCount) * 100}%`, height: '100%', background: '#006BB4', borderRadius: 4 }} />
          </div>
          <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'right' as const }}>{count}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// AI Briefing — contextual narrative about system state
// ============================================================================

interface BriefingSection {
  icon: string;
  iconColor: string;
  text: string;
}

interface AlertBriefing {
  greeting: string;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  headline: string;
  sections: BriefingSection[];
  nextSteps: ActionStep[];
  generatedAt: string;
}

type ActionStepType = 'investigate' | 'acknowledge' | 'acknowledge_all' | 'silence' | 'runbook' | 'monitor' | 'review_rules';

interface ActionStep {
  id: string;
  type: ActionStepType;
  icon: string;
  iconColor: string;
  label: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** The alert this step relates to, if any */
  alertId?: string;
  /** For bulk actions, the list of alert IDs */
  alertIds?: string[];
  /** External link (e.g. runbook) */
  href?: string;
  /** Whether this step has been completed in-session */
  completed?: boolean;
}

function generateBriefing(alerts: UnifiedAlert[], datasources: Datasource[]): AlertBriefing {
  const now = new Date();
  const hour = now.getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const generatedAt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const total = alerts.length;
  const active = alerts.filter(a => a.state === 'active');
  const pending = alerts.filter(a => a.state === 'pending');
  const critical = alerts.filter(a => a.severity === 'critical');
  const high = alerts.filter(a => a.severity === 'high');

  const sevCounts = countBy(alerts, a => a.severity);
  const stateCounts = countBy(alerts, a => a.state);
  const serviceCounts = countBy(alerts, a => a.labels.service || 'unknown');
  const teamCounts = countBy(alerts, a => a.labels.team || 'unknown');
  const regionCounts = countBy(alerts, a => a.labels.region || 'unknown');

  // Determine overall status
  const overallStatus: AlertBriefing['overallStatus'] =
    critical.length >= 2 ? 'critical' : (critical.length > 0 || high.length >= 2) ? 'degraded' : 'healthy';

  // Build headline
  let headline: string;
  if (total === 0) {
    headline = 'All systems are operating normally. No active alerts across any of your monitored services.';
  } else if (overallStatus === 'critical') {
    headline = `Your system needs immediate attention. There are ${critical.length} critical alert${critical.length > 1 ? 's' : ''} actively firing that require investigation.`;
  } else if (overallStatus === 'degraded') {
    headline = `There are some issues that need your attention. ${active.length} alert${active.length !== 1 ? 's are' : ' is'} currently active across your infrastructure.`;
  } else {
    headline = `Things are mostly stable. ${total} alert${total !== 1 ? 's' : ''} detected, but nothing critical requires immediate action.`;
  }

  const sections: BriefingSection[] = [];
  const recommendations: string[] = [];

  // Critical alerts narrative
  if (critical.length > 0) {
    const critNames = critical.map(a => a.name);
    const critServices = [...new Set(critical.map(a => a.labels.service).filter(Boolean))];
    sections.push({
      icon: 'alert',
      iconColor: 'danger',
      text: `${critical.length} critical alert${critical.length > 1 ? 's' : ''} firing: ${critNames.join(', ')}. ${critServices.length > 0 ? `Affected service${critServices.length > 1 ? 's' : ''}: ${critServices.join(', ')}.` : ''} These started ${describeTimeRange(critical)} and are actively impacting your system.`,
    });
  }

  // High severity narrative
  if (high.length > 0) {
    const highNames = high.map(a => a.name);
    sections.push({
      icon: 'flag',
      iconColor: 'warning',
      text: `${high.length} high-severity alert${high.length > 1 ? 's' : ''}: ${highNames.join(', ')}. These aren't critical yet but could escalate if left unaddressed.`,
    });
  }

  // Pending alerts
  if (pending.length > 0) {
    sections.push({
      icon: 'clock',
      iconColor: 'warning',
      text: `${pending.length} alert${pending.length > 1 ? 's are' : ' is'} in pending state — ${pending.map(a => a.name).join(', ')}. These haven't breached their duration threshold yet but are trending toward firing.`,
    });
  }

  // Service impact analysis
  const impactedServices = Object.entries(serviceCounts).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  if (impactedServices.length > 0) {
    const topService = impactedServices[0];
    const multiService = impactedServices.length > 1;
    sections.push({
      icon: 'apps',
      iconColor: 'primary',
      text: `${impactedServices.length} service${multiService ? 's' : ''} affected. ${topService[0]} has the most alerts (${topService[1]}). ${multiService ? `Other impacted services: ${impactedServices.slice(1, 4).map(([s, c]) => `${s} (${c})`).join(', ')}.` : ''}`,
    });
  }

  // Cross-region analysis
  const activeRegions = Object.entries(regionCounts).filter(([_, c]) => c > 0);
  if (activeRegions.length > 1) {
    sections.push({
      icon: 'globe',
      iconColor: 'subdued',
      text: `Alerts are spread across ${activeRegions.length} regions: ${activeRegions.map(([r, c]) => `${r} (${c})`).join(', ')}. This suggests the issue may not be region-isolated.`,
    });
  } else if (activeRegions.length === 1) {
    sections.push({
      icon: 'globe',
      iconColor: 'subdued',
      text: `All alerts are concentrated in ${activeRegions[0][0]}. Other regions appear unaffected.`,
    });
  }

  // Correlation insights
  const firingCriticalServices = critical.map(a => a.labels.service).filter(Boolean);
  const firingHighServices = high.map(a => a.labels.service).filter(Boolean);
  const overlapping = firingCriticalServices.filter(s => firingHighServices.includes(s));
  if (overlapping.length > 0) {
    sections.push({
      icon: 'link',
      iconColor: 'primary',
      text: `Possible correlation detected: ${overlapping.join(', ')} ${overlapping.length > 1 ? 'have' : 'has'} both critical and high-severity alerts firing simultaneously. These may share a common root cause.`,
    });
  }

  const nextSteps: ActionStep[] = [];
  let stepIdx = 0;

  // Step: Investigate each critical alert
  for (const alert of critical) {
    const runbook = alert.annotations?.runbook_url;
    nextSteps.push({
      id: `step-${stepIdx++}`,
      type: 'investigate',
      icon: 'search',
      iconColor: 'danger',
      label: `Investigate ${alert.name}`,
      description: alert.message || alert.annotations?.summary || `Critical alert on ${alert.labels.service || alert.labels.instance || 'unknown service'} — open details to see AI analysis and root cause.`,
      severity: 'critical',
      alertId: alert.id,
    });
    if (runbook) {
      nextSteps.push({
        id: `step-${stepIdx++}`,
        type: 'runbook',
        icon: 'document',
        iconColor: 'warning',
        label: `Open runbook for ${alert.name}`,
        description: `Follow the documented remediation steps at ${runbook}`,
        severity: 'critical',
        alertId: alert.id,
        href: runbook,
      });
    }
  }

  // Step: Bulk acknowledge active alerts
  const unacked = active.filter(a => a.state === 'active');
  if (unacked.length > 1) {
    nextSteps.push({
      id: `step-${stepIdx++}`,
      type: 'acknowledge_all',
      icon: 'check',
      iconColor: 'primary',
      label: `Acknowledge all ${unacked.length} active alerts`,
      description: 'Stop repeated notifications for all active alerts while you investigate. You can still see them in the table below.',
      severity: 'high',
      alertIds: unacked.map(a => a.id),
    });
  } else if (unacked.length === 1) {
    nextSteps.push({
      id: `step-${stepIdx++}`,
      type: 'acknowledge',
      icon: 'check',
      iconColor: 'primary',
      label: `Acknowledge ${unacked[0].name}`,
      description: 'Mark as acknowledged to stop repeated notifications while you investigate.',
      severity: 'high',
      alertId: unacked[0].id,
    });
  }

  // Step: Investigate high-severity alerts
  for (const alert of high.filter(a => !critical.some(c => c.id === a.id))) {
    nextSteps.push({
      id: `step-${stepIdx++}`,
      type: 'investigate',
      icon: 'inspect',
      iconColor: 'warning',
      label: `Review ${alert.name}`,
      description: alert.message || alert.annotations?.summary || `High-severity alert that could escalate — review details and determine if action is needed.`,
      severity: 'high',
      alertId: alert.id,
    });
  }

  // Step: Monitor pending alerts
  if (pending.length > 0) {
    for (const alert of pending) {
      nextSteps.push({
        id: `step-${stepIdx++}`,
        type: 'monitor',
        icon: 'eye',
        iconColor: 'warning',
        label: `Watch ${alert.name}`,
        description: `Currently pending — hasn't breached its duration threshold yet. If conditions persist, this will fire. Consider preemptive action.`,
        severity: 'medium',
        alertId: alert.id,
      });
    }
  }

  // Step: Silence noisy low-severity alerts
  const lowNoise = alerts.filter(a => (a.severity === 'low' || a.severity === 'info') && a.state === 'active');
  if (lowNoise.length > 0) {
    nextSteps.push({
      id: `step-${stepIdx++}`,
      type: 'silence',
      icon: 'bellSlash',
      iconColor: 'subdued',
      label: `Silence ${lowNoise.length} low-priority alert${lowNoise.length > 1 ? 's' : ''}`,
      description: 'These are informational and may be adding noise. Silence them to focus on what matters.',
      severity: 'low',
      alertIds: lowNoise.map(a => a.id),
    });
  }

  // Step: Review rules if no alerts
  if (total === 0) {
    nextSteps.push({
      id: `step-${stepIdx++}`,
      type: 'review_rules',
      icon: 'gear',
      iconColor: 'primary',
      label: 'Review your alert rules',
      description: 'No alerts is great, but make sure your coverage is adequate. Check the Rules tab to verify your monitors are configured correctly.',
      severity: 'low',
    });
  }

  return {
    greeting: timeGreeting,
    overallStatus,
    headline,
    sections,
    nextSteps,
    generatedAt,
  };
}

function describeTimeRange(alerts: UnifiedAlert[]): string {
  if (alerts.length === 0) return '';
  const times = alerts.map(a => new Date(a.startTime).getTime());
  const earliest = Math.min(...times);
  const ms = Date.now() - earliest;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? 's' : ''} ago`;
}

const STATUS_INDICATOR: Record<string, { color: string; label: string; bg: string }> = {
  healthy: { color: '#017D73', label: 'Systems Healthy', bg: 'rgba(1, 125, 115, 0.06)' },
  degraded: { color: '#F5A700', label: 'Degraded', bg: 'rgba(245, 167, 0, 0.06)' },
  critical: { color: '#BD271E', label: 'Critical Issues', bg: 'rgba(189, 39, 30, 0.06)' },
};

const AiBriefing: React.FC<{
  alerts: UnifiedAlert[];
  datasources: Datasource[];
  loading: boolean;
  onViewDetail: (alert: UnifiedAlert) => void;
  onAcknowledge: (alertId: string) => void;
  onSilence: (alertId: string) => void;
}> = ({
  alerts, datasources, loading, onViewDetail, onAcknowledge, onSilence,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const briefing = useMemo(() => generateBriefing(alerts, datasources), [alerts, datasources]);

  // Simulate AI "thinking" delay
  useEffect(() => {
    if (!loading && alerts.length >= 0) {
      const timer = setTimeout(() => setIsLoading(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [loading, alerts]);

  const alertMap = useMemo(() => new Map(alerts.map(a => [a.id, a])), [alerts]);

  const handleStepAction = (step: ActionStep) => {
    switch (step.type) {
      case 'investigate':
      case 'monitor': {
        const alert = step.alertId ? alertMap.get(step.alertId) : undefined;
        if (alert) onViewDetail(alert);
        break;
      }
      case 'acknowledge': {
        if (step.alertId) {
          onAcknowledge(step.alertId);
          setCompletedSteps(prev => new Set(prev).add(step.id));
        }
        break;
      }
      case 'acknowledge_all': {
        if (step.alertIds) {
          for (const id of step.alertIds) onAcknowledge(id);
          setCompletedSteps(prev => new Set(prev).add(step.id));
        }
        break;
      }
      case 'silence': {
        const ids = step.alertIds || (step.alertId ? [step.alertId] : []);
        for (const id of ids) onSilence(id);
        setCompletedSteps(prev => new Set(prev).add(step.id));
        break;
      }
      case 'runbook': {
        // Open in new tab — also mark as done
        if (step.href) window.open(step.href, '_blank');
        setCompletedSteps(prev => new Set(prev).add(step.id));
        break;
      }
      case 'review_rules':
        // No direct action — just informational
        break;
    }
  };

  const stepButtonLabel = (type: ActionStepType): string => {
    switch (type) {
      case 'investigate': return 'View Details';
      case 'acknowledge': return 'Acknowledge';
      case 'acknowledge_all': return 'Acknowledge All';
      case 'silence': return 'Silence';
      case 'runbook': return 'Open Runbook';
      case 'monitor': return 'View Details';
      case 'review_rules': return 'Go to Rules';
      default: return 'Action';
    }
  };

  const stepButtonIcon = (type: ActionStepType): string => {
    switch (type) {
      case 'investigate': return 'inspect';
      case 'acknowledge': return 'check';
      case 'acknowledge_all': return 'check';
      case 'silence': return 'bellSlash';
      case 'runbook': return 'popout';
      case 'monitor': return 'eye';
      case 'review_rules': return 'gear';
      default: return 'arrowRight';
    }
  };

  const STEP_SEVERITY_BORDER: Record<string, string> = {
    critical: '#BD271E',
    high: '#F5A700',
    medium: '#006BB4',
    low: '#98A2B3',
  };

  if (dismissed) return null;

  const status = STATUS_INDICATOR[briefing.overallStatus];

  return (
    <EuiPanel
      paddingSize="l"
      hasBorder
      style={{
        background: status.bg,
        borderLeft: `4px solid ${status.color}`,
        position: 'relative',
      }}
    >
      {/* Dismiss / collapse controls */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
        <EuiToolTip content={expanded ? 'Collapse briefing' : 'Expand briefing'}>
          <EuiButtonIcon
            iconType={expanded ? 'arrowUp' : 'arrowDown'}
            aria-label="Toggle briefing"
            size="s"
            onClick={() => setExpanded(!expanded)}
          />
        </EuiToolTip>
        <EuiToolTip content="Dismiss briefing">
          <EuiButtonIcon iconType="cross" aria-label="Dismiss" size="s" onClick={() => setDismissed(true)} />
        </EuiToolTip>
      </div>

      {/* Header row */}
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, ${status.color}22, ${status.color}44)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <EuiIcon type="compute" size="l" color={status.color} />
          </div>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="baseline" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs"><h3 style={{ margin: 0 }}>{briefing.greeting}</h3></EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow" style={{ fontSize: 10 }}>AI Briefing</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">Updated {briefing.generatedAt}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} style={{ marginTop: 2 }}>
            <EuiFlexItem grow={false}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: status.color,
                display: 'inline-block', boxShadow: `0 0 6px ${status.color}66`,
              }} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" style={{ color: status.color, fontWeight: 600 }}>{status.label}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <EuiLoadingContent lines={3} />
        </>
      ) : expanded ? (
        <>
          <EuiSpacer size="m" />

          {/* Headline */}
          <EuiText size="s" style={{ lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>{briefing.headline}</p>
          </EuiText>

          {/* Detail sections */}
          {briefing.sections.length > 0 && (
            <>
              <EuiSpacer size="m" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {briefing.sections.map((section, i) => (
                  <EuiFlexGroup key={i} gutterSize="s" responsive={false} alignItems="flexStart">
                    <EuiFlexItem grow={false} style={{ paddingTop: 2 }}>
                      <EuiIcon type={section.icon} size="s" color={section.iconColor} />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs" style={{ lineHeight: 1.5 }}><p style={{ margin: 0 }}>{section.text}</p></EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ))}
              </div>
            </>
          )}

          {/* Actionable Next Steps */}
          {briefing.nextSteps.length > 0 && (
            <>
              <EuiSpacer size="m" />
              <EuiHorizontalRule margin="none" />
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="sparkles" size="s" color="primary" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" style={{ fontWeight: 600 }}>Next steps</EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {completedSteps.size > 0 ? `${completedSteps.size} of ${briefing.nextSteps.length} done` : `${briefing.nextSteps.length} action${briefing.nextSteps.length > 1 ? 's' : ''}`}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {briefing.nextSteps.map((step, i) => {
                  const done = completedSteps.has(step.id);
                  return (
                    <div
                      key={step.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 6,
                        background: done ? 'rgba(1, 125, 115, 0.04)' : 'rgba(255,255,255,0.6)',
                        border: `1px solid ${done ? '#017D7333' : '#D3DAE6'}`,
                        borderLeft: `3px solid ${done ? '#017D73' : STEP_SEVERITY_BORDER[step.severity] || '#D3DAE6'}`,
                        opacity: done ? 0.7 : 1,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {/* Step number / check */}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: done ? '#017D73' : `${STEP_SEVERITY_BORDER[step.severity]}15`,
                        border: `1.5px solid ${done ? '#017D73' : STEP_SEVERITY_BORDER[step.severity] || '#D3DAE6'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 600,
                        color: done ? '#fff' : STEP_SEVERITY_BORDER[step.severity],
                      }}>
                        {done ? '✓' : i + 1}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <EuiIcon type={step.icon} size="s" color={done ? 'success' : step.iconColor} />
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: done ? '#017D73' : '#343741',
                            textDecoration: done ? 'line-through' : 'none',
                          }}>
                            {step.label}
                          </span>
                          <EuiBadge color={
                            step.severity === 'critical' ? 'danger' :
                            step.severity === 'high' ? 'warning' :
                            step.severity === 'medium' ? 'primary' : 'default'
                          } style={{ fontSize: 9 }}>
                            {step.severity}
                          </EuiBadge>
                        </div>
                        <EuiText size="xs" color="subdued" style={{ lineHeight: 1.4 }}>
                          <p style={{ margin: 0 }}>{step.description}</p>
                        </EuiText>
                      </div>
                      {/* Action button */}
                      {!done && (
                        <div style={{ flexShrink: 0, paddingTop: 2 }}>
                          <EuiButtonEmpty
                            size="xs"
                            iconType={stepButtonIcon(step.type)}
                            onClick={() => handleStepAction(step)}
                            color={step.severity === 'critical' ? 'danger' : 'primary'}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            {stepButtonLabel(step.type)}
                          </EuiButtonEmpty>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : null}
    </EuiPanel>
  );
};

// ============================================================================
// Main Dashboard Component
// ============================================================================

export interface AlertsDashboardProps {
  alerts: UnifiedAlert[];
  datasources: Datasource[];
  loading: boolean;
  onViewDetail: (alert: UnifiedAlert) => void;
  onAcknowledge: (alertId: string) => void;
  onSilence: (alertId: string) => void;
}

export const AlertsDashboard: React.FC<AlertsDashboardProps> = ({
  alerts, datasources, loading, onViewDetail, onAcknowledge, onSilence,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('startTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const dsNameMap = useMemo(() => new Map(datasources.map(d => [d.id, d.name])), [datasources]);

  // Severity counts for stat cards
  const severityCounts = useMemo(() => countBy(alerts, a => a.severity), [alerts]);
  const activeCount = useMemo(() => alerts.filter(a => a.state === 'active').length, [alerts]);

  // Filtered + sorted alerts for the table
  const filteredAlerts = useMemo(() => {
    // Build severity filter array
    let sevArr: string[] | undefined;
    if (severityFilter === 'medium') {
      sevArr = ['medium', 'low', 'info'];
    } else if (severityFilter !== 'all') {
      sevArr = [severityFilter];
    }

    const stateArr = stateFilter !== 'all' ? [stateFilter] : undefined;

    const result = filterAlerts(alerts, {
      severity: sevArr,
      state: stateArr,
      search: searchQuery || undefined,
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'startTime') cmp = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'severity') {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        cmp = (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [alerts, searchQuery, severityFilter, stateFilter, sortField, sortDirection]);

  const onTableSort = (col: { field: string; direction: 'asc' | 'desc' }) => {
    setSortField(col.field);
    setSortDirection(col.direction);
  };

  // Table columns
  const columns = [
    {
      field: 'severity', name: 'Sev', width: '60px', sortable: true,
      render: (s: string) => (
        <EuiToolTip content={s}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEVERITY_COLORS[s], display: 'inline-block' }} />
        </EuiToolTip>
      ),
    },
    {
      field: 'name', name: 'Alert', sortable: true, truncateText: true,
      render: (name: string, alert: UnifiedAlert) => (
        <EuiButtonEmpty size="xs" flush="left" onClick={() => onViewDetail(alert)} style={{ fontWeight: 500 }}>
          {name}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'state', name: 'State', width: '120px', sortable: true,
      render: (state: string) => <EuiHealth color={STATE_HEALTH[state] || 'subdued'}>{state}</EuiHealth>,
    },
    {
      field: 'datasourceType', name: 'Source', width: '100px',
      render: (t: string) => <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>,
    },
    {
      field: 'message', name: 'Message', truncateText: true,
      render: (msg: string) => <EuiText size="xs" color="subdued">{msg || '—'}</EuiText>,
    },
    {
      field: 'startTime', name: 'Started', width: '150px', sortable: true,
      render: (ts: string) => <EuiText size="xs">{ts ? new Date(ts).toLocaleString() : '—'}</EuiText>,
    },
    {
      name: 'Actions', width: '120px',
      render: (alert: UnifiedAlert) => (
        <EuiFlexGroup gutterSize="xs" responsive={false} wrap={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiToolTip content="View details">
              <EuiButtonIcon iconType="inspect" aria-label="View" size="s" onClick={() => onViewDetail(alert)} />
            </EuiToolTip>
          </EuiFlexItem>
          {alert.state === 'active' && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Acknowledge">
                <EuiButtonIcon iconType="check" aria-label="Acknowledge" size="s" color="primary" onClick={() => onAcknowledge(alert.id)} />
              </EuiToolTip>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Silence">
              <EuiButtonIcon iconType="bellSlash" aria-label="Silence" size="s" onClick={() => onSilence(alert.id)} />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  if (!loading && alerts.length === 0) {
    return (
      <div>
        <AiBriefing
          alerts={alerts}
          datasources={datasources}
          loading={loading}
          onViewDetail={onViewDetail}
          onAcknowledge={onAcknowledge}
          onSilence={onSilence}
        />
        <EuiSpacer size="l" />
        <EuiEmptyPrompt title={<h2>No Active Alerts</h2>} body={<p>All systems operating normally.</p>} iconType="checkInCircleFilled" iconColor="success" />
      </div>
    );
  }

  return (
    <div>
      {/* ---- AI Briefing ---- */}
      <AiBriefing
        alerts={alerts}
        datasources={datasources}
        loading={loading}
        onViewDetail={onViewDetail}
        onAcknowledge={onAcknowledge}
        onSilence={onSilence}
      />
      <EuiSpacer size="m" />

      {/* ---- Summary Stat Cards ---- */}
      <EuiFlexGroup gutterSize="m" responsive={true}>
        <EuiFlexItem>
          <EuiPanel
            paddingSize="m" hasBorder
            onClick={() => { setSeverityFilter('all'); setStateFilter('all'); }}
            style={{ cursor: 'pointer', outline: severityFilter === 'all' && stateFilter === 'all' ? '2px solid #006BB4' : 'none', borderRadius: 6 }}
          >
            <EuiStat title={alerts.length} description="Total Alerts" titleSize="m" />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel
            paddingSize="m" hasBorder
            onClick={() => { setSeverityFilter('all'); setStateFilter(stateFilter === 'active' ? 'all' : 'active'); }}
            style={{ cursor: 'pointer', outline: stateFilter === 'active' ? '2px solid #BD271E' : 'none', borderRadius: 6 }}
          >
            <EuiStat title={activeCount} description="Active" titleColor="danger" titleSize="m" />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel
            paddingSize="m" hasBorder
            onClick={() => { setStateFilter('all'); setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical'); }}
            style={{ cursor: 'pointer', outline: severityFilter === 'critical' ? '2px solid #BD271E' : 'none', borderRadius: 6 }}
          >
            <EuiStat title={severityCounts['critical'] || 0} description="Critical" titleColor="danger" titleSize="m" />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel
            paddingSize="m" hasBorder
            onClick={() => { setStateFilter('all'); setSeverityFilter(severityFilter === 'high' ? 'all' : 'high'); }}
            style={{ cursor: 'pointer', outline: severityFilter === 'high' ? '2px solid #F5A700' : 'none', borderRadius: 6 }}
          >
            <EuiStat title={severityCounts['high'] || 0} description="High" titleColor="default" titleSize="m" />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel
            paddingSize="m" hasBorder
            onClick={() => { setStateFilter('all'); setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium'); }}
            style={{ cursor: 'pointer', outline: severityFilter === 'medium' ? '2px solid #006BB4' : 'none', borderRadius: 6 }}
          >
            <EuiStat title={(severityCounts['medium'] || 0) + (severityCounts['low'] || 0) + (severityCounts['info'] || 0)} description="Medium / Low" titleSize="m" />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* ---- Visualization Row ---- */}
      <EuiFlexGroup gutterSize="m" responsive={true}>
        {/* Timeline */}
        <EuiFlexItem grow={3}>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xxs"><h3>Alert Timeline (24h)</h3></EuiTitle>
            <EuiSpacer size="s" />
            <AlertTimeline alerts={alerts} />
          </EuiPanel>
        </EuiFlexItem>
        {/* Severity Donut */}
        <EuiFlexItem grow={1}>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xxs"><h3>By Severity</h3></EuiTitle>
            <EuiSpacer size="s" />
            <SeverityDonut alerts={alerts} />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* ---- State + Service Row ---- */}
      <EuiFlexGroup gutterSize="m" responsive={true}>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xxs"><h3>By State</h3></EuiTitle>
            <EuiSpacer size="s" />
            <StateBreakdown alerts={alerts} />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xxs"><h3>By Service</h3></EuiTitle>
            <EuiSpacer size="s" />
            <AlertsByGroup alerts={alerts} groupKey="service" />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xxs"><h3>By Team</h3></EuiTitle>
            <EuiSpacer size="s" />
            <AlertsByGroup alerts={alerts} groupKey="team" />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* ---- Filters + Table ---- */}
      <EuiTitle size="xs"><h3>All Alerts</h3></EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
        <EuiFlexItem grow={3}>
          <EuiFieldSearch
            placeholder="Search alerts by name, message, or label..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            compressed
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            compressed
            prepend="Severity"
            options={[
              { value: 'all', text: 'All' },
              { value: 'critical', text: 'Critical' },
              { value: 'high', text: 'High' },
              { value: 'medium', text: 'Medium' },
              { value: 'low', text: 'Low' },
            ]}
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            compressed
            prepend="State"
            options={[
              { value: 'all', text: 'All' },
              { value: 'active', text: 'Active' },
              { value: 'pending', text: 'Pending' },
              { value: 'acknowledged', text: 'Acknowledged' },
              { value: 'resolved', text: 'Resolved' },
            ]}
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiBasicTable
        items={filteredAlerts}
        columns={columns}
        loading={loading}
        sorting={{
          sort: { field: sortField as any, direction: sortDirection },
        }}
        onChange={({ sort }: any) => { if (sort) onTableSort(sort); }}
        noItemsMessage={searchQuery || severityFilter !== 'all' || stateFilter !== 'all' ? 'No alerts match your filters' : 'No alerts'}
      />
    </div>
  );
};

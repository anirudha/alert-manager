/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO Summary Cards — stat cards for the SLO listing page.
 * Each card is clickable to filter the SLO table by status.
 */
import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiStat, EuiText } from '@elastic/eui';

// ============================================================================
// Types
// ============================================================================

export interface SloSummaryCardsProps {
  totalCount: number;
  statusCounts: Record<string, number>;
  statFilter: string | null;
  onStatFilterChange: (filter: string | null) => void;
}

// ============================================================================
// Helpers
// ============================================================================

const STAT_CARD_BORDER_COLORS: Record<string, string> = {
  all: '#006BB4',
  breached: '#BD271E',
  warning: '#F5A700',
  ok: '#017D73',
  no_data: '#98A2B3',
};

function handleKeyDown(e: React.KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
}

// ============================================================================
// SloSummaryCards
// ============================================================================

export const SloSummaryCards: React.FC<SloSummaryCardsProps> = ({
  totalCount,
  statusCounts,
  statFilter,
  onStatFilterChange,
}) => {
  const isActive = (key: string) =>
    key === 'all' ? !statFilter || statFilter === 'all' : statFilter === key;

  const cardStyle = (key: string) => ({
    cursor: 'pointer' as const,
    boxShadow: isActive(key) ? `inset 0 0 0 2px ${STAT_CARD_BORDER_COLORS[key]}` : 'none',
    backgroundColor: isActive(key) ? '#E6F0FF' : undefined,
    borderRadius: 6,
  });

  const handleClick = (key: string) => {
    onStatFilterChange(statFilter === key ? null : key);
  };

  return (
    <EuiFlexGroup gutterSize="m" responsive={true} data-test-subj="sloSummaryCards">
      {/* Total */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={() => handleClick('all')}
          tabIndex={0}
          role="button"
          aria-label="Filter by all SLOs"
          onKeyDown={handleKeyDown}
          style={cardStyle('all')}
          data-test-subj="sloStatCardTotal"
        >
          <EuiStat title={totalCount} description="Total SLOs" titleSize="m" />
        </EuiPanel>
      </EuiFlexItem>

      {/* Breached */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={() => handleClick('breached')}
          tabIndex={0}
          role="button"
          aria-label="Filter by breached SLOs"
          onKeyDown={handleKeyDown}
          style={cardStyle('breached')}
          data-test-subj="sloStatCardBreached"
        >
          <EuiStat
            title={statusCounts.breached || 0}
            description="Breached"
            titleColor="danger"
            titleSize="m"
          />
          {statFilter === 'breached' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      {/* Warning */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={() => handleClick('warning')}
          tabIndex={0}
          role="button"
          aria-label="Filter by warning SLOs"
          onKeyDown={handleKeyDown}
          style={cardStyle('warning')}
          data-test-subj="sloStatCardWarning"
        >
          <EuiStat title={statusCounts.warning || 0} description="Warning" titleSize="m" />
          {statFilter === 'warning' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      {/* Ok */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={() => handleClick('ok')}
          tabIndex={0}
          role="button"
          aria-label="Filter by healthy SLOs"
          onKeyDown={handleKeyDown}
          style={cardStyle('ok')}
          data-test-subj="sloStatCardOk"
        >
          <EuiStat title={statusCounts.ok || 0} description="Ok" titleSize="m" />
          {statFilter === 'ok' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      {/* No Data */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={() => handleClick('no_data')}
          tabIndex={0}
          role="button"
          aria-label="Filter by SLOs with no data"
          onKeyDown={handleKeyDown}
          style={cardStyle('no_data')}
          data-test-subj="sloStatCardNoData"
        >
          <EuiStat
            title={statusCounts.no_data || 0}
            description="No Data"
            titleColor="subdued"
            titleSize="m"
          />
          {statFilter === 'no_data' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

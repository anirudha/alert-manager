/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight mock of @elastic/eui components for unit tests.
 * Renders minimal HTML with data-test-subj forwarded for selector-based testing.
 */
import React from 'react';

type Props = Record<string, unknown> & { children?: React.ReactNode; 'data-test-subj'?: string };

const stub =
  (name: string): React.FC<Props> =>
  ({ children, 'data-test-subj': testSubj, ...rest }) => (
    <div data-eui={name} data-test-subj={testSubj}>
      {children}
    </div>
  );

export const EuiPage = stub('EuiPage');
export const EuiPageBody = stub('EuiPageBody');
export const EuiPageHeader = stub('EuiPageHeader');
export const EuiPageHeaderSection = stub('EuiPageHeaderSection');
export const EuiTitle = stub('EuiTitle');
export const EuiSpacer = stub('EuiSpacer');
export const EuiTabs = stub('EuiTabs');

export const EuiTab: React.FC<Props & { isSelected?: boolean; onClick?: () => void }> = ({
  children,
  isSelected,
  onClick,
  'data-test-subj': testSubj,
}) => (
  <button
    data-eui="EuiTab"
    data-test-subj={testSubj}
    data-selected={isSelected}
    onClick={onClick}
    role="tab"
    aria-selected={isSelected}
  >
    {children}
  </button>
);

export const EuiBasicTable: React.FC<
  Props & { items?: unknown[]; columns?: unknown[]; loading?: boolean }
> = ({ items = [], 'data-test-subj': testSubj, loading }) => (
  <table data-eui="EuiBasicTable" data-test-subj={testSubj} data-loading={loading}>
    <tbody>
      {(items as Array<{ id?: string; name?: string }>).map((item, i) => (
        <tr key={item.id ?? i}>
          <td>{item.name ?? JSON.stringify(item)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const EuiEmptyPrompt: React.FC<
  Props & { title?: React.ReactNode; body?: React.ReactNode }
> = ({ title, body, 'data-test-subj': testSubj }) => (
  <div data-eui="EuiEmptyPrompt" data-test-subj={testSubj}>
    {title}
    {body}
  </div>
);

export const EuiHealth: React.FC<Props & { color?: string }> = ({ children }) => (
  <span data-eui="EuiHealth">{children}</span>
);

export const EuiBadge: React.FC<Props & { color?: string }> = ({ children }) => (
  <span data-eui="EuiBadge">{children}</span>
);

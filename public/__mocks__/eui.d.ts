/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type declarations for @elastic/eui when running outside the OSD tree.
 * In production (inside OSD), the real @elastic/eui types are used.
 */
declare module '@elastic/eui' {
  import { FC, ReactNode } from 'react';

  type EuiProps = Record<string, unknown> & {
    children?: ReactNode;
    'data-test-subj'?: string;
  };

  export const EuiPage: FC<EuiProps & { restrictWidth?: string }>;
  export const EuiPageBody: FC<EuiProps & { component?: string }>;
  export const EuiPageHeader: FC<EuiProps>;
  export const EuiPageHeaderSection: FC<EuiProps>;
  export const EuiTitle: FC<EuiProps & { size?: string }>;
  export const EuiSpacer: FC<EuiProps & { size?: string }>;
  export const EuiTabs: FC<EuiProps>;
  export const EuiTab: FC<EuiProps & { isSelected?: boolean; onClick?: () => void }>;
  export const EuiBasicTable: FC<
    EuiProps & { items?: unknown[]; columns?: unknown[]; loading?: boolean }
  >;
  export const EuiEmptyPrompt: FC<EuiProps & { title?: ReactNode; body?: ReactNode }>;
  export const EuiHealth: FC<EuiProps & { color?: string }>;
  export const EuiBadge: FC<EuiProps & { color?: string }>;
}

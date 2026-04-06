/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight mock of @elastic/eui and @opensearch-project/oui for unit tests.
 * Uses a Proxy to auto-stub any EUI component as a simple div/button.
 * Named exports like EuiTab get special treatment for role-based queries.
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

// Specific components that need special HTML for role-based test queries
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
      {(items as any[]).map((item, i) => (
        <tr key={item?.id ?? i}>
          <td>{item?.name ?? ''}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

// All common EUI components as stubs
export const EuiPage = stub('EuiPage');
export const EuiPageBody = stub('EuiPageBody');
export const EuiPageHeader = stub('EuiPageHeader');
export const EuiPageHeaderSection = stub('EuiPageHeaderSection');
export const EuiTitle = stub('EuiTitle');
export const EuiSpacer = stub('EuiSpacer');
export const EuiTabs = stub('EuiTabs');
export const EuiEmptyPrompt = stub('EuiEmptyPrompt');
export const EuiHealth = stub('EuiHealth');
export const EuiBadge = stub('EuiBadge');
export const EuiButton = stub('EuiButton');
export const EuiButtonEmpty = stub('EuiButtonEmpty');
export const EuiButtonIcon = stub('EuiButtonIcon');
export const EuiFlexGroup = stub('EuiFlexGroup');
export const EuiFlexItem = stub('EuiFlexItem');
export const EuiPanel = stub('EuiPanel');
export const EuiText = stub('EuiText');
export const EuiCallOut = stub('EuiCallOut');
export const EuiComboBox = stub('EuiComboBox');
export const EuiFieldSearch = stub('EuiFieldSearch');
export const EuiFieldText = stub('EuiFieldText');
export const EuiFieldNumber = stub('EuiFieldNumber');
export const EuiSelect = stub('EuiSelect');
export const EuiCheckbox = stub('EuiCheckbox');
export const EuiCheckboxGroup = stub('EuiCheckboxGroup');
export const EuiRadioGroup = stub('EuiRadioGroup');
export const EuiSwitch = stub('EuiSwitch');
export const EuiFormRow = stub('EuiFormRow');
export const EuiAccordion = stub('EuiAccordion');
export const EuiFlyout = stub('EuiFlyout');
export const EuiFlyoutHeader = stub('EuiFlyoutHeader');
export const EuiFlyoutBody = stub('EuiFlyoutBody');
export const EuiFlyoutFooter = stub('EuiFlyoutFooter');
export const EuiPopover = stub('EuiPopover');
export const EuiContextMenuPanel = stub('EuiContextMenuPanel');
export const EuiContextMenuItem = stub('EuiContextMenuItem');
export const EuiConfirmModal = stub('EuiConfirmModal');
export const EuiModal = stub('EuiModal');
export const EuiModalHeader = stub('EuiModalHeader');
export const EuiModalBody = stub('EuiModalBody');
export const EuiModalFooter = stub('EuiModalFooter');
export const EuiToolTip = stub('EuiToolTip');
export const EuiIconTip = stub('EuiIconTip');
export const EuiIcon = stub('EuiIcon');
export const EuiStat = stub('EuiStat');
export const EuiCodeBlock = stub('EuiCodeBlock');
export const EuiDescriptionList = stub('EuiDescriptionList');
export const EuiHorizontalRule = stub('EuiHorizontalRule');
export const EuiLoadingSpinner = stub('EuiLoadingSpinner');
export const EuiLoadingContent = stub('EuiLoadingContent');
export const EuiGlobalToastList = stub('EuiGlobalToastList');
export const EuiFilterGroup = stub('EuiFilterGroup');
export const EuiFilterButton = stub('EuiFilterButton');
export const EuiResizableContainer = ({ children }: any) => {
  // EuiResizableContainer passes a render function; call it with a stub Panel
  if (typeof children === 'function') {
    const PanelStub: any = ({ children: c, ...rest }: any) => (
      <div data-eui="EuiResizablePanel" {...rest}>
        {c}
      </div>
    );
    return <div data-eui="EuiResizableContainer">{children(PanelStub, () => {})}</div>;
  }
  return <div data-eui="EuiResizableContainer">{children}</div>;
};
export const EuiLink = stub('EuiLink');
export const EuiTextArea = stub('EuiTextArea');
export const EuiDatePicker = stub('EuiDatePicker');
export const EuiSuperDatePicker = stub('EuiSuperDatePicker');
export const EuiStep = stub('EuiStep');
export const EuiSteps = stub('EuiSteps');
export const EuiProgress = stub('EuiProgress');
export const EuiRange = stub('EuiRange');
export const EuiTextColor = stub('EuiTextColor');
export const EuiCopy = stub('EuiCopy');
export const EuiOverlayMask = stub('EuiOverlayMask');

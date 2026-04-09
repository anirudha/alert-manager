/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO Template Selector — horizontal row of compact cards for one-click
 * SLO template selection in the Create SLO wizard.
 *
 * When a template is selected, all relevant SLI fields (metric, SLI type,
 * label names, filters) are pre-filled, reducing the form to just service
 * name and operation name.
 *
 * If the user has already modified fields, a confirmation is shown before
 * overwriting them.
 */
import React, { useState, useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiIcon,
  EuiConfirmModal,
  EuiText,
  EuiTitle,
  EuiSpacer,
} from '@elastic/eui';
import { SLO_TEMPLATES } from '../../common/slo_templates';
import type { SloTemplate } from '../../common/slo_templates';

// ============================================================================
// Props
// ============================================================================

export interface SloTemplateSelectorProps {
  /** Currently selected template ID, or null if none selected. */
  selectedId: string | null;
  /** Callback when the user selects a template. */
  onSelect: (template: SloTemplate) => void;
  /** Set of field names that the user has manually modified. */
  userModifiedFields: ReadonlySet<string>;
}

// ============================================================================
// Component
// ============================================================================

export const SloTemplateSelector: React.FC<SloTemplateSelectorProps> = ({
  selectedId,
  onSelect,
  userModifiedFields,
}) => {
  const [pendingTemplate, setPendingTemplate] = useState<SloTemplate | null>(null);

  const handleCardClick = useCallback(
    (template: SloTemplate) => {
      // If the user has modified any fields, show a confirmation dialog
      if (userModifiedFields.size > 0 && template.id !== selectedId) {
        setPendingTemplate(template);
      } else {
        onSelect(template);
      }
    },
    [onSelect, userModifiedFields, selectedId]
  );

  const handleConfirm = useCallback(() => {
    if (pendingTemplate) {
      onSelect(pendingTemplate);
      setPendingTemplate(null);
    }
  }, [pendingTemplate, onSelect]);

  const handleCancel = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  return (
    <>
      <EuiTitle size="xxs">
        <h3>Start from a template</h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        Pre-fills metric, SLI type, label names, and filters. You can customize any field after
        selecting.
      </EuiText>
      <EuiSpacer size="s" />

      <EuiFlexGroup gutterSize="s" responsive wrap role="group" aria-label="SLO template selector">
        {SLO_TEMPLATES.map((template) => (
          <EuiFlexItem key={template.id} grow={false} style={{ minWidth: 140, maxWidth: 180 }}>
            <EuiCard
              layout="horizontal"
              icon={<EuiIcon type={template.icon} size="m" />}
              title={template.name}
              titleSize="xs"
              paddingSize="s"
              description=""
              selectable={{
                onClick: () => handleCardClick(template),
                isSelected: template.id === selectedId,
              }}
              aria-label={`Select ${template.name} template`}
            >
              <EuiText size="xs" color="subdued" style={{ marginTop: 2 }}>
                {template.description.split('.')[0]}.
              </EuiText>
            </EuiCard>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>

      {pendingTemplate && (
        <EuiConfirmModal
          title="Apply template?"
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          cancelButtonText="Cancel"
          confirmButtonText="Apply template"
          buttonColor="primary"
        >
          <p>
            Applying the <strong>{pendingTemplate.name}</strong> template will overwrite your
            current SLI field values. This cannot be undone.
          </p>
        </EuiConfirmModal>
      )}
    </>
  );
};

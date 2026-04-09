/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared table pagination component — used by AlertsDashboard, MonitorsTable, and SloListing.
 * Provides page-size selector, prev/next arrows, and numbered page buttons.
 */
import React, { useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiPopover,
  EuiContextMenuPanel,
  EuiContextMenuItem,
} from '@opensearch-project/oui';
import './table_pagination.css';

interface TablePaginationProps {
  pageIndex: number;
  pageSize: number;
  totalItemCount: number;
  pageSizeOptions: number[];
  onChangePage: (page: number) => void;
  onChangePageSize: (size: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  pageIndex,
  pageSize,
  totalItemCount,
  pageSizeOptions,
  onChangePage,
  onChangePageSize,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const pageCount = Math.max(1, Math.ceil(totalItemCount / pageSize));

  const maxVisible = 5;
  const half = Math.floor(maxVisible / 2);
  let startPage = Math.max(0, Math.min(pageIndex - half, pageCount - maxVisible));
  const endPage = Math.min(pageCount, startPage + maxVisible);
  if (endPage - startPage < maxVisible) startPage = Math.max(0, endPage - maxVisible);
  const pages: number[] = [];
  for (let i = startPage; i < endPage; i++) pages.push(i);

  return (
    <>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiPopover
            button={
              <EuiButtonEmpty
                size="xs"
                color="text"
                iconType="arrowDown"
                iconSide="right"
                onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                data-test-subj="alertManager-pagination-rowsPerPage"
              >
                Rows per page: {pageSize}
              </EuiButtonEmpty>
            }
            isOpen={isPopoverOpen}
            closePopover={() => setIsPopoverOpen(false)}
            panelPaddingSize="none"
            anchorPosition="upCenter"
          >
            <EuiContextMenuPanel
              items={pageSizeOptions.map((size) => (
                <EuiContextMenuItem
                  key={size}
                  icon={size === pageSize ? 'check' : 'empty'}
                  onClick={() => {
                    onChangePageSize(size);
                    onChangePage(0);
                    setIsPopoverOpen(false);
                  }}
                >
                  {size} rows
                </EuiContextMenuItem>
              ))}
            />
          </EuiPopover>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="arrowLeft"
                aria-label="Previous page"
                onClick={() => onChangePage(pageIndex - 1)}
                isDisabled={pageIndex === 0}
                size="s"
                color="text"
                data-test-subj="alertManager-pagination-prev"
              />
            </EuiFlexItem>
            {pages.map((p) => (
              <EuiFlexItem grow={false} key={p}>
                <button
                  onClick={() => onChangePage(p)}
                  disabled={p === pageIndex}
                  aria-label={`Page ${p + 1} of ${pageCount}`}
                  aria-current={p === pageIndex ? 'page' : undefined}
                  className={`alertMgr-pageBtn${
                    p === pageIndex ? ' alertMgr-pageBtn--active' : ''
                  }`}
                  data-test-subj={`alertManager-pagination-page-${p + 1}`}
                >
                  {p + 1}
                </button>
              </EuiFlexItem>
            ))}
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="arrowRight"
                aria-label="Next page"
                onClick={() => onChangePage(pageIndex + 1)}
                isDisabled={pageIndex >= pageCount - 1}
                size="s"
                color="text"
                data-test-subj="alertManager-pagination-next"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

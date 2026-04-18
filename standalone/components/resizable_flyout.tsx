/**
 * ResizableFlyout — wraps EuiFlyout with a draggable left-edge handle
 * so users can resize the flyout width. Keeps the original EuiFlyout
 * size as the default until the user starts dragging.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { EuiFlyout } from '@opensearch-project/oui';

const MIN_WIDTH = 320;
const MAX_WIDTH_RATIO = 0.9; // 90% of viewport

export interface ResizableFlyoutProps
  extends Omit<React.ComponentProps<typeof EuiFlyout>, 'style'> {
  children: React.ReactNode;
}

export const ResizableFlyout: React.FC<ResizableFlyoutProps> = ({
  size = 'm',
  children,
  onClose,
  ownFocus = false,
  ...rest
}) => {
  // null = user hasn't dragged yet, use the original EuiFlyout size token
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      // Measure the actual rendered width of the flyout
      const flyoutEl = (e.currentTarget as HTMLElement).closest('.euiFlyout');
      startWidth.current = flyoutEl ? flyoutEl.getBoundingClientRect().width : customWidth ?? 600;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [customWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
      const delta = startX.current - e.clientX; // dragging left = wider
      const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth.current + delta));
      setCustomWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // When user hasn't dragged, pass the original size token through.
  // Once they drag, switch to pixel-based width.
  const flyoutSize = customWidth !== null ? customWidth : size;

  return (
    <EuiFlyout
      onClose={onClose}
      size={flyoutSize as any}
      ownFocus={ownFocus}
      maskProps={ownFocus ? undefined : { style: { pointerEvents: 'none', background: 'transparent' } }}
      hideCloseButton={false}
      {...rest}
    >
      {/* Drag handle on the left edge */}
      <div
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize flyout"
        tabIndex={0}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 6,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,107,180,0.15)';
        }}
        onMouseLeave={(e) => {
          if (!isDragging.current) {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }
        }}
      />
      {children}
    </EuiFlyout>
  );
};

import React, { useState, useRef } from 'react';

interface ResizableLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSplit?: number; // e.g. 72%
  minLeftWidth?: number;
  minRightWidth?: number;
}

export const ResizableLayout: React.FC<ResizableLayoutProps> = ({
  left,
  right,
  defaultSplit = 72,
  minLeftWidth = 180,
  minRightWidth = 160
}) => {
  const [split, setSplit] = useState<number>(() => {
    const saved = localStorage.getItem('occ_split');
    return saved ? parseFloat(saved) : defaultSplit;
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const totalWidth = rect.width;
    if (totalWidth <= 0) return;

    const effectiveMinLeft = Math.min(minLeftWidth, Math.max(120, Math.floor(totalWidth * 0.2)));
    const effectiveMinRight = Math.min(minRightWidth, Math.max(120, Math.floor(totalWidth * 0.2)));

    if (currentX < effectiveMinLeft || totalWidth - currentX < effectiveMinRight) {
      return;
    }

    const newPercent = (currentX / totalWidth) * 100;
    const clamped = Math.min(Math.max(newPercent, 25), 85);
    setSplit(clamped);
    localStorage.setItem('occ_split', clamped.toFixed(1));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
  };

  return (
    <div className="workspace-container" ref={containerRef}>
      <div
        className="editor-pane"
        style={{
          width: `${split}%`,
          pointerEvents: isDragging ? 'none' : 'auto',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        {left}
      </div>
      <div
        className={`divider-drag-bar ${isDragging ? 'dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Drag to resize Editor / Output"
      />
      <div
        className="output-pane"
        style={{
          width: `${100 - split}%`,
          pointerEvents: isDragging ? 'none' : 'auto',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        {right}
      </div>
    </div>
  );
};

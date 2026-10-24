"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: React.ReactNode;
  peekHeight?: number;
}

export function BottomSheet({
  open,
  onOpenChange,
  expanded,
  onExpandedChange,
  children,
  peekHeight = 180,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startTranslate = useRef(0);
  const [translate, setTranslate] = useState(0);
  const [dragging, setDragging] = useState(false);

  const expandedHeight =
    typeof window !== "undefined" ? window.innerHeight * 0.65 : 500;

  useEffect(() => {
    setTranslate(0);
  }, [expanded]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startY.current = touch.clientY;
    startTranslate.current = 0;
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startY.current;
      setTranslate(Math.max(-expandedHeight + peekHeight, dy));
    },
    [dragging, expandedHeight, peekHeight],
  );

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    const threshold = 40;
    if (expanded) {
      if (translate > threshold) {
        onExpandedChange(false);
      } else if (translate > expandedHeight * 0.4) {
        onOpenChange(false);
      }
    } else {
      if (translate < -threshold) {
        onExpandedChange(true);
      } else if (translate > threshold) {
        onOpenChange(false);
      }
    }
    setTranslate(0);
  }, [
    expanded,
    translate,
    expandedHeight,
    peekHeight,
    onExpandedChange,
    onOpenChange,
  ]);

  if (!open) return null;

  const currentHeight = expanded ? expandedHeight : peekHeight;
  const visualTranslate = dragging ? translate : 0;

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface rounded-t-[16px] shadow-elevated safe-bottom"
      style={{
        height: currentHeight,
        transform: `translateY(${Math.max(0, visualTranslate)}px)`,
        transition: dragging
          ? "none"
          : "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Handle */}
      <div
        className="flex items-center justify-center h-8 cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => {
          // Desktop drag
          const mouseStartY = e.clientY;
          const onMove = (me: MouseEvent) => {
            const dy = me.clientY - mouseStartY;
            setTranslate(dy);
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            handleTouchEnd();
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
          setDragging(true);
        }}
      >
        <div className="bottom-sheet-handle" />
      </div>

      {/* Content */}
      <div className="overflow-y-auto overflow-x-hidden h-[calc(100%-2rem)]">
        {children}
      </div>
    </div>
  );
}

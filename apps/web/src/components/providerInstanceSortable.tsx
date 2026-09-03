import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HTMLAttributes, ReactNode } from "react";

import { animatePinnedLayoutChanges } from "./Sidebar.logic";
import type { ProviderInstanceId } from "@t3tools/contracts";
import { cn } from "../lib/utils";

export function useProviderInstanceDndSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
}

export function providerInstanceIdsFromDragEnd(
  event: DragEndEvent,
): { fromId: ProviderInstanceId; toId: ProviderInstanceId } | null {
  const overId = event.over?.id;
  if (overId === undefined || event.active.id === overId) {
    return null;
  }
  return {
    fromId: String(event.active.id) as ProviderInstanceId,
    toId: String(overId) as ProviderInstanceId,
  };
}

export function SortableProviderInstanceItem({
  id,
  disabled = false,
  className,
  children,
  ...rest
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "id" | "children" | "className">) {
  const { setNodeRef, transform, transition, listeners, isDragging } = useSortable({
    id,
    disabled,
    animateLayoutChanges: animatePinnedLayoutChanges,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(className, isDragging && "z-20 opacity-80")}
      {...rest}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  );
}

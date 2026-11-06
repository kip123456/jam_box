import {
  Group,
  Panel,
  Separator,
  usePanelRef,
  type GroupProps,
  type PanelImperativeHandle,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

/** 基于 react-resizable-panels v4 API 的 shadcn 风格封装 */
function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}

function ResizablePanel({ className, ...props }: PanelProps) {
  return <Panel className={cn("h-full", className)} {...props} />;
}

function ResizableHandle({ className, children, ...props }: SeparatorProps) {
  return (
    <Separator
      className={cn("group flex w-2 shrink-0 items-stretch justify-center outline-none", className)}
      {...props}
    >
      {children ?? (
        <div className="w-px bg-border transition-colors group-hover:bg-primary/60" />
      )}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, usePanelRef };
export type { PanelImperativeHandle };

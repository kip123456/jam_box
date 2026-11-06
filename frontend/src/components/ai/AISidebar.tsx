import { PanelRightClose, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ComposeTab from "./ComposeTab";
import AskTab from "./AskTab";
import FixTab from "./FixTab";

/** 右侧 AI 面板：编曲 / 问答 / 修错 三个标签页，可通过 onCollapse 收起 */
export default function AISidebar({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex h-full w-full flex-col border-l bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          AI 助手
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCollapse}
          title="收起 AI 面板"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>
      <Tabs defaultValue="compose" className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        <TabsList className="mt-2 grid w-full shrink-0 grid-cols-3">
          <TabsTrigger value="compose">编曲</TabsTrigger>
          <TabsTrigger value="ask">问答</TabsTrigger>
          <TabsTrigger value="fix">修错</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-2 min-h-0 flex-1">
          <ComposeTab />
        </TabsContent>
        <TabsContent value="ask" className="mt-0 min-h-0 flex-1 pt-2">
          <AskTab />
        </TabsContent>
        <TabsContent value="fix" className="min-h-0 flex-1">
          <FixTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

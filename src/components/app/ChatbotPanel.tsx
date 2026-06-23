import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatbotPanel() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-start border-l border-border bg-card/40 w-10">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open chatbot"
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="mt-2 h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex w-80 shrink-0 flex-col border-l border-border bg-card/40",
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Money Assistant
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collapse chatbot"
          onClick={() => setOpen(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        <div className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">
          <p className="font-medium text-foreground mb-2">Coming in Phase 6</p>
          <p>
            Ask things like &ldquo;How much did we spend this month?&rdquo;, &ldquo;Show
            category-wise expenses for June&rdquo;, or &ldquo;Which recurring payments are
            unpaid?&rdquo;
          </p>
          <p className="mt-3 text-xs">
            The chatbot will run as a secure server function and only see your active family&rsquo;s
            data.
          </p>
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>Chat input arrives in Phase 6</span>
        </div>
      </div>
    </aside>
  );
}

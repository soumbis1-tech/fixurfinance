import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, ChevronRight, ChevronLeft, Sparkles, Send, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { askMoneyAssistant } from "@/lib/chatbot.functions";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const SUGGESTIONS = [
  "How much did we spend this month?",
  "Top 3 categories last 30 days?",
  "Any pending reimbursements?",
  "Who spent the most last week?",
];

export function ChatbotPanel() {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const { activeFamily } = useActiveFamily();
  const { user } = useAuth();
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const ask = useServerFn(askMoneyAssistant);

  const messages = useQuery({
    enabled: !!activeFamily?.id && !!user?.id,
    queryKey: ["chat_messages", activeFamily?.id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("family_id", activeFamily!.id)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async (question: string) => {
      if (!activeFamily?.id) throw new Error("No family");
      return ask({ data: { familyId: activeFamily.id, question } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_messages"] });
      setInput("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearChat = useMutation({
    mutationFn: async () => {
      if (!activeFamily?.id || !user?.id) return;
      await supabase.from("chat_messages").delete()
        .eq("family_id", activeFamily.id).eq("user_id", user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_messages"] }),
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.data, send.isPending]);

  if (!open) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-start border-l border-border bg-card/40 w-10">
        <Button variant="ghost" size="icon" aria-label="Open chatbot" className="mt-3" onClick={() => setOpen(true)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="mt-2 h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  function submit(q: string) {
    const text = q.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  }

  return (
    <aside className={cn("hidden lg:flex w-80 shrink-0 flex-col border-l border-border bg-card/40")}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Money Assistant
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Clear" onClick={() => clearChat.mutate()}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Collapse chatbot" onClick={() => setOpen(false)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {(messages.data?.length ?? 0) === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Ask anything about your family's expenses.</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="block w-full text-left rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.data?.map((m) => (
          <div key={m.id} className={cn("rounded-lg px-3 py-2 whitespace-pre-wrap", m.role === "user" ? "bg-primary/10 text-foreground ml-6" : "bg-muted/50 mr-6")}>
            {m.content}
          </div>
        ))}
        {send.isPending && (
          <div className="rounded-lg px-3 py-2 bg-muted/50 mr-6 flex items-center text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="border-t border-border p-3 flex gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" disabled={send.isPending} />
        <Button type="submit" size="icon" disabled={send.isPending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}

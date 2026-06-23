import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopBar } from "@/components/app/AppTopBar";
import { ChatbotPanel } from "@/components/app/ChatbotPanel";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex flex-1 min-w-0 flex-col">
        <AppTopBar />
        <main className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto w-full">
              <Outlet />
            </div>
          </div>
          <ChatbotPanel />
        </main>
      </div>
    </div>
  );
}

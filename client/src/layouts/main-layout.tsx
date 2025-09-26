import { Outlet } from "react-router-dom";

import { Header } from "@/components/header";

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Header />
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 bg-background/70 py-6 text-center text-sm text-muted-foreground backdrop-blur">
        © {new Date().getFullYear()} Spotz. Veidots kopā ar ceļotāju kopienu.
      </footer>
    </div>
  );
}

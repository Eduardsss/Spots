import { MoonStar, Sun } from "lucide-react";

import { useTheme } from "@/contexts/theme-context";
import { Switch } from "@/components/ui/switch";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-full border border-border bg-card/70 px-4 py-2 text-sm font-medium shadow-sm backdrop-blur">
      <Sun className="h-4 w-4 text-amber-400" />
      <Switch
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
      <MoonStar className="h-4 w-4 text-sky-400" />
    </label>
  );
}

import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut, MapPinned, PlusCircle, UserPen } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ProfileDialog } from "@/components/profile-dialog";

const navItems = [
  { to: "/", label: "Sākums" },
  { to: "/map", label: "Karte" },
  { to: "/public", label: "Publiskie spoti" },
  { to: "/my-spots", label: "Mani spoti" },
];

export function Header() {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="container flex h-20 items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 text-xl font-semibold">
          <MapPinned className="h-7 w-7 text-primary" />
          Spotz
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-medium md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {!user && (
            <div className="flex items-center gap-3">
              <Button asChild variant="outline">
                <Link to="/login">Ienākt</Link>
              </Button>
              <Button asChild>
                <Link to="/register">Reģistrēties</Link>
              </Button>
            </div>
          )}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger className="focus:outline-none">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={user.profile_image || undefined} alt={user.username} />
                  <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">Sveiks, {user.username}!</p>
                  <p className="text-xs text-muted-foreground">Pārvaldi savu kontu</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                  <UserPen className="mr-2 h-4 w-4" /> Rediģēt profilu
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/my-spots" className="flex w-full items-center">
                    <PlusCircle className="mr-2 h-4 w-4" /> Mani spoti
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Izrakstīties
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  );
}

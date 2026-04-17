"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Ship,
  ClipboardList,
  BarChart3,
  MessageSquare,
  FileText,
  LogOut,
  Anchor,
  ClipboardCheck,
  Users,
  MapPin,
  BookOpen,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearToken, getStoredUser } from "@/lib/api";
import type { UserProfile } from "@/types";

const navGroups = [
  {
    label: null,
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: null },
    ],
  },
  {
    label: "FLEET",
    items: [
      { href: "/vessels", icon: Ship, label: "Vessels", roles: null },
      { href: "/inspections", icon: ClipboardList, label: "Inspections", roles: null },
      { href: "/passage-plans", icon: MapPin, label: "Passage Plans", roles: null },
      { href: "/inspection-requests", icon: ClipboardCheck, label: "Inspection Requests", roles: null },
    ],
  },
  {
    label: "QUALITY",
    items: [
      { href: "/checklists", icon: FileText, label: "Checklists", roles: null },
      { href: "/criteria-sets", icon: BookOpen, label: "Criteria Sets", roles: null },
      { href: "/analytics", icon: BarChart3, label: "Analytics", roles: null },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { href: "/vessel-logs", icon: BookMarked, label: "Vessel Logs", roles: null },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { href: "/chat", icon: MessageSquare, label: "AI Assistant", roles: null },
      { href: "/users", icon: Users, label: "Users", roles: ["consultancy_admin"] },
    ],
  },
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  return (
    <aside className="w-64 min-h-screen flex flex-col" style={{ background: "#0f1623" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-[18px] border-b border-white/[0.06]">
        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center ring-1 ring-blue-500/30">
          <Anchor className="w-[17px] h-[17px] text-blue-400" />
        </div>
        <div>
          <div className="font-semibold text-[15px] text-white leading-tight tracking-tight">MarinePulse</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mt-0.5">VHI Platform</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.roles || (user?.role != null && item.roles.includes(user.role))
          );
          if (!visibleItems.length) return null;

          return (
            <div key={group.label ?? "main"}>
              {group.label && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150",
                        active
                          ? "text-white bg-white/[0.08]"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                      )}
                      <item.icon className={cn("w-[18px] h-[18px] flex-shrink-0", active ? "text-blue-400" : "text-slate-500")} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        {user && (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-blue-400">{getInitials(user.name)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-white/90 truncate">{user.name}</div>
              <div className="text-[10px] text-slate-500 capitalize truncate">{user.role?.replace(/_/g, " ")}</div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          title="Sign out"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-all duration-150"
        >
          <LogOut className="w-[16px] h-[16px]" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

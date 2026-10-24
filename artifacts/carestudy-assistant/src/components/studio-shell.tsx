/**
 * Studio shell — the single layout every /studio page renders inside.
 *
 * It owns the studio sidebar, so moving between the drafting studio, the order
 * bin, the question bank, and the admin dashboard only swaps the page inside
 * the content pane. Rendering it once (in the router, above the pages) is what
 * keeps the sidebar from remounting on every studio navigation.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  ChevronsUpDown,
  GraduationCap,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  ListChecks,
  BookOpen,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudentInviteDialog } from "@/components/student-invite-dialog";
import { adminLogout } from "@/lib/adminAuth";
import { getInitials, getDisplayName, getRoleLabel, useAdmin } from "@/lib/adminContext";

const STUDIO_LINKS: {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}[] = [
  { href: "/studio", label: "Drafting studio", icon: HeartPulse },
  { href: "/studio/bin", label: "Order bin", icon: Inbox },
  { href: "/studio/nurseflow", label: "Question bank", icon: ListChecks, adminOnly: true },
  { href: "/studio/nurselearn", label: "NurseLearn", icon: BookOpen, adminOnly: true },
  { href: "/studio/dashboard", label: "Admin dashboard", icon: LayoutDashboard, adminOnly: true },
];

/**
 * The drafting studio renders its chapter / document / library / study panels
 * into the bottom of the shared sidebar, so the studio keeps one sidebar.
 */
const StudioSidebarToolsContext = createContext<HTMLElement | null>(null);

export function StudioSidebarToolsPortal({ children }: { children: ReactNode }) {
  const host = useContext(StudioSidebarToolsContext);
  if (!host) return null;
  return createPortal(children, host);
}

export function StudioShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const admin = useAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);

  const links = STUDIO_LINKS.filter((link) => !link.adminOnly || admin?.role === "admin");

  return (
    <StudioSidebarToolsContext.Provider value={toolsHost}>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="no-print">
          <SidebarHeader>
            <Link href="/studio" className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent">
              <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
                <HeartPulse className="size-5" />
              </span>
              <span className="group-data-[collapsible=icon]:hidden">
                <span className="block font-serif text-base leading-none tracking-tight text-sidebar-foreground">
                  care<span className="text-sidebar-primary">study</span>
                </span>
                <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/50">
                  studio
                </span>
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Studio</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => {
                    const Icon = link.icon;
                    const isActive =
                      link.href === "/studio" ? location === "/studio" : location.startsWith(link.href);
                    return (
                      <SidebarMenuItem key={link.href}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={link.label}>
                          <Link href={link.href}>
                            <Icon className="size-4 shrink-0 text-sidebar-primary" />
                            <span className="flex-1 truncate text-left">{link.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Invite student" onClick={() => setInviteOpen(true)}>
                      <GraduationCap className="size-4 shrink-0 text-sidebar-primary" />
                      <span className="flex-1 truncate text-left">Invite student</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* The drafting studio's own panels dock here. */}
            <div ref={setToolsHost} className="group-data-[collapsible=icon]:hidden" />
          </SidebarContent>

          <SidebarFooter>
            <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
                <div>
                  <p className="text-xs font-medium text-sidebar-foreground">Grounded by design</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-sidebar-foreground/70">
                    No patient facts are invented.
                  </p>
                </div>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-primary font-mono text-[11px] font-medium text-sidebar-primary-foreground">
                    {getInitials(admin)}
                  </span>
                  <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <span className="block truncate text-xs font-medium text-sidebar-foreground">
                      {getDisplayName(admin)}
                    </span>
                    <span className="block truncate text-[11px] text-sidebar-foreground/60">
                      {getRoleLabel(admin)}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Studio</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    void adminLogout().finally(() => {
                      // Back to the studio gate, which shows the sign-in dialog.
                      window.location.href = "/studio";
                    });
                  }}
                >
                  <LogOut /> Sign out of the studio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="no-print">{children}</SidebarInset>

        <StudentInviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      </SidebarProvider>
    </StudioSidebarToolsContext.Provider>
  );
}

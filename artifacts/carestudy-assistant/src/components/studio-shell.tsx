/**
 * Studio shell — the single layout every /studio page renders inside.
 *
 * It owns the studio sidebar, so moving between the drafting studio, the order
 * bin, the question bank, and the admin dashboard only swaps the page inside
 * the content pane. Rendering it once (in the router, above the pages) is what
 * keeps the sidebar from remounting on every studio navigation.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  Baby,
  ChevronDown,
  Heart,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { StudentInviteDialog } from "@/components/student-invite-dialog";
import { adminLogout } from "@/lib/adminAuth";
import { getInitials, getDisplayName, getRoleLabel, useAdmin } from "@/lib/adminContext";
import { CARE_STUDY_CADRE_PROFILES } from "@/lib/template";
import { BrandLogo } from "@/components/brand-logo";

const STUDIO_LINKS: {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}[] = [
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
  const [location, setLocation] = useLocation();
  const admin = useAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);
  const [cadreMenuOpen, setCadreMenuOpen] = useState(false);
  const cadreMenuCloseTimer = useRef<number | null>(null);

  const links = STUDIO_LINKS.filter((link) => !link.adminOnly || admin?.role === "admin");
  const isDraftingStudioActive = location === "/studio" || location === "/studio/rm-preview";
  const cancelCadreMenuClose = () => {
    if (cadreMenuCloseTimer.current !== null) {
      window.clearTimeout(cadreMenuCloseTimer.current);
      cadreMenuCloseTimer.current = null;
    }
  };
  const scheduleCadreMenuClose = () => {
    cancelCadreMenuClose();
    cadreMenuCloseTimer.current = window.setTimeout(() => setCadreMenuOpen(false), 180);
  };
  const openCadreMenu = () => {
    cancelCadreMenuClose();
    setCadreMenuOpen(true);
  };
  const goToCadre = (cadreId: string) => {
    setCadreMenuOpen(false);
    if (cadreId === "registered_general_nurse") setLocation("/studio");
    if (cadreId === "registered_midwife") setLocation("/studio/rm-preview");
  };

  useEffect(() => () => cancelCadreMenuClose(), []);

  return (
    <StudioSidebarToolsContext.Provider value={toolsHost}>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="no-print">
          <SidebarHeader>
            <Link href="/studio" className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent">
              <BrandLogo className="size-14 group-data-[collapsible=icon]:size-10" />
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
                  <SidebarMenuItem
                    onMouseEnter={openCadreMenu}
                    onMouseLeave={scheduleCadreMenuClose}
                  >
                    <DropdownMenu open={cadreMenuOpen} onOpenChange={setCadreMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                          isActive={isDraftingStudioActive}
                          tooltip="Drafting studio — choose a cadre"
                          aria-label="Drafting studio — choose a cadre"
                        >
                          <HeartPulse className="size-4 shrink-0 text-sidebar-primary" />
                          <span className="flex-1 truncate text-left">Drafting studio</span>
                          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        className="w-64"
                        onMouseEnter={cancelCadreMenuClose}
                        onMouseLeave={scheduleCadreMenuClose}
                      >
                        <DropdownMenuLabel>Choose a care-study cadre</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {CARE_STUDY_CADRE_PROFILES.map((profile) => {
                          const isAvailableInStudio =
                            profile.id === "registered_general_nurse" ||
                            profile.id === "registered_midwife";
                          const isSelected =
                            (profile.id === "registered_general_nurse" && location === "/studio") ||
                            (profile.id === "registered_midwife" && location === "/studio/rm-preview");
                          const CadreIcon = profile.id === "registered_general_nurse"
                            ? Heart
                            : profile.id === "registered_midwife"
                              ? Baby
                              : UserRound;
                          return (
                            <DropdownMenuItem
                              key={profile.id}
                              disabled={!isAvailableInStudio}
                              onSelect={() => goToCadre(profile.id)}
                              className="gap-2.5 py-2"
                            >
                              <CadreIcon className="size-4 text-primary" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{profile.name}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {isAvailableInStudio
                                    ? profile.id === "registered_midwife" ? "Preview · provisional" : "Studio"
                                    : "In development"}
                                </span>
                              </span>
                              {isSelected && <span className="text-xs text-primary">Current</span>}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
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
            {isDraftingStudioActive && (
              <div ref={setToolsHost} className="group-data-[collapsible=icon]:hidden" />
            )}
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

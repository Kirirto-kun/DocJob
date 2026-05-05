'use client';

import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DocJobLogo } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useMotionValue, useSpring, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import React from "react";


type DashboardLayoutProps = {
  children: React.ReactNode;
  sidebarContent: React.ReactNode;
};

export default function DashboardLayout({ children, sidebarContent }: DashboardLayoutProps) {
    const t = useTranslations('nav');
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const springConfig = { damping: 100, stiffness: 200, mass: 1 };
    const mouseXSpring = useSpring(mouseX, springConfig);
    const mouseYSpring = useSpring(mouseY, springConfig);


    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
    };

  return (
    <SidebarProvider>
      <div
        onMouseMove={handleMouseMove}
        className="relative flex h-screen w-full overflow-hidden bg-background text-foreground"
      >
        <motion.div
          className="pointer-events-none fixed left-0 top-0 z-0 h-96 w-96 rounded-full opacity-50 blur-[100px]"
          style={{
            translateX: mouseXSpring,
            translateY: mouseYSpring,
            x: '-50%',
            y: '-50%',
            background:
              'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 80%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 z-0 bg-grid-pattern opacity-10" />

        <Sidebar
          collapsible="icon"
          className="z-20 !w-72 transition-all duration-300 ease-in-out group-data-[collapsible=icon]:-translate-x-0 group-data-[collapsible=icon]:!w-16"
        >
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border p-4">
            <div className="flex items-center gap-2">
              <DocJobLogo className="h-8 w-8 text-primary" />
              <span className="font-headline text-lg font-semibold text-primary group-data-[collapsible=icon]:hidden">
                DocJob
              </span>
            </div>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">{sidebarContent}</div>
        </Sidebar>

        <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-background/50 px-6 backdrop-blur-sm">
            <SidebarTrigger className="flex-shrink-0" />
            <h2 className="hidden font-headline text-xl font-semibold text-foreground/80 md:block">
              {t('dashboardSubtitle')}
            </h2>
            <div className="ml-auto">
              <LanguageSwitcher />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}

"use client";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  IconCamera,
  IconFileDescription,
  IconFileAi,
  IconChalkboardTeacher,
  IconBook2,
} from "@tabler/icons-react";
import Image from "next/image";

const data = {
  user: {
    name: "Esmeraldinha",
    email: "linda@HOTmail.com",
    avatar: "/esmeralda-light.jpg",
  },
  navMain: [
    // {
    //   title: "Professores",
    //   url: "#",
    //   icon: <IconChalkboardTeacher />,
    // },
    // {
    //   title: "Cadernetas",
    //   url: "#",
    //   icon: <IconBook2 />,
    // },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: <IconCamera />,
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: <IconFileDescription />,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: <IconFileAi />,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#" className="flex items-center gap-2">
                <Image
                  src="/esmeralda.png"
                  alt="Ícone Esmeraldinha"
                  width={40}
                  height={40}
                  className="object-contain"
                />
                <span className="text-base font-semibold mx-[-0.5rem]">Esmeraldinha</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}

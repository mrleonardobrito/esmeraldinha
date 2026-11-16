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
  IconChalkboardTeacher,
  IconBook2,
  IconLayoutDashboard,
} from "@tabler/icons-react";
import { useConta } from "@/components/conta-provider";

const data = {
  navMain: [
    {
      title: "Painel",
      url: "/painel",
      icon: <IconLayoutDashboard />,
    },
    {
      title: "Professores",
      url: "/professores",
      icon: <IconChalkboardTeacher />,
    },
    {
      title: "Cadernetas",
      url: "/cadernetas",
      icon: <IconBook2 />,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { conta } = useConta();
  const itens = conta?.papel === "professor"
    ? data.navMain.filter((item) => item.url !== "/professores")
    : data.navMain;

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
                <img
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
        <NavMain items={itens} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

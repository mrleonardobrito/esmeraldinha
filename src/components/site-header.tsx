import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ModeToggle } from "./mode-toggle"

export function SiteHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex flex-1 items-center justify-between gap-2 px-2 lg:gap-4">
        <div className="flex w-full items-center gap-1 px-2 lg:gap-2">
          <SidebarTrigger/>
          <Separator
            orientation="vertical"
            className="data-[orientation=vertical]:h-7"
          />
        </div>
        <ModeToggle />
      </div>
    </header>
  )
}

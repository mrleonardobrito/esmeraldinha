import { IconHelp } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ModeToggle } from "./mode-toggle"

export interface SiteHeaderProps {
  /** Reabre o guia de boas-vindas, que fora da primeira execução só vem daqui. */
  onAbrirGuia: () => void
}

export function SiteHeader({ onAbrirGuia }: SiteHeaderProps) {
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
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onAbrirGuia}
                aria-label="Ver o guia de funcionalidades"
              >
                <IconHelp className="h-[1.2rem] w-[1.2rem]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Como a Esmeraldinha funciona</TooltipContent>
          </Tooltip>
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}

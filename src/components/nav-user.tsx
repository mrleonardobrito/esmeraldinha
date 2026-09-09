import { useNavigate } from "react-router"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { IconDotsVertical, IconUserCircle, IconLogout } from "@tabler/icons-react"

import { useConta } from "@/components/conta-provider"
import { getInitials } from "@/lib/professores"

/** Quem está usando a Esmeraldinha, com o caminho para a conta e para sair. */
export function NavUser() {
  const { isMobile } = useSidebar()
  const { conta, sair } = useConta()
  const navigate = useNavigate()

  if (!conta) return null

  const iniciais = getInitials(conta.nome)
  // Sem e-mail cadastrado, o login é a segunda linha: é o que identifica a conta.
  const identificacao = conta.email || conta.login

  async function handleSair() {
    try {
      await sair()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível sair.",
      )
    }
  }

  const identidade = (
    <>
      <Avatar className="h-8 w-8 rounded-full">
        {conta.imagem && <AvatarImage src={conta.imagem} alt="" />}
        <AvatarFallback className="rounded-lg">{iniciais}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{conta.nome}</span>
        <span className="truncate text-xs text-muted-foreground">
          {identificacao}
        </span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {identidade}
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                {identidade}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => void navigate("/conta")}>
                <IconUserCircle />
                Conta
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void handleSair()}>
              <IconLogout />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

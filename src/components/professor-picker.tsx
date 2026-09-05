import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getInitials, maskCpf, type Professor } from "@/lib/professores";

export function ProfessorPicker({
  professores,
  selectedId,
  onSelect,
}: {
  professores: Professor[];
  selectedId?: string;
  onSelect: (professor: Professor) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {professores.map((professor) => {
        const isSelected = professor.id === selectedId;

        return (
          <button
            key={professor.id}
            type="button"
            onClick={() => onSelect(professor)}
            aria-pressed={isSelected}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center transition-colors outline-none",
              "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
              isSelected && "border-primary ring-3 ring-primary/20",
            )}
          >
            <Avatar size="lg" className="size-16">
              {professor.imagem && (
                <AvatarImage src={professor.imagem} alt={professor.nome} />
              )}
              <AvatarFallback className="text-base">
                {getInitials(professor.nome)}
              </AvatarFallback>
            </Avatar>

            <span className="text-sm font-medium">{professor.nome}</span>

            <div className="flex w-full flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                Login: {maskCpf(professor.login)}
              </span>
              <span className="truncate" title={professor.escola}>
                Escola: {professor.escola}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** A mesma grade de cartões, em cinza, enquanto os professores carregam. */
export function ProfessorPickerSkeleton({ cartoes = 4 }: { cartoes?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: cartoes }, (_, cartao) => (
        <div
          key={cartao}
          className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-5"
        >
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-4 w-36 rounded-md" />
          <div className="flex w-full flex-col items-center gap-1.5">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

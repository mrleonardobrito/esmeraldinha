import * as React from "react";
import { toast } from "sonner";
import { IconArrowLeft, IconPencil, IconRefresh, IconLockOpen } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { requestApi } from "@/lib/api";
import { loadCadernetas, turmasDaCaderneta, type Caderneta } from "@/lib/cadernetas";
import { buscarTurmas, loadTurmas, loadEstudantes, type Turma, type EstudanteDaTurma } from "@/lib/turmas";
import { getInitials, maskCpf, type Professor } from "@/lib/professores";

type Edit = { title: string; fields: { key: string; label: string; value: string; type?: string }[]; save: (values: Record<string, string>) => Promise<void> };

export function ProfessorDetails({ professor, onBack, onEdit, onAccess }: { professor: Professor; onBack: () => void; onEdit: () => void; onAccess: () => void }) {
  const [cadernetas, setCadernetas] = React.useState<Caderneta[]>([]);
  const [turmas, setTurmas] = React.useState<Turma[]>([]);
  const [estudantes, setEstudantes] = React.useState<Record<string, EstudanteDaTurma[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [edit, setEdit] = React.useState<Edit | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const refresh = React.useCallback(async () => {
    const [cs, ts] = await Promise.all([loadCadernetas(professor.id), loadTurmas(professor.id)]);
    const lists = await Promise.all(ts.map(async (t) => [t.id, await loadEstudantes(t.id)] as const));
    setCadernetas(cs); setTurmas(ts); setEstudantes(Object.fromEntries(lists));
  }, [professor.id]);
  React.useEffect(() => { void Promise.resolve().then(refresh).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível carregar os detalhes.")).finally(() => setLoading(false)); }, [refresh]);
  function openEdit(next: Edit) { setValues(Object.fromEntries(next.fields.map((f) => [f.key, f.value]))); setEdit(next); }
  async function save() {
    if (!edit) return;
    setSaving(true);
    try { await edit.save(values); await refresh(); setEdit(null); toast.success("Alterações salvas."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  async function update(path: string, body: unknown) { await requestApi(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  async function sync() {
    setSyncing(true);
    try { await buscarTurmas(professor.id); await refresh(); toast.success("Turmas e estudantes sincronizados."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível sincronizar."); }
    finally { setSyncing(false); }
  }
  function editCaderneta(c: Caderneta) { openEdit({ title: `Valores — ${turmasDaCaderneta(c).join(", ")}`, fields: [{ key: "valorRecebido", label: "Valor recebido (R$)", type: "number", value: c.valorRecebido?.toString() ?? "" }, { key: "valorAReceber", label: "Valor a receber (R$)", type: "number", value: c.valorAReceber?.toString() ?? "" }], save: async (v) => update(`/api/cadernetas/${c.id}`, { valorRecebido: v.valorRecebido === "" ? null : Number(v.valorRecebido), valorAReceber: v.valorAReceber === "" ? null : Number(v.valorAReceber) }) }); }
  function editTurma(t: Turma) { openEdit({ title: "Editar turma", fields: [{ key: "nome", label: "Nome", value: t.nome }, { key: "turno", label: "Turno", value: t.turno ?? "" }, { key: "periodoLetivo", label: "Período letivo", value: t.periodoLetivo ?? "" }], save: (v) => update(`/api/turmas/${t.id}`, { nome: v.nome, turno: v.turno || null, periodoLetivo: v.periodoLetivo || null }) }); }
  function editEstudante(t: Turma, e: EstudanteDaTurma) { openEdit({ title: "Editar estudante", fields: [{ key: "nome", label: "Nome", value: e.nome }, { key: "matricula", label: "Matrícula", value: e.matricula }, { key: "situacao", label: "Situação", value: e.situacao ?? "" }, { key: "dataMatricula", label: "Data da matrícula", value: e.dataMatricula ?? "" }], save: (v) => update(`/api/turmas/${t.id}/estudantes/${encodeURIComponent(e.matricula)}`, { nome: v.nome, matricula: v.matricula, situacao: v.situacao || null, dataMatricula: v.dataMatricula || null }) }); }
  const money = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return <div className="min-w-0 w-full flex-1 bg-zinc-50 p-4 lg:p-6 dark:bg-black">
    <Button variant="ghost" onClick={onBack}><IconArrowLeft /> Professores</Button>
    <Card className="mt-4"><CardHeader><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 flex-1 items-center gap-4"><Avatar className="size-14 shrink-0">{professor.imagem && <AvatarImage src={professor.imagem} alt={professor.nome} />}<AvatarFallback>{getInitials(professor.nome)}</AvatarFallback></Avatar><div className="min-w-0 [overflow-wrap:anywhere]"><CardTitle>{professor.nome}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{professor.escola} · CPF {maskCpf(professor.login)}</p><p className="text-sm text-muted-foreground">{professor.acessoLiberado ? "Acesso ao sistema liberado" : "Sem acesso ao sistema"}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onEdit}><IconPencil /> Editar</Button><Button variant="outline" disabled={syncing} onClick={() => void sync()}><IconRefresh /> {syncing ? "Sincronizando…" : "Sincronizar"}</Button>{!professor.acessoLiberado && <Button onClick={onAccess}><IconLockOpen /> Criar acesso ao sistema</Button>}</div></div></CardHeader></Card>
    <Tabs defaultValue="cadernetas" className="mt-6"><TabsList><TabsTrigger value="cadernetas">Cadernetas</TabsTrigger><TabsTrigger value="turmas">Turmas</TabsTrigger><TabsTrigger value="estudantes">Estudantes</TabsTrigger></TabsList>
    {loading ? <p className="p-4 text-sm text-muted-foreground">Carregando detalhes…</p> : <>
    <TabsContent value="cadernetas"><Card><CardContent><Table className="[&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]"><TableHeader><TableRow><TableHead>Turma</TableHead><TableHead>Conteúdo</TableHead><TableHead>Boletim</TableHead><TableHead>Frequência</TableHead><TableHead>Ficha de desempenho</TableHead><TableHead>Ficha descritiva</TableHead><TableHead>Recebido</TableHead><TableHead>A receber</TableHead><TableHead /></TableRow></TableHeader><TableBody>{cadernetas.map((c) => { const aulas = c.etapas.reduce((n, e) => n + e.totalDeAulas, 0); const preenchidas = c.etapas.reduce((n, e) => n + e.aulasPreenchidas, 0); const notas = c.etapas.reduce((n, e) => n + e.totalDeNotas, 0); const lancadas = c.etapas.reduce((n, e) => n + e.notasLancadas, 0); return <TableRow key={c.id}><TableCell>{turmasDaCaderneta(c).join(", ")}</TableCell><TableCell>{aulas ? `${preenchidas}/${aulas} aulas` : "Sem dados"}</TableCell><TableCell>{notas ? `${lancadas}/${notas} notas` : "Sem dados"}</TableCell><TableCell>Sem dados</TableCell><TableCell>Sem dados</TableCell><TableCell>Sem dados</TableCell><TableCell>{money(c.valorRecebido)}</TableCell><TableCell>{money(c.valorAReceber)}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => editCaderneta(c)}>Editar valores</Button></TableCell></TableRow>; })}</TableBody></Table>{!cadernetas.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma caderneta vinculada.</p>}</CardContent></Card></TabsContent>
    <TabsContent value="turmas"><p className="mb-3 text-sm text-muted-foreground">As alterações em turmas e estudantes são locais e podem ser substituídas na próxima sincronização com o portal.</p><Card><CardContent><Table className="[&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]"><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Turno</TableHead><TableHead>Grupo diário</TableHead><TableHead>Período letivo</TableHead><TableHead>Estudantes</TableHead><TableHead /></TableRow></TableHeader><TableBody>{turmas.map((t) => <TableRow key={t.id}><TableCell>{t.nome}</TableCell><TableCell>{t.turno ?? "—"}</TableCell><TableCell>{t.grupoDiario ?? "—"}</TableCell><TableCell>{t.periodoLetivo ?? "—"}</TableCell><TableCell>{t.totalDeEstudantes}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => editTurma(t)}>Editar</Button></TableCell></TableRow>)}</TableBody></Table>{!turmas.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma turma encontrada.</p>}</CardContent></Card></TabsContent>
    <TabsContent value="estudantes"><p className="mb-3 text-sm text-muted-foreground">As alterações são locais e podem ser substituídas na próxima sincronização com o portal.</p><div className="space-y-3">{turmas.map((t) => <details key={t.id} className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-medium">{t.nome} ({(estudantes[t.id] ?? []).length})</summary><Table className="[&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]"><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Matrícula</TableHead><TableHead>Situação</TableHead><TableHead>Data da matrícula</TableHead><TableHead /></TableRow></TableHeader><TableBody>{(estudantes[t.id] ?? []).map((e) => <TableRow key={e.matricula}><TableCell>{e.nome}</TableCell><TableCell>{e.matricula}</TableCell><TableCell>{e.situacao ?? "—"}</TableCell><TableCell>{e.dataMatricula ?? "—"}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => editEstudante(t, e)}>Editar</Button></TableCell></TableRow>)}</TableBody></Table>{!(estudantes[t.id] ?? []).length && <p className="p-4 text-sm text-muted-foreground">Nenhum estudante encontrado.</p>}</details>)}{!turmas.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma turma encontrada.</p>}</div></TabsContent></>}</Tabs>
    <Dialog open={!!edit} onOpenChange={(open) => { if (!open) setEdit(null); }}><DialogContent><DialogHeader><DialogTitle>{edit?.title}</DialogTitle></DialogHeader><form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">{edit?.fields.map((f) => <label key={f.key} className="block space-y-1 text-sm"><span>{f.label}</span><Input type={f.type ?? "text"} min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "0.01" : undefined} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} /></label>)}<DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

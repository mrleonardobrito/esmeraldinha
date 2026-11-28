/** An authenticated identity, independent of the session store and transport. */
export type IdentidadeDaSessao =
  | { readonly papel: 'auxiliar de ensino'; readonly contaId: string }
  | { readonly papel: 'professor'; readonly professorId: string };

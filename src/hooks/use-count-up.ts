import * as React from 'react';

import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * Conta de zero até o valor, desacelerando no fim. O número do painel chega
 * junto com os dados: vê-lo subir diz que aquilo acabou de ser lido, e não que
 * estava ali o tempo todo.
 */
export function useCountUp(valor: number, duracao = 900) {
  const semMovimento = usePrefersReducedMotion();
  const [exibido, setExibido] = React.useState(0);

  React.useEffect(() => {
    if (semMovimento || valor === 0) return;

    let frame = 0;
    let inicio: number | null = null;

    const passo = (agora: number) => {
      inicio ??= agora;
      const t = Math.min(1, (agora - inicio) / duracao);
      setExibido(Math.round(valor * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(passo);
    };

    frame = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(frame);
  }, [valor, duracao, semMovimento]);

  return semMovimento ? valor : exibido;
}

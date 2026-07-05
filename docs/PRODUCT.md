# Product

## Register

brand

## Users

Mulheres brasileiras (25–55) buscando semi joias em prata premium e acessíveis, tanto
para uso pessoal cotidiano quanto para presentear. Compram pelo celular, valorizam estética
editorial, confiabilidade e detalhe das pedras (esmeralda e Paraíba). Decisão por desejo +
prova social; conversão depende da percepção de qualidade da marca em poucos segundos.

## Product Purpose

Vitrine editorial e e-commerce da Druza Semi Joias. Apresentar a marca como sofisticada,
feminina e confiável; conduzir do desejo à compra (categorias → produto → sacola → checkout)
em poucos toques. Objetivo de sucesso: percepção de marca estabelecida e fluxo de compra
fluido em mobile.

## Brand Personality

**Elegante, feminina, confiante.** Editorial sóbria com toque poético sutil — premium
acessível, não ostentação. Voz sensorial em pequenos momentos (luz, prata, pedra, presença),
nunca clichê de loja de semijoias ("brilhe como nunca", "realce sua beleza").

## Anti-references

- E-commerces genéricos de semijoias (templates Nuvemshop/Shopify padrão, banners poluídos,
  rosa em excesso, infantil ou "fofo").
- Luxo pesado, dourado, ostentação tipo joalheria tradicional.
- Bege/marfim dominante "magazine warm" — a marca é branca + rosa de assinatura.
- Cópia direta da Swarovski (usada só como referência de estrutura, espaçamento e
  hierarquia editorial — não de identidade, cores ou textos).
- Faixas horizontais rosas repetidas atravessando a página ("listrado").
- Banco de imagem genérico; foto improvisada onde falta asset real.

## Design Principles

1. **Branco domina, rosa assina.** Base branca dominante; rosa da Druza aparece em pontos
   controlados (selo do logo, botão secundário, badges, cards contidos). Nunca como papel
   de parede ou várias barras largas.
2. **Pedras em foco, peças como protagonistas.** Verde esmeralda e Paraíba são o ponto de
   interesse — entram pelas fotos das peças, não como símbolos de marca.
3. **Placeholder é design, não buraco.** Onde falta foto real, o sistema entrega um card
   `.ph` premium (título, descrição do asset esperado, selo "Foto em breve"). Nada de
   imagem fake nem reaproveitamento óbvio.
4. **Editorial sóbrio com toque poético.** Tipografia faz o trabalho pesado (Cormorant +
   Jost); texto claro, sensorial só em pequenos momentos. Sem clichê de semijoia.
5. **Mobile-first e honesto.** Site mostra com clareza o que é protótipo (sacola/checkout
   simulados, placeholders); promete só o que entrega. Performance > efeito.

## Accessibility & Inclusion

Alvo WCAG 2.1 AA. Skip-link, foco visível, contraste AA em corpo e placeholders,
`prefers-reduced-motion` respeitado em toda animação (aurora do hero, reveals, hover).
Drawers (sacola/menu) com `role="dialog"`, `aria-modal`, foco preso, retorno ao gatilho e
`Escape`. Live region anuncia adições à sacola. Inputs com `autocomplete`/`inputmode`
adequados. Pendência conhecida: teste com leitor de tela real em mobile antes do deploy.

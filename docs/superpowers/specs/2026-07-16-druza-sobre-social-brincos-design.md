# Druza: Sobre, presença social e lista de espera de brincos

Data: 2026-07-16
Status: aprovado

## Objetivo

Fortalecer a percepção de marca da Druza em três pontos: aprofundar a página Sobre,
criar uma presença social autêntica na home e transformar a página de brincos em uma
prévia editorial com lista de espera via WhatsApp.

O resultado deve ser sofisticado, honesto e coerente com a identidade já existente.
Nenhum depoimento, número, preço, produto disponível ou história institucional será
inventado.

## Direção aprovada

A direção escolhida é "Lançamento editorial". A coleção de brincos será apresentada por
três famílias conceituais: Gotas, Argolas e Pontos de luz. Cada família usa o placeholder
premium existente até que a marca possua fotografias reais.

Toda a interface reutiliza os ativos e o sistema visual atuais da Druza:

- logo e monograma oficiais;
- Cormorant Garamond e Jost;
- base branca com rosa de assinatura;
- tokens, botões, placeholders `.ph`, espaçamento e movimento já definidos;
- foco visível, contraste e redução de movimento existentes.

## Página Sobre

A página `sobre.html` passará de texto provisório para uma composição editorial completa,
sem afirmar fatos históricos ainda não fornecidos pela marca.

Conteúdo:

- abertura com a assinatura "Joias que guardam luz";
- manifesto sobre prata, pedras verdes, presença, leveza e elegância sem excesso;
- índice editorial curto para organizar a leitura;
- três princípios da marca: matéria, presença e permanência;
- chamada final para conhecer a coleção e acompanhar a Druza no Instagram.

Não serão citados fundadora, data de criação, fabricação própria, origem de materiais ou
processos que não estejam documentados.

## Presença social na home

A home receberá uma faixa compacta e editorial vinculada ao perfil real
`https://www.instagram.com/druzaoficial/`.

A faixa:

- usará o texto "Acompanhe a Druza" e o identificador `@druzaoficial`;
- convidará a acompanhar bastidores e lançamentos;
- não exibirá avaliações, seguidores, curtidas, métricas ou imagens simuladas;
- abrirá o perfil em nova aba com `noopener noreferrer`;
- respeitará o ritmo e a identidade visual já presentes em `index.html`.

## Página de brincos

`brincos.html` deixará de apresentar produtos, preços e parcelamentos fictícios. A página
será uma prévia de lançamento com:

- hero editorial "Brincos que iluminam o rosto";
- estado claro "Coleção em preparação";
- famílias Gotas, Argolas e Pontos de luz;
- placeholder `.ph` em cada família, sem fotografia improvisada;
- texto curto explicando o papel de cada estilo;
- chamada para acompanhar o processo no Instagram;
- botão principal para entrar na lista de espera pelo WhatsApp.

Os nomes das famílias descrevem categorias editoriais, não produtos disponíveis para
compra.

## Integração com WhatsApp

O número de atendimento é `+55 11 96607-4268` e o destino técnico é
`https://wa.me/5511966074268`.

O botão da lista de espera usará a mensagem codificada:

> Olá, Druza! Quero entrar na lista de espera dos brincos e receber novidades da coleção.

O fluxo será um link comum, sem dependência de JavaScript, formulário ou banco de dados.
Em dispositivos com WhatsApp instalado, o aplicativo poderá ser aberto; nos demais, o
WhatsApp Web será usado. O envio só acontece quando a pessoa confirma a mensagem no
WhatsApp.

## Arquivos e limites

Arquivos previstos:

- `sobre.html`;
- `index.html`;
- `brincos.html`;
- `css/styles.css`;
- documentação de design, apenas se a implementação introduzir um padrão reutilizável
  que ainda não esteja registrado.

Não fazem parte deste trabalho:

- banco de avaliações;
- integração com a API do Instagram;
- captura de telefone ou cadastro no site;
- painel para administrar a lista de espera;
- criação de fotografias ou produtos fictícios;
- refatoração geral do cabeçalho ou do restante do e-commerce.

## Acessibilidade e comportamento

- links e botões terão rótulos claros e foco visível;
- links externos usarão `target="_blank"` e `rel="noopener noreferrer"` quando abrirem nova aba;
- placeholders terão descrições acessíveis e não serão anunciados como fotos reais;
- textos manterão contraste WCAG 2.1 AA;
- layouts serão testados em larguras mobile e desktop;
- animações respeitarão `prefers-reduced-motion`;
- o conteúdo e os links principais funcionarão sem JavaScript.

## Verificação

A implementação será considerada pronta quando:

1. a página Sobre não contiver aviso de texto provisório nem afirmações não documentadas;
2. a home apontar para `@druzaoficial` sem números ou avaliações inventadas;
3. a página de brincos não mostrar preços, parcelamentos ou disponibilidade fictícios;
4. os três placeholders editoriais usarem os estilos e ativos existentes;
5. o CTA abrir `wa.me/5511966074268` com a mensagem aprovada;
6. os fluxos forem navegáveis por teclado e legíveis em mobile e desktop;
7. as páginas não apresentarem erros de console ou links internos quebrados nos fluxos alterados.

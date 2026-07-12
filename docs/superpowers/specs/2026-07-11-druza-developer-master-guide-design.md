# Druza Developer Master Guide - Especificacao de design

Data: 11 de julho de 2026  
Status: aprovado pelo usuario  
Publico principal: desenvolvedor principal da Druza, equipe interna e fornecedores

## 1. Objetivo

Criar um PDF interno que funcione como fonte de verdade para marca, produto, arquitetura,
experiencia, operacao e crescimento da Druza Semi Joias. O documento deve registrar o que
ja foi construido, avaliar o estado atual, apontar riscos e oportunidades e converter as
recomendacoes em um roadmap executavel.

O guia nao sera apenas institucional. Cada recomendacao deve informar, quando aplicavel:

- contexto e evidencia;
- impacto esperado;
- prioridade e esforco;
- dependencia tecnica ou operacional;
- proximo passo;
- criterio de aceite.

## 2. Entregavel

- Arquivo final: `output/pdf/druza-developer-master-guide.pdf`.
- Extensao estimada: 55 a 70 paginas.
- Formato predominante: A4 vertical, com paginas horizontais quando diagramas ou tabelas
  tecnicas perderem legibilidade no formato vertical.
- Idioma: portugues do Brasil.
- Versao inicial: 1.0, julho de 2026.
- Uso: interno; linguagem direta, tecnica e franca.

## 3. Fontes e evidencias

O conteudo sera construido a partir de:

- codigo HTML, CSS, JavaScript, SQL e Edge Functions do repositorio;
- documentacao existente em `README.md` e `docs/`;
- site renderizado em desktop e mobile;
- imagens e logos oficiais da pasta `img/`;
- historico Git recente;
- referencias externas atuais, citadas de forma legivel;
- boas praticas tecnicas e de experiencia verificadas em fontes primarias.

Nenhuma credencial, token, segredo ou dado sensivel deve aparecer no PDF.

## 4. Arquitetura editorial

### 4.1 Visao executiva e mapa do sistema

Objetivos, estagio atual, tese central, proposta de valor, principios e mapa geral da
solucao. Inclui uma leitura rapida de pontos fortes, lacunas e prioridades.

### 4.2 Inventario do que ja foi construido

Linha do tempo, paginas publicas, fluxos de autenticacao, conta, checkout, pos-pagamento,
administracao, integracoes, seguranca, analytics e operacao logistica ja implementada.

### 4.3 Brand guide

Posicionamento, promessa, personalidade, publico, ocasioes de compra, diferenciais, tom de
voz, logo, cores, tipografia, composicao, fotografia, iconografia, exemplos e usos
incorretos.

### 4.4 Estrategia de produto e e-commerce

Oferta, arquitetura de colecao, merchandising, kits, presenteabilidade, prova de qualidade,
confianca, objecoes, conteudo de produto e oportunidades de diferenciacao.

### 4.5 UX e interacao

Personas relevantes, jornadas, funil, arquitetura de informacao, navegacao, busca, filtros,
feedback, estados vazios, erros, recuperacao, mobile, acessibilidade e continuidade entre
dispositivos.

### 4.6 UI e sistema visual

Tokens, hierarquia, tipografia, espacamento, grids, componentes, estados, responsividade,
consistencia, pontos de friccao e recomendacoes de evolucao do design system.

### 4.7 Arquitetura front-end

Estrutura HTML/CSS/JavaScript, responsabilidades dos modulos, fontes de dados, eventos,
estado local, catalogo, carrinho, checkout, autenticacao, administracao, testes e caminhos
de evolucao sem reescrita prematura.

### 4.8 Arquitetura back-end

Supabase, schemas, RLS, autenticacao, Edge Functions, Mercado Pago, webhooks, autorizacao
administrativa, 2FA, logs, rate limiting, CORS, riscos e observabilidade.

### 4.9 Performance, SEO e analytics

Core Web Vitals, imagens, fontes, cache, rede, JavaScript, indexacao, metadados, sitemap,
robots, eventos de negocio, dashboards e alertas.

### 4.10 Auditoria completa

Achados tecnicos e de experiencia classificados por P0, P1, P2 e P3. Cada achado deve ter
localizacao, impacto e recomendacao. O documento tambem deve registrar boas praticas que
devem ser preservadas.

### 4.11 Benchmarking e referencias

Padroes uteis de outros e-commerces, produtos digitais e sistemas administrativos. As
referencias servem para aprender estrutura, interacao e operacao; nao para copiar identidade.
Anti-referencias tambem serao registradas.

### 4.12 Wireframes e dashboards

Propostas proprias para home, catalogo, produto, checkout, conta e painel administrativo.
Inclui estados criticos, versoes mobile quando relevantes e um dashboard de KPIs.

### 4.13 Negocio e crescimento

Modelo de negocio, canais, aquisicao, conteudo, CRM, recuperacao de carrinho, retencao,
campanhas, calendario comercial, testes e metricas por etapa do funil.

### 4.14 Operacao da marca

Processos de briefing, aprovacao, producao fotografica, publicacao, controle de qualidade,
Definition of Done, responsabilidades e orientacoes a fornecedores.

### 4.15 Roadmap

Backlog em Agora, Proximo e Depois; plano de 30, 60 e 90 dias; e horizonte de 12 meses.
Cada item deve indicar impacto, esforco, dependencias e criterio de aceite.

## 5. Direcao visual

### 5.1 Identidade preservada

- Usar os logos oficiais existentes em `img/druza logo.png` e `img/druza-logo.png`,
  escolhendo a variante tecnicamente mais adequada para cada fundo.
- Preservar a paleta oficial documentada no projeto:
  - branco `#FFFFFF`;
  - branco suave `#FDF8F8`;
  - blush `#FBF0F1`;
  - rose institucional `#F4E3E5`;
  - rose `#C98B90`;
  - rose forte `#B97981`;
  - rose profundo `#5C3A3F`;
  - esmeralda `#1C6B5B`;
  - Paraiba `#5FB7A8`;
  - prata `#C5CAD0`;
  - tinta `#2B2B2D`;
  - texto `#4C4849`.
- Usar Cormorant Garamond para titulos editoriais e Jost para texto e interface, com as
  fontes auto-hospedadas do projeto.
- Verde e Paraiba permanecem acentos associados as pedras; nao substituem a assinatura
  rose da marca.

### 5.2 Linguagem grafica

- Aberturas de capitulo editoriais, com respiro e hierarquia forte.
- Paginas tecnicas brancas, modulares e legiveis, sem excesso de cards decorativos.
- Diagramas vetoriais simples, linhas finas e rotulos diretos.
- Screenshots reais anotados.
- Wireframes proprios em grafite, rose e prata.
- Tabelas curtas; conteudo muito denso deve ser dividido entre paginas.
- Codigos de status consistentes: Ja implementado, Validar, Melhorar, Construir e Explorar.
- Sem banco de imagem, sem imagens falsas e sem elementos visuais genericos de IA.

## 6. Diagramas e visuais minimos

O PDF deve conter, no minimo:

- mapa geral do sistema;
- fluxo catalogo -> carrinho -> checkout -> pagamento -> pedido;
- fluxo de autenticacao e conta;
- arquitetura de dados e seguranca;
- fluxo administrativo e logistico;
- funil de experiencia e metricas;
- mapa de jornada mobile;
- matriz impacto x esforco;
- roadmap visual;
- ao menos oito wireframes ou telas conceituais.

## 7. Criterios de qualidade

- Todas as paginas devem ser renderizadas em PNG e inspecionadas.
- Nao pode haver texto cortado, sobreposicao, glifos quebrados ou imagem pixelada.
- Titulos, rodapes, numeracao e transicoes de capitulo devem ser consistentes.
- Acessibilidade de leitura: contraste adequado, corpo legivel e diagramas com rotulos.
- Recomendacoes externas devem trazer fontes legiveis e atuais.
- O PDF deve ser util mesmo sem acesso ao repositorio durante a leitura.
- Achados devem distinguir evidencia do repositorio, inferencia e recomendacao.

## 8. Fora de escopo

- Implementar as melhorias propostas no site durante esta entrega.
- Alterar a identidade visual existente.
- Expor configuracoes sensiveis ou dados reais de clientes.
- Apresentar estimativas financeiras como previsoes garantidas.

## 9. Definicao de pronto

O trabalho estara concluido quando:

1. todo o repositorio relevante tiver sido inventariado;
2. os principais fluxos tiverem sido testados em desktop e mobile;
3. auditoria, arquitetura, benchmarking, wireframes e roadmap estiverem documentados;
4. o PDF final estiver em `output/pdf/`;
5. todas as paginas renderizadas tiverem sido verificadas sem defeitos visuais;
6. o arquivo final abrir corretamente e tiver metadados, sumario e numeracao consistentes.

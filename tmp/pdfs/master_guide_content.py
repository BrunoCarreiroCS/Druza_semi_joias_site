from reportlab.lib.colors import HexColor


ROSE = HexColor("#C98B90")
ROSE_DEEP = HexColor("#5C3A3F")
EMERALD = HexColor("#1C6B5B")
PARAIBA = HexColor("#5FB7A8")
AMBER = HexColor("#B7791F")
RED = HexColor("#A53D4A")
SILVER = HexColor("#C5CAD0")


def b(heading, *body, accent=ROSE):
    return {"heading": heading, "body": list(body), "accent": accent}


def q(text):
    return {"type": "quote", "text": text}


def m(value, label):
    return {"type": "metric", "value": value, "label": label}


SOURCES = [
    {"name": "Vercel Web Interface Guidelines", "url": "https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md"},
    {"name": "W3C - novidades da WCAG 2.2", "url": "https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/"},
    {"name": "web.dev - Core Web Vitals", "url": "https://web.dev/articles/defining-core-web-vitals-thresholds"},
    {"name": "Supabase - Row Level Security", "url": "https://supabase.com/docs/guides/database/postgres/row-level-security"},
    {"name": "Supabase - proteção de Edge Functions", "url": "https://supabase.com/docs/guides/functions/auth"},
    {"name": "Supabase - MFA e aal2", "url": "https://supabase.com/docs/guides/auth/auth-mfa"},
    {"name": "Mercado Pago - Webhooks", "url": "https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks"},
    {"name": "Google Search - Product structured data", "url": "https://developers.google.com/search/docs/appearance/structured-data/product"},
    {"name": "Google Search - estrutura de e-commerce", "url": "https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure"},
    {"name": "Google Analytics - eventos de e-commerce", "url": "https://support.google.com/analytics/answer/12200568"},
    {"name": "Monica Vinader", "url": "https://www.monicavinader.com/"},
    {"name": "Mejuri - catálogo", "url": "https://mejuri.com/us/en/collections/shop-all"},
    {"name": "Pandora - presentes", "url": "https://uk.pandora.net/en/gifts/"},
]


PAGES = [
    {"kind": "cover"},
    {
        "section": "Norte", "kicker": "01 - MENSAGEM EXECUTIVA", "title": "Um sistema de marca que também orienta código",
        "subtitle": "Este guia transforma a Druza em um produto operável: identidade, experiência, arquitetura, negócio e prioridades na mesma fonte de verdade.",
        "columns": [
            [q("A Druza não precisa de uma reescrita. Precisa fechar produção, medir o funil e evoluir a base certa na ordem certa."), b("Tese central", "Preservar a linguagem editorial e a simplicidade do stack.", "Remover sinais de protótipo antes de adquirir tráfego.", "Tratar pagamento, estoque e status como domínio crítico." , accent=ROSE_DEEP)],
            [m("16/20", "saúde técnica qualitativa"), b("Decisão recomendada", "Lançar em ondas controladas, com gates objetivos.", "Instrumentar antes de otimizar por opinião.", "Migrar complexidade apenas quando o volume justificar.", accent=EMERALD)],
        ],
        "decision": "Usar este documento como backlog-mãe e critério de aprovação, não como arquivo de inspiração isolado."
    },
    {
        "section": "Norte", "kicker": "COMO USAR", "title": "Cinco estados para toda decisão",
        "subtitle": "Cada item do projeto deve receber um estado e um responsável. Isso impede que ideias, dívidas e entregas prontas sejam misturadas.",
        "columns": [
            [b("Já implementado", "Existe no código e foi localizado na auditoria.", "Ainda pode depender de configuração externa.", accent=EMERALD), b("Validar", "Existe, mas precisa de ambiente real, dispositivo real ou dado real.", accent=PARAIBA)],
            [b("Melhorar", "Funciona, porém tem dívida de UX, manutenção, segurança ou performance.", accent=AMBER), b("Construir / explorar", "Não existe ainda. Deve entrar no roadmap com impacto, esforço e dependências.", accent=ROSE_DEEP)],
        ],
        "decision": "Nenhum item é considerado concluído sem evidência e critério de aceite."
    },
    {
        "section": "Sumário", "kicker": "MAPA DO DOCUMENTO", "title": "Parte I - marca, produto e experiência",
        "columns": [
            [b("Norte e inventário", "Diagnóstico executivo", "Mapa do sistema", "Linha do tempo", "Superfícies e capacidades"), b("Marca", "Essência e posicionamento", "Públicos e ocasiões", "Voz", "Logo, paleta, tipografia e fotografia")],
            [b("Experiência", "Jornadas e funil", "Home, catálogo e produto", "Sacola e checkout", "Conta e autenticação", "Admin, acessibilidade e responsividade"), b("Páginas", "06-20: norte e identidade", "21-30: diagnóstico UX/UI")],
        ]
    },
    {
        "section": "Sumário", "kicker": "MAPA DO DOCUMENTO", "title": "Parte II - tecnologia, crescimento e roadmap",
        "columns": [
            [b("Arquitetura", "Front-end e componentes", "Dados e back-end", "RLS, MFA e pagamento", "Observabilidade, performance e SEO"), b("Negócio", "Conteúdo e merchandising", "Modelo de negócio", "Aquisição, retenção e CRM", "Benchmarking")],
            [b("Concepção", "9 wireframes conceituais", "Dashboard de KPIs", "Matriz impacto x esforço"), b("Execução", "30 / 60 / 90 dias", "Horizonte de 12 meses", "Riscos, testes e Definition of Done", "Fontes")],
        ]
    },
    {
        "kind": "score", "section": "Diagnóstico", "title": "Saúde técnica atual", "score": "16/20", "rating": "Boa base, riscos concentrados",
        "rows": [("Acessibilidade",3,4,EMERALD),("Performance",3,4,PARAIBA),("Responsividade",3,4,PARAIBA),("Theming",4,4,EMERALD),("Anti-padrões",3,4,ROSE)],
        "blocks": [
            b("Pontos fortes", "RLS e separação de privilégios", "2FA aal2 no servidor", "Preços recalculados", "Fontes locais e imagens WebP", accent=EMERALD),
            b("P1 antes de escalar", "Conteúdo provisório exposto", "Sem testes automáticos", "Pedido sem transação/idempotência", "Estoque booleano", accent=RED),
            b("P2 de conversão", "Busca desativada", "Catálogo sem filtro/sort", "Checkout exige conta", "Prova social ainda fictícia", accent=AMBER),
            b("Leitura correta", "Nota qualitativa, não Lighthouse.", "Métricas de campo devem entrar após o deploy.", accent=PARAIBA),
        ]
    },
    {
        "section": "Norte", "kicker": "NORTH STAR", "title": "Desejo em segundos, confiança até o pagamento",
        "subtitle": "A promessa operacional da experiência: a cliente entende a marca, encontra uma peça, confia no produto e conclui a compra sem ruído.",
        "columns": [
            [b("Percepção", "Editorial sóbria", "Prata e pedras verdes como protagonistas", "Premium acessível, sem ostentação", accent=ROSE_DEEP), b("Comportamento", "Mobile-first", "Poucos toques", "Feedback imediato", "Recuperação clara")],
            [b("Confiança", "Preço e estoque coerentes", "Troca, garantia e prazo visíveis", "Pagamento confirmado pelo servidor", accent=EMERALD), b("Métrica norte", "Taxa de compra concluída por sessão qualificada.", "Guardrails: reembolso, cancelamento, atraso e suporte.", accent=PARAIBA)],
        ], "decision": "Toda melhoria deve reduzir incerteza ou tempo até a compra, sem diluir a identidade."
    },
    {
        "kind": "flow", "section": "Arquitetura", "kicker": "MAPA DO SISTEMA", "title": "A Druza em seis camadas",
        "subtitle": "A base atual separa apresentação, estado local, identidade, dados, funções sensíveis e gateway de pagamento.",
        "steps": [
            {"title":"Site estático", "text":"27 páginas HTML, CSS e JavaScript puro."},
            {"title":"Catálogo e carrinho", "text":"Conteúdo local + preço e disponibilidade do banco."},
            {"title":"Supabase Auth e Postgres", "text":"Perfis, endereços, pedidos, produtos e RLS."},
            {"title":"Edge Functions", "text":"Checkout, webhook e operações administrativas."},
            {"title":"Mercado Pago", "text":"Checkout Pro, retorno e consulta autenticada."},
            {"title":"Admin e operação", "text":"Pedidos, produtos, etiquetas, CSV, notas e auditoria."},
        ],
        "notes": [b("Princípio", "O navegador nunca decide preço, estado pago ou privilégio administrativo.", accent=EMERALD), b("Evolução", "Manter o stack até que testes, deploy e observabilidade estejam maduros.", accent=PARAIBA)]
    },
    {
        "section": "Arquitetura", "kicker": "ESTADO ATUAL", "title": "Boa simplicidade, complexidade já emergindo",
        "columns": [
            [b("O que funciona", "Sem build obrigatório", "Deploy simples", "Baixo custo operacional", "Fallback de catálogo", "Separação de funções sensíveis", accent=EMERALD), b("Sinais de limite", "main.js com cerca de 42 KB", "admin.html com cerca de 50 KB e lógica inline", "Páginas de produto fixas + genérica", accent=AMBER)],
            [b("Estratégia", "Não migrar para framework por estética.", "Extrair módulos por domínio primeiro.", "Adicionar testes e CI antes de aumentar abstração.", accent=ROSE_DEEP), b("Gatilhos de migração", "Mais de um dev ativo", "CMS e variações complexas", "SSR necessário para SEO/velocidade", "Experimentos frequentes")],
        ], "decision": "Refatorar modularmente no stack atual; reavaliar framework apenas após métricas e pressão real."
    },
    {
        "kind": "timeline", "section": "Inventário", "kicker": "EVOLUÇÃO", "title": "Do protótipo ao e-commerce funcional",
        "subtitle": "A linha do tempo mostra que o projeto já resolveu problemas reais de pagamento, segurança e operação.",
        "step_gap": 69,
        "items": [
            {"title":"Fase 0 - protótipo", "text":"Home editorial, catálogo local, carrinho e checkout simulados.", "color":SILVER},
            {"title":"Fase 1 - pagamento real", "text":"Supabase, Auth, pedidos, Checkout Pro e webhook.", "color":ROSE},
            {"title":"Fase 2 - conta", "text":"CRUD de endereços e histórico de pedidos.", "color":PARAIBA},
            {"title":"Fases 3 e 4 - admin seguro", "text":"Painel, produtos, logística, 2FA TOTP e aal2 no servidor.", "color":EMERALD},
            {"title":"Fases 5 a 7 - hardening", "text":"SRI, CORS, rate limit, WebP, fontes locais, SEO e GA4 preparado.", "color":ROSE_DEEP},
            {"title":"Próxima fase - produção medida", "text":"Fechar conteúdo, deploy, métricas, estoque e automação operacional.", "color":RED},
        ]
    },
    {
        "section": "Inventário", "kicker": "SUPERFÍCIES", "title": "27 páginas públicas e operacionais",
        "columns": [
            [b("Descoberta", "Home", "Catálogo geral", "Categoria brincos", "Sobre, cuidados e contato"), b("Compra", "Produto genérico", "7 páginas fixas de produto", "Sacola lateral", "Checkout", "3 retornos de pagamento")],
            [b("Conta", "Cadastro e login", "Recuperação e redefinição", "Área do cliente", "Endereços e pedidos"), b("Operação", "Login admin", "Painel de pedidos", "Produtos", "Detalhe logístico e impressão")],
        ], "decision": "Consolidar shells repetidos e tratar o produto genérico como caminho principal."
    },
    {
        "section": "Inventário", "kicker": "CAPACIDADES", "title": "O que já existe e deve ser preservado",
        "columns": [
            [b("Comércio", "Preço ao vivo do banco", "Frete simulado por CEP", "Cupom PRIMEIRADRUZA", "Persistência da sacola", "Checkout Pro", accent=EMERALD), b("Cliente", "Auth", "Endereços", "Histórico", "Rastreio", "Recuperação de senha")],
            [b("Admin", "2FA obrigatório", "Filtros e CSV", "Notas internas", "Etiquetas e romaneio", "Auditoria de ações", accent=EMERALD), b("Fundação", "RLS", "SRI", "Fontes locais", "WebP", "robots e sitemap", "GA4 preparado")],
        ]
    },
    {
        "section": "Marca", "kicker": "ESSÊNCIA", "title": "Elegante, feminina e confiante",
        "columns": [
            [q("Prata, luz e pedras verdes. Presença sem excesso."), b("Personalidade", "Editorial sóbria", "Poética em pequenas doses", "Premium acessível", "Confiável e contemporânea", accent=ROSE_DEEP)],
            [b("Promessa", "Peças de prata com cor e presença, prontas para acompanhar o cotidiano ou marcar um gesto de presente.", accent=EMERALD), b("Evitar", "Luxo pesado", "Rosa infantil", "Clichês de brilho", "Banco de imagem genérico", "Promoção permanente", accent=RED)],
        ]
    },
    {
        "section": "Marca", "kicker": "POSICIONAMENTO", "title": "Um território entre joia cotidiana e presente memorável",
        "columns": [
            [b("Categoria", "Semi joias femininas em prata 925, com pedras verdes e acabamento premium."), b("Diferença", "Assinatura cromática das pedras", "Estética editorial", "Produto pronto para presentear", "Transparência de material e cuidado", accent=EMERALD)],
            [b("Prova necessária", "Fotografia consistente", "Especificação do material", "Garantia e troca", "Avaliações reais", "Prazo e embalagem"), b("Frase de posicionamento", "Para mulheres que querem cor e elegância no cotidiano, a Druza combina prata e pedras verdes em peças presentes e acessíveis.", accent=ROSE_DEEP)],
        ], "decision": "Competir por assinatura e confiança, não por desconto constante."
    },
    {
        "section": "Marca", "kicker": "PÚBLICO E JOBS", "title": "Três ocasiões guiam produto e comunicação",
        "columns": [
            [b("Autopresente cotidiano", "Quero uma peça versátil que pareça especial.", "Objeções: material, tamanho, durabilidade."), b("Presente com segurança", "Quero acertar sem conhecer todos os detalhes.", "Objeções: embalagem, prazo, troca e significado.", accent=ROSE)],
            [b("Marco e ocasião", "Quero uma peça com presença para celebrar algo.", "Objeções: valor percebido e diferenciação.", accent=PARAIBA), b("Prioridade mobile", "Usuária distraída, uma mão, conexão variável.", "Precisa retomar estado e entender o próximo passo em segundos.", accent=EMERALD)],
        ]
    },
    {
        "kind": "flow", "section": "Marca", "kicker": "JORNADA", "title": "Do primeiro impacto à recompra",
        "steps": [
            {"title":"Descobrir", "text":"Campanha, social, busca ou indicação."},
            {"title":"Reconhecer", "text":"Entender estilo, material e faixa de preço."},
            {"title":"Considerar", "text":"Comparar peça, tamanho, prazo e confiança."},
            {"title":"Comprar", "text":"Sacola, conta, endereço e Mercado Pago."},
            {"title":"Receber", "text":"Confirmação, rastreio e embalagem."},
            {"title":"Voltar", "text":"Cuidado, combinações, ocasião e CRM."},
        ],
        "notes": [b("Maior vazamento provável", "Entre sacola e checkout: conta obrigatória + falta de frete real.", accent=RED), b("Maior alavanca", "Fotografia, prova social real e kits para ultrapassar o frete grátis.", accent=EMERALD)]
    },
    {
        "section": "Marca", "kicker": "VOZ", "title": "Sensorial no desejo, direta na decisão",
        "columns": [
            [b("Desejo", "Falar de luz, cor, prata e presença.", "Frases curtas e específicas.", "Uma imagem poética por bloco, no máximo."), b("Serviço", "Prazo, material, tamanho e troca em linguagem literal.", "Erros dizem o que aconteceu e como resolver.", accent=EMERALD)],
            [b("Exemplos", "Bom: Verde que permanece.", "Bom: Escolha o aro antes de adicionar.", "Evitar: Brilhe como nunca.", "Evitar: Algo deu errado.", accent=ROSE_DEEP), b("Atendimento", "Acolher, confirmar entendimento, oferecer solução e prazo.", "Nunca culpar cliente ou gateway.")],
        ]
    },
    {
        "section": "Marca", "kicker": "LOGO E PALETA", "title": "Branco domina, rosé assina",
        "columns": [
            [b("Logo oficial", "Usar os arquivos raster existentes em fundos compatíveis.", "Criar SVG mestre para escala, impressão e consistência.", "Nunca recolorir o lótus de verde.", accent=ROSE_DEEP), b("Área de proteção", "Mínimo: metade da altura do lótus ao redor.", "Evitar aplicações abaixo de 24 px sem versão simplificada.")],
            [b("Paleta", "#FFFFFF base", "#C98B90 assinatura", "#5C3A3F contraste", "#1C6B5B esmeralda", "#5FB7A8 Paraíba", "#2B2B2D tinta", accent=ROSE), b("Contraste", "Rosé #C98B90 sobre branco: 2,77:1.", "Usar como decoração, borda ou texto grande.", "Para corpo, preferir #5C3A3F ou #4C4849.", accent=RED)],
        ]
    },
    {
        "section": "Marca", "kicker": "TIPOGRAFIA E IMAGEM", "title": "Cormorant cria desejo; Jost mantém controle",
        "columns": [
            [b("Tipografia", "Cormorant Garamond 500/600 em títulos.", "Jost 300/400/500 em texto e UI.", "Corpo mínimo recomendado: 16 px no site.", "Limite de linha: 65-75 caracteres."), b("Hierarquia", "H1 de 38-67 px", "H2 de 30-48 px", "UI com peso 500", "Números tabulares")],
            [b("Fotografia", "1:1 para categoria", "4:5 para produto", "Detalhe macro", "Uso real com pele", "Embalagem e escala", accent=PARAIBA), b("Gate de produção", "Cada SKU precisa de frente, detalhe, escala e contexto.", "Não publicar avaliações, material ou medidas provisórias.", accent=RED)],
        ]
    },
    {
        "section": "Marca", "kicker": "REGRAS DE APLICAÇÃO", "title": "Coerência sem virar template",
        "columns": [
            [b("Fazer", "Uma mensagem principal por tela", "Fotografia como prova", "Rosé em pontos controlados", "Verde vindo da pedra", "Espaço como sinal de qualidade", accent=EMERALD), b("Componentes", "Borda fina ou sombra curta, não ambos.", "Raio de 8-16 px.", "CTA primário grafite.", "Estados de foco visíveis.")],
            [b("Não fazer", "Faixas rosas repetidas", "Dourado como luxo automático", "Cards para todo conteúdo", "Eyebrow em toda seção", "Animação que esconde conteúdo", accent=RED), b("Governança", "Toda nova peça visual deve ser comparada à identidade existente e testada em mobile antes da aprovação.", accent=ROSE_DEEP)],
        ]
    },
    {
        "kind": "score", "section": "UX/UI", "title": "Heurísticas de experiência", "score": "28/40", "rating": "Boa experiência, conversão incompleta",
        "rows": [("Visibilidade",3,4,EMERALD),("Mundo real",3,4,PARAIBA),("Controle",3,4,PARAIBA),("Consistência",3,4,EMERALD),("Prevenção de erro",3,4,EMERALD),("Reconhecimento",3,4,PARAIBA),("Eficiência",2,4,AMBER),("Minimalismo",3,4,ROSE),("Recuperação",2,4,AMBER),("Ajuda",3,4,PARAIBA)],
        "blocks": [b("Destaques", "Produto claro", "Sacola informativa", "Foco e Escape nos drawers", "Feedback inline", accent=EMERALD), b("Fricções", "Busca desativada", "Catálogo básico", "Conta obrigatória", "Conteúdo provisório", accent=RED), b("Persona crítica", "Casey: mobile, uma mão, interrupções.", "Precisa de alvos 44 px e retomada de estado.", accent=PARAIBA), b("Meta", "Medir funil real antes de redesenhar em grande escala.", accent=ROSE_DEEP)]
    },
    {
        "kind":"screenshot", "section":"UX/UI", "title":"Home - identidade forte, produção incompleta", "subtitle":"A composição é distinta, mas a primeira tela depende de revelação e a página contém marcadores provisórios.", "image":"tmp/pdfs/site-screens/home-desktop.png",
        "findings":[
            {"level":"FORTE","title":"Direção visual","text":"Base branca/rosé, hierarquia editorial e navegação contida."},
            {"level":"P1","title":"Conteúdo provisório","text":"Foto em breve, exemplo e avaliações fictícias bloqueiam lançamento com confiança."},
            {"level":"P2","title":"Reveal frágil","text":"main.js adiciona .js antes de registrar IntersectionObserver; falha intermediária pode ocultar conteúdo."},
            {"level":"P2","title":"Busca desativada","text":"O ícone aparece, mas não entrega a expectativa criada."},
        ]
    },
    {
        "kind":"screenshot", "section":"UX/UI", "title":"Catálogo - simples demais para crescer", "subtitle":"Funciona com poucos SKUs; perde eficiência quando coleção, materiais e ocasiões aumentarem.", "image":"tmp/pdfs/site-screens/catalogo-desktop.png",
        "findings":[
            {"level":"FORTE","title":"Leitura limpa","text":"Preço, título e imagem seguem a identidade."},
            {"level":"P2","title":"Sem filtros e ordenação","text":"Adicionar categoria, material, pedra, preço, disponibilidade e ordem."},
            {"level":"P2","title":"Estado fora da URL","text":"Filtros futuros devem ser compartilháveis e sobreviver à navegação."},
            {"level":"P2","title":"H1 para H3","text":"Footer cria salto de heading nesta página; ajustar a hierarquia."},
        ]
    },
    {
        "kind":"screenshot", "section":"UX/UI", "title":"Produto - a superfície mais madura", "subtitle":"A página concentra desejo, preço, tamanho, confiança, frete e complementos com boa hierarquia.", "image":"tmp/pdfs/site-screens/produto-desktop.png",
        "findings":[
            {"level":"FORTE","title":"Compra clara","text":"Preço, parcela, tamanho e CTAs estão no primeiro viewport."},
            {"level":"FORTE","title":"Imagem crítica priorizada","text":"Imagem principal recebe dimensões e fetchPriority high."},
            {"level":"P1","title":"Avaliação provisória","text":"Estrelas com 'avaliações em breve' não devem chegar à produção."},
            {"level":"P2","title":"Tamanho e escala","text":"Adicionar guia de aro, medidas visuais e disponibilidade por variante."},
        ]
    },
    {
        "section":"UX/UI", "kicker":"SACOLA E CHECKOUT", "title":"O funil funciona, mas exige confiança extra",
        "columns":[
            [b("Sacola", "Quantidade e remoção", "Progresso para frete grátis", "CEP e cupom", "Resumo transparente", accent=EMERALD), b("Fricções", "Frete ainda simulado", "Embalagem de presente não configurável", "Cupom hardcoded", "Sem recuperação de carrinho", accent=AMBER)],
            [b("Checkout observado", "Ao avançar com item, a tela exige login dentro de checkout.html.", "O carrinho permanece, mas a mudança de contexto é forte.", accent=RED), b("Recomendação", "Testar guest checkout ou criação de conta pós-compra.", "Se conta for obrigatória, explicar o benefício antes da transição.", accent=ROSE_DEEP)],
        ], "decision":"Tratar autenticação como hipótese de conversão e medir abandono por etapa."
    },
    {
        "kind":"screenshot", "section":"UX/UI", "title":"Conta e autenticação - claras, ainda pouco orientadas", "subtitle":"Os formulários têm boa simplicidade e recuperação de senha, mas podem comunicar melhor benefício, segurança e continuidade.", "image":"tmp/pdfs/site-screens/login-desktop.png",
        "findings":[
            {"level":"FORTE","title":"Foco na tarefa","text":"Um formulário, labels visíveis e recuperação acessível."},
            {"level":"P2","title":"Benefício da conta","text":"Explicar histórico, rastreio, endereços e retomada da compra."},
            {"level":"P2","title":"Checkout interrompido","text":"Manter contexto visual da compra ao pedir autenticação."},
            {"level":"P3","title":"Alvos móveis","text":"Mostrar senha mede 44 x 32 px; aumentar altura para 44 px."},
        ]
    },
    {
        "kind":"screenshot", "section":"UX/UI", "title":"Admin - segurança forte, informação ainda operacional", "subtitle":"Login dedicado com 2FA é uma boa decisão; o painel precisa evoluir de CRUD para fila de trabalho e visão de negócio.", "image":"tmp/pdfs/site-screens/admin-login-desktop.png",
        "findings":[
            {"level":"FORTE","title":"Acesso separado","text":"Área administrativa não mistura navegação de cliente e exige aal2 no servidor."},
            {"level":"P1","title":"Status permissivo","text":"Admin pode marcar paid/refunded internamente sem ação correspondente no gateway."},
            {"level":"P2","title":"Sem visão resumo","text":"Faltam receita, pedidos, SLA, estoque baixo e exceções."},
            {"level":"P2","title":"Arquivo monolítico","text":"admin.html concentra marcação e grande lógica inline, elevando custo de manutenção."},
        ]
    },
    {
        "section":"UX/UI", "kicker":"ACESSIBILIDADE", "title":"Boa intenção, pequenos detalhes impedem excelência",
        "columns":[
            [b("Já existe", "Skip link", "Foco visível", "Drawers com role dialog", "Escape e retorno de foco", "aria-live na sacola", "Alt em todas as imagens estáticas", accent=EMERALD), b("WCAG 2.2", "Adotar alvo mínimo de 24 px AA e preferência prática de 44 px.", "Garantir foco não obscurecido por header e buy bar.", accent=PARAIBA)],
            [b("Achados", "Fechar aviso: cerca de 23 x 20 px.", "Ações de header: 42 px em mobile.", "Links de footer podem usar exceção de texto inline.", "Rosé claro falha para texto pequeno.", accent=RED), b("Validação", "Teclado completo", "VoiceOver/NVDA", "Zoom 200%", "Contraste automatizado", "Formulários com erro real")],
        ]
    },
    {
        "section":"UX/UI", "kicker":"RESPONSIVIDADE", "title":"Sem overflow, com alvos de toque a refinar",
        "columns":[
            [m("390 px", "viewport auditado sem rolagem horizontal"), b("Pontos fortes", "Header adaptativo", "Menu móvel", "Sticky buy bar no produto", "Grids colapsam", "Carrinho em drawer", accent=EMERALD)],
            [b("Ajustes", "Aumentar controles de 42 para 44-48 px.", "Dar área de toque maior ao fechar aviso.", "Breadcrumbs têm 20 px de altura.", "Testar 320, 360, 390, 768 e 1024 px.", accent=AMBER), b("Regra", "Não medir responsividade apenas por ausência de overflow; testar uso com polegar, teclado e texto ampliado.", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"UX/UI", "kicker":"ESTADOS E FEEDBACK", "title":"O sistema precisa de um catálogo explícito de estados",
        "columns":[
            [b("Componente", "Default", "Hover", "Focus-visible", "Pressed", "Disabled", "Loading", "Success", "Error"), b("Conteúdo", "Vazio", "Poucos itens", "Muitos itens", "Offline", "Timeout", "Permissão negada")],
            [b("Pagamentos", "Pendente", "Aprovado", "Rejeitado", "Cancelado", "Estornado", "Chargeback", accent=RED), b("Regra", "Nenhuma superfície nova é pronta sem estados de erro e recuperação documentados.", accent=EMERALD)],
        ]
    },
    {
        "kind":"flow", "section":"Front-end", "kicker":"ARQUITETURA DE INTERFACE", "title":"Fluxo de dados do front-end",
        "steps":[
            {"title":"HTML", "text":"Shells de página, SEO e conteúdo inicial."},
            {"title":"catalog.js", "text":"Conteúdo rico local e fallback de preços."},
            {"title":"Supabase REST", "text":"Merge assíncrono de preço, estoque e destaque."},
            {"title":"main.js / product-page.js", "text":"Render, eventos, carrinho, frete e drawers."},
            {"title":"auth.js / checkout.js", "text":"Sessão, endereços e invocação do pagamento."},
        ],
        "notes":[b("Contrato atual", "window.DRUZA_CATALOG, DRUZA_CATALOG_READY e DruzaAuth conectam módulos globais.", accent=PARAIBA), b("Próximo passo", "Introduzir módulos ES e testes sem mudar o comportamento.", accent=EMERALD)]
    },
    {
        "section":"Front-end", "kicker":"DÍVIDA TÉCNICA", "title":"Quatro extrações trazem clareza sem reescrita",
        "columns":[
            [b("1. Store do carrinho", "Estado, persistência, cálculo de apresentação e eventos."), b("2. Catálogo", "Repositório de produto, merge remoto e normalização.", accent=PARAIBA)],
            [b("3. UI shell", "Header, drawers, foco, notificações e navegação.", accent=ROSE), b("4. Admin", "Views de pedidos/produtos separadas de API, impressão e formatação.", accent=AMBER)],
        ], "decision":"Extrair por domínio com testes de caracterização; não dividir apenas por tamanho de arquivo."
    },
    {
        "section":"Front-end", "kicker":"DESIGN SYSTEM", "title":"Tokens bons, biblioteca ainda implícita",
        "columns":[
            [b("Fundação", "Cores semânticas", "Escala de espaço", "Fontes", "Container", "Raios", "Duração e easing", accent=EMERALD), b("Componentes existentes", "Button", "Product card", "Placeholder", "Drawer", "Form field", "Status badge", "Promo")],
            [b("Faltam contratos", "API de componente", "Estados obrigatórios", "Densidade admin", "Tabela e paginação", "Toast", "Dialog", "Skeleton", accent=AMBER), b("Artefato recomendado", "Criar uma página /styleguide.html no ambiente de desenvolvimento e snapshots visuais.", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"Front-end", "kicker":"FONTE DE VERDADE", "title":"Conteúdo e comércio ainda vivem em dois lugares",
        "columns":[
            [b("Código", "Imagem", "Descrição", "Galeria", "Tamanhos", "Material e medidas"), b("Banco", "Preço", "Ativo", "Em estoque booleano", "Destaque", accent=EMERALD)],
            [b("Risco", "Novo produto no admin pode aparecer sem conteúdo rico.", "Alterações precisam sincronizar código e banco.", "Páginas fixas e genérica podem divergir.", accent=RED), b("Direção", "Mover conteúdo de produto e mídia para banco/Storage quando o catálogo crescer; manter fallback versionado.", accent=ROSE_DEEP)],
        ], "decision":"Antes de CMS completo, documentar campos obrigatórios e bloquear publicação incompleta."
    },
    {
        "kind":"flow", "section":"Back-end", "kicker":"ARQUITETURA", "title":"Back-end serverless e orientado a políticas",
        "steps":[
            {"title":"Cliente autenticado", "text":"JWT do Supabase acompanha chamadas sensíveis."},
            {"title":"RLS", "text":"Perfis, endereços e pedidos limitados ao dono."},
            {"title":"Edge Functions", "text":"Validação de negócio e acesso administrativo."},
            {"title":"Service role", "text":"Somente após autenticação, admin e aal2."},
            {"title":"Auditoria", "text":"Ações administrativas gravadas em log."},
        ],
        "notes":[b("Força", "Modelo explícito de não confiar no navegador.", accent=EMERALD), b("Melhoria", "Padronizar wrappers atuais do Supabase e telemetria estruturada.", accent=PARAIBA)]
    },
    {
        "section":"Back-end", "kicker":"MODELO DE DADOS", "title":"Entidades corretas, estoque e eventos ainda rasos",
        "columns":[
            [b("Entidades", "profiles", "addresses", "orders", "order_items", "products", "admins", "admin_audit_log", accent=EMERALD), b("Boas decisões", "Snapshot em order_items", "FKs com cascade/set null", "Check de status", "Índices de relacionamento")],
            [b("Lacunas", "stock_qty e reserva", "product_variants", "coupons", "order_status_events", "returns", "media assets", accent=RED), b("Regra", "Estado operacional deve ser histórico, não apenas uma coluna sobrescrita.", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"Segurança", "kicker":"RLS E MFA", "title":"A camada mais madura do projeto",
        "columns":[
            [b("RLS", "Cliente lê e altera apenas seus dados.", "Produtos ativos têm leitura pública.", "Admin não recebe escrita direta no banco.", accent=EMERALD), b("MFA", "TOTP nativo do Supabase.", "require-admin valida JWT, tabela admins e aal2.", "Adulterar UI não concede privilégio.", accent=EMERALD)],
            [b("Hardening", "Adicionar recuperação operacional de fator.", "Alertar tentativas e falhas repetidas.", "Revisar permissões em migrations automatizadas.", accent=AMBER), b("Atenção", "Policies de insert em orders/order_items permitem escrita direta autenticada e contornam rate limit da função.", accent=RED)],
        ]
    },
    {
        "kind":"flow", "section":"Pagamentos", "kicker":"FLUXO SEGURO", "title":"Da sacola ao pedido pago",
        "steps":[
            {"title":"Checkout", "text":"Cliente envia slugs, quantidades, endereço e cupom."},
            {"title":"Revalidação", "text":"Função busca produtos ativos e recalcula preço, frete e desconto."},
            {"title":"Pedido pending", "text":"orders e order_items recebem snapshot."},
            {"title":"Preferência MP", "text":"Checkout Pro recebe itens e external_reference."},
            {"title":"Webhook", "text":"ID do pagamento é reconsultado com Access Token."},
            {"title":"Confirmação", "text":"Valor é comparado antes de atualizar status paid."},
        ],
        "notes":[b("Boa prática", "Reconsulta autenticada + conferência de valor reduzem confiança na notificação.", accent=EMERALD), b("Pendente", "Resolver divergência de HMAC e tornar assinatura bloqueante quando estável.", accent=AMBER)]
    },
    {
        "section":"Pagamentos", "kicker":"RISCOS DE DOMÍNIO", "title":"Dinheiro exige atomicidade e idempotência",
        "columns":[
            [b("P1 - transação", "Pedido é inserido, depois itens e preferência.", "Falha intermediária pode deixar pedido incompleto ou órfão.", accent=RED), b("P1 - duplicidade", "Cliques repetidos podem criar múltiplos pedidos e preferências.", "Adicionar idempotency key por tentativa.", accent=RED)],
            [b("P1 - estoque", "in_stock não reserva quantidade.", "Duas compras concorrentes podem vender a mesma unidade.", accent=RED), b("P2 - cupom", "Código e regra aparecem em múltiplos pontos.", "Mover para tabela e função única.", accent=AMBER)],
        ], "decision":"Criar RPC transacional para pedido + itens + reserva e chave idempotente antes de volume real."
    },
    {
        "section":"Back-end", "kicker":"ADMIN", "title":"Admin precisa proteger também a coerência operacional",
        "columns":[
            [b("Já protegido", "JWT", "Tabela admins", "aal2", "Rate limit amortecedor", "Log de auditoria", accent=EMERALD), b("Risco de status", "ALLOWED_STATUS valida valores, não transições.", "paid/refunded podem divergir do Mercado Pago.", accent=RED)],
            [b("Máquina de estados", "pending -> paid/canceled", "paid -> shipped/refunded", "shipped -> delivered/refunded", "Transições financeiras vêm do gateway."), b("Ações futuras", "Reembolso via workflow explícito", "Motivo obrigatório", "Confirmação forte", "Timeline imutável", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"Operação", "kicker":"OBSERVABILIDADE", "title":"Hoje há logs; falta um sistema de sinais",
        "columns":[
            [b("Eventos técnicos", "Erro da função", "Latência", "Rate limit", "Webhook rejeitado", "Pagamento divergente", "Falha de e-mail"), b("Eventos de negócio", "Pedido criado", "Pagamento aprovado", "Pedido atrasado", "Estoque baixo", "Reembolso", accent=PARAIBA)],
            [b("Stack mínima", "Logs estruturados com correlation id", "Alertas no Supabase", "Sentry ou equivalente", "Dashboard diário", accent=EMERALD), b("SLO inicial", "Checkout disponível 99,5%", "Webhook processado em até 5 min", "Pedido pago enviado em até 48h úteis")],
        ]
    },
    {
        "section":"Performance", "kicker":"CORE WEB VITALS", "title":"Boa base de assets, sem medição de campo",
        "columns":[
            [b("Metas oficiais", "LCP <= 2,5 s", "INP <= 200 ms", "CLS <= 0,1", "Avaliar p75 por dispositivo", accent=EMERALD), b("Já existe", "WebP", "Dimensões de imagem", "Font display swap", "Scripts defer nas vitrines", "DPR do canvas limitado")],
            [b("Melhorar", "srcset/sizes", "Preload seletivo das fontes críticas", "Reduzir canvas/animação no hero", "Cache longo para assets versionados", "RUM via web-vitals", accent=AMBER), b("Nota", "Não prometer nota Lighthouse sem hospedagem e rede reais.", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"SEO", "kicker":"DESCOBERTA ORGÂNICA", "title":"Fundação pronta, cobertura desigual",
        "columns":[
            [b("Já existe", "Titles e descrições na maioria", "Canonicals em 16 páginas", "Sitemap e robots", "Product JSON-LD", "Links crawláveis", accent=EMERALD), b("Auditoria", "3 páginas de pagamento sem description.", "11 páginas sem canonical.", "OG usa foto provisória em vez de asset dedicado.", accent=AMBER)],
            [b("Risco dinâmico", "Produto genérico injeta JSON-LD por JavaScript.", "Google recomenda dados de produto no HTML inicial para maior confiabilidade.", accent=RED), b("Roadmap", "Merchant Center", "Schema de entrega/devolução", "URLs canônicas por produto", "404 customizada", "Search Console")],
        ]
    },
    {
        "section":"Analytics", "kicker":"MENSURAÇÃO", "title":"GA4 está preparado, mas o funil ainda não existe",
        "columns":[
            [b("Eventos mínimos", "view_item_list", "select_item", "view_item", "add_to_cart", "view_cart", "begin_checkout", "add_shipping_info", "purchase", "refund", accent=EMERALD), b("Parâmetros", "item_id", "item_name", "item_category", "price", "quantity", "coupon", "transaction_id")],
            [b("Governança", "Consentimento e política atualizados", "Sem PII no GA4", "transaction_id deduplica purchase", "DebugView antes de produção", accent=AMBER), b("Dashboard", "Sessões -> PDP -> ATC -> checkout -> compra", "CVR, AOV, abandono, receita e recompra", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"Conteúdo", "kicker":"OPERAÇÃO EDITORIAL", "title":"Conteúdo precisa de um Definition of Ready",
        "columns":[
            [b("Produto pronto", "Nome e SKU", "Preço e estoque", "Material e acabamento", "Medidas e tamanhos", "4 fotos mínimas", "Alt text", "Prazo e troca"), b("Campanha pronta", "Objetivo", "Público", "Oferta", "Asset desktop/mobile", "UTM", "Data de expiração")],
            [b("Gate", "Sem 'foto em breve'", "Sem avaliação simulada", "Sem preço fictício", "Sem promessa não verificada", accent=RED), b("Fluxo", "Brief -> produção -> revisão de marca -> QA técnico -> publicação -> análise", accent=EMERALD)],
        ]
    },
    {
        "section":"Produto", "kicker":"MERCHANDISING", "title":"A vitrine deve responder intenção, não apenas categoria",
        "columns":[
            [b("Navegação", "Por categoria", "Por pedra", "Por material", "Por faixa de preço", "Por ocasião", "Mais presenteados"), b("Carrinho", "Kits", "Complete o look", "Embalagem", "Frete grátis acima de R$ 199", accent=EMERALD)],
            [b("Escada de valor", "Entrada: R$ 119-149", "Core: R$ 159-219", "Kits: R$ 299+", "Edições especiais: validar demanda", accent=PARAIBA), b("Teste", "Kit anel + brinco", "Presente até R$ 200", "Seleção Paraíba", "Mais vendidos")],
        ]
    },
    {
        "section":"Negócio", "kicker":"MODELO", "title":"Assinatura visual + presenteabilidade + operação confiável",
        "columns":[
            [b("Proposta de valor", "Prata com pedras verdes", "Estética editorial", "Preço acessível", "Pronta para presentear"), b("Receita", "Venda unitária", "Kits", "Upsell de embalagem", "Coleções e datas", "Recompra")],
            [b("Recursos-chave", "Fornecimento", "Fotografia", "Catálogo", "Pagamento", "Logística", "Atendimento"), b("Riscos", "Dependência de poucos assets", "Estoque sem quantidade", "Aquisição sem mensuração", "Operação manual", accent=RED)],
        ]
    },
    {
        "kind":"flow", "section":"Crescimento", "kicker":"FUNIL", "title":"Crescer medindo a passagem entre etapas",
        "steps":[
            {"title":"Alcance qualificado", "text":"Conteúdo, busca, creators e indicação."},
            {"title":"Sessão engajada", "text":"Marca compreendida e categoria explorada."},
            {"title":"Produto visto", "text":"Imagem, material, preço e tamanho avaliados."},
            {"title":"Adição à sacola", "text":"Intenção explícita e oportunidade de kit."},
            {"title":"Checkout iniciado", "text":"Conta, endereço, frete e pagamento."},
            {"title":"Compra e recompra", "text":"Receita, experiência, review e CRM."},
        ],
        "notes":[b("KPI por etapa", "CTR, PDP rate, ATC, checkout rate, purchase rate, AOV e repeat rate.", accent=EMERALD), b("Regra", "Não aumentar mídia antes de remover sinais de protótipo e instrumentar purchase.", accent=RED)]
    },
    {
        "section":"Crescimento", "kicker":"CRM", "title":"Sete automações cobrem o ciclo de relacionamento",
        "columns":[
            [b("Pré-compra", "Boas-vindas", "Abandono de navegação", "Abandono de carrinho", "Queda no checkout"), b("Pós-compra", "Confirmação", "Postagem e rastreio", "Como cuidar", "Pedido de avaliação", accent=EMERALD)],
            [b("Retenção", "Combinações após 30 dias", "Datas e aniversários", "Novas pedras", "Win-back 90/180 dias", accent=PARAIBA), b("Cuidado", "Consentimento", "Frequência", "Preferências", "Opt-out simples", "Sem disparo antes da operação suportar")],
        ]
    },
    {
        "section":"Benchmark", "kicker":"REFERÊNCIAS", "title":"Aprender padrões sem copiar identidades",
        "columns":[
            [b("Monica Vinader", "Mega-menu por material, estilo e ocasião.", "Serviços, garantia, personalização e membership.", accent=EMERALD), b("Mejuri", "Contagem de produtos, filtros, ordenação, material visível e quick-add.", accent=PARAIBA)],
            [b("Pandora", "Descoberta de presentes por destinatário, ocasião, tema e personalização.", accent=ROSE), b("Aplicação Druza", "Presentes por ocasião", "Filtros por pedra/material", "Kits", "Serviços e garantia", "Programa de relacionamento", accent=ROSE_DEEP)],
        ]
    },
    {
        "section":"Benchmark", "kicker":"MATRIZ DE REFERÊNCIAS", "title":"O que observar em outros sites",
        "columns":[
            [b("Informação", "Como categorias escalam", "Como material aparece", "Como filtros persistem", "Como gifts são descobertos"), b("Conversão", "Quick-add", "Frete e devolução", "Prova social", "Size guide", "Checkout guest")],
            [b("Operação", "Status e SLA", "Estoque baixo", "Bulk actions", "Timeline", "Auditoria"), b("Anti-referência", "Promoções invasivas", "Popups em sequência", "Luxo dourado genérico", "Card grids infinitos", "Copy clichê", accent=RED)],
        ]
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Home orientada por desejo e prova", "subtitle":"Preserva o hero editorial e adiciona uma sequência de decisão mais clara.", "device":"desktop",
        "sections":[{"label":"Hero: uma peça + promessa", "weight":2},{"label":"Categorias por intenção", "weight":1},{"label":"Bestsellers com prova", "weight":2},{"label":"Presente em 3 passos", "weight":1},{"label":"História + cuidados", "weight":1},{"label":"Review real + newsletter", "weight":1}],
        "notes":[{"title":"Acima da dobra","text":"Hero deve mostrar peça real, material e CTA primário sem depender de animação."},{"title":"Ordem","text":"Desejo -> navegação -> confiança -> presente -> história -> retenção."},{"title":"Prova","text":"Substituir placeholders por embalagem, reviews e fotos de uso."}],
        "hypothesis":"Uma home com prova real antes de conteúdo institucional aumenta ida ao produto e reduz dúvida de legitimidade."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Catálogo com descoberta progressiva", "subtitle":"Filtros aparecem quando há variedade, sem perder a limpeza editorial.", "device":"desktop",
        "sections":[{"label":"Título + contagem + sort", "weight":1},{"label":"Chips: pedra, material, preço", "weight":1},{"label":"Grid 3-4 colunas + quick-add", "weight":4},{"label":"Conteúdo SEO curto", "weight":1}],
        "notes":[{"title":"URL","text":"Filtros, sort e página ficam em query params."},{"title":"Cards","text":"Exibir nome, material, preço, selo e disponibilidade."},{"title":"Mobile","text":"Abrir filtros em sheet; manter sort acessível."}],
        "hypothesis":"Filtros por pedra e ocasião reduzem esforço sem criar complexidade antes de o catálogo justificar."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Produto com prova, escala e entrega", "subtitle":"A superfície atual é preservada e enriquecida nos pontos de incerteza.", "device":"desktop",
        "sections":[{"label":"Galeria: frente, detalhe, escala, uso", "weight":4},{"label":"Título + material + preço + review", "weight":1},{"label":"Tamanho + guia visual", "weight":1},{"label":"Prazo real + CTA", "weight":1},{"label":"Garantia, troca, cuidado", "weight":1}],
        "notes":[{"title":"Primeiro viewport","text":"Imagem, preço, variação, prazo e CTA."},{"title":"Confiança","text":"Reviews só quando reais; material e garantia explícitos."},{"title":"SEO","text":"Product/Offer no HTML inicial e URL canônica estável."}],
        "hypothesis":"Guia de tamanho + prazo real elevam add-to-cart mais do que adicionar mais texto editorial."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Sacola e checkout como um fluxo contínuo", "subtitle":"Dois wireframes compactos: drawer de decisão e checkout com conta opcional.", "device":"mobile",
        "sections":[{"label":"Sacola: item, qty, tamanho", "weight":2},{"label":"Frete grátis + CEP", "weight":1},{"label":"Embalagem e kit", "weight":1},{"label":"Total + CTA fixo", "weight":1},{"label":"Checkout: convidado / entrar", "weight":1},{"label":"Endereço + entrega", "weight":2},{"label":"Revisão + Mercado Pago", "weight":1}],
        "notes":[{"title":"Continuidade","text":"Não remover contexto da peça ao pedir login."},{"title":"Guest checkout","text":"Testar conta pós-compra ou autenticação por link."},{"title":"Recuperação","text":"Salvar estado e retomar após interrupção."}],
        "hypothesis":"Reduzir a quebra de autenticação aumenta begin_checkout -> purchase sem diminuir segurança."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Conta como central de acompanhamento", "subtitle":"A área deixa de ser arquivo de pedidos e vira apoio pós-compra.", "device":"mobile",
        "sections":[{"label":"Olá + próxima ação", "weight":1},{"label":"Pedido ativo + timeline", "weight":2},{"label":"Rastrear / suporte / troca", "weight":1},{"label":"Endereços", "weight":1},{"label":"Favoritos e combinações", "weight":2}],
        "notes":[{"title":"Prioridade","text":"Pedido ativo aparece antes do histórico."},{"title":"Serviço","text":"Troca e suporte partem do pedido correto."},{"title":"Retenção","text":"Favoritos e combinações entram após operação básica."}],
        "hypothesis":"Timeline e suporte contextual reduzem contatos manuais e melhoram confiança pós-compra."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Admin - visão geral por exceção", "subtitle":"O dashboard abre com aquilo que precisa de ação, não com uma lista neutra.", "device":"desktop",
        "sections":[{"label":"KPIs: receita, pedidos, ticket, CVR", "weight":1},{"label":"Alertas: pagos >48h, estoque, webhook", "weight":1},{"label":"Fila de hoje", "weight":2},{"label":"Top produtos + funil", "weight":2},{"label":"Atividade recente", "weight":1}],
        "notes":[{"title":"Hierarquia","text":"Exceções e SLA antes de métricas vaidosas."},{"title":"Ações","text":"Cada alerta abre uma fila filtrada."},{"title":"Fonte","text":"Edge Function agregada e queries indexadas."}],
        "hypothesis":"Uma visão por exceção reduz pedidos esquecidos e tempo diário de operação."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Admin - fila de pedidos e SLA", "subtitle":"A lista vira uma ferramenta de processamento em lote.", "device":"desktop",
        "sections":[{"label":"Filtros salvos + busca", "weight":1},{"label":"Abas: pagar, separar, enviar, exceções", "weight":1},{"label":"Tabela: cliente, total, SLA, status", "weight":3},{"label":"Bulk: etiqueta, status, exportar", "weight":1},{"label":"Drawer de detalhe + timeline", "weight":2}],
        "notes":[{"title":"SLA","text":"Tempo desde paid visível e ordenável."},{"title":"Bulk","text":"Seleção explícita, preview e confirmação."},{"title":"Status","text":"Transições válidas, não lista livre."}],
        "hypothesis":"Filas por estágio e ações em lote reduzem erro operacional sem automatizar cedo demais."
    },
    {
        "kind":"wireframe", "section":"Wireframes", "title":"Admin - produto como conteúdo + estoque", "subtitle":"O CRUD evolui para publicação completa e segura.", "device":"desktop",
        "sections":[{"label":"Status de publicação", "weight":1},{"label":"Mídia e alt text", "weight":2},{"label":"Conteúdo, material, medidas", "weight":2},{"label":"Variantes + estoque", "weight":2},{"label":"Preço, promoção e SEO", "weight":1}],
        "notes":[{"title":"Gate","text":"Publicar somente quando campos e fotos obrigatórios estiverem completos."},{"title":"Variações","text":"Estoque por tamanho com decremento atômico."},{"title":"Preview","text":"Visualizar PDP desktop/mobile antes de salvar."}],
        "hypothesis":"Centralizar conteúdo e comércio elimina divergência entre catalog.js, banco e páginas fixas."
    },
    {
        "section":"Dashboard", "kicker":"KPI TREE", "title":"Um painel que conecta experiência e operação",
        "columns":[
            [b("Receita", "Receita líquida", "Pedidos pagos", "Ticket médio", "Itens por pedido", "Desconto e frete"), b("Funil", "PDP / sessão", "Add-to-cart", "Begin checkout", "Purchase", "Abandono")],
            [b("Cliente", "Novos x recorrentes", "Recompra 90 dias", "LTV inicial", "Avaliações", "Suporte"), b("Operação", "Pago -> enviado", "Pedidos >48h", "Webhook pendente", "Estoque baixo", "Reembolso", accent=RED)],
        ], "decision":"Começar com 8 KPIs acionáveis e adicionar métricas apenas quando houver decisão associada."
    },
    {
        "kind":"matrix", "section":"Roadmap", "title":"Impacto x esforço", "subtitle":"Priorizar produção, integridade financeira e mensuração antes de novas superfícies.",
        "items":[
            {"id":"A","label":"Fechar conteúdo real","impact":.93,"effort":.20,"level":"P1"},
            {"id":"B","label":"Deploy + credenciais","impact":.96,"effort":.28,"level":"P1"},
            {"id":"C","label":"GA4 e funil","impact":.82,"effort":.26,"level":"P1"},
            {"id":"D","label":"Transação/idempotência","impact":.91,"effort":.58,"level":"P1"},
            {"id":"E","label":"Testes críticos","impact":.86,"effort":.52,"level":"P1"},
            {"id":"F","label":"Estoque numérico","impact":.77,"effort":.60,"level":"P2"},
            {"id":"G","label":"Filtros catálogo","impact":.55,"effort":.42,"level":"P2"},
            {"id":"H","label":"Dashboard admin","impact":.61,"effort":.56,"level":"P2"},
            {"id":"I","label":"CMS completo","impact":.68,"effort":.85,"level":"IDEIA"},
            {"id":"J","label":"Framework","impact":.22,"effort":.94,"level":"IDEIA"},
        ]
    },
    {
        "kind":"timeline", "section":"Roadmap", "kicker":"0-30 DIAS", "title":"Estabilizar e publicar com confiança", "subtitle":"Objetivo: remover sinais de protótipo e criar uma linha de base confiável.", "step_gap":88,
        "items":[
            {"title":"Fechar conteúdo e fotografia", "text":"Remover 52 marcadores provisórios; validar preço, material, medidas, review e embalagem.", "meta":"Impacto alto - esforço médio - dono + conteúdo", "color":RED},
            {"title":"Configurar produção", "text":"Domínio, hosting, MP produção, ALLOWED_ORIGIN, redirects e backups.", "meta":"Impacto crítico - checklist de produção", "color":RED},
            {"title":"Instrumentar GA4", "text":"view_item, add_to_cart, begin_checkout, purchase e transaction_id.", "meta":"Impacto alto - esforço baixo", "color":EMERALD},
            {"title":"Teste de fumaça automatizado", "text":"Navegação, catálogo, carrinho, login e callbacks de pagamento.", "meta":"Impacto alto - esforço médio", "color":PARAIBA},
            {"title":"Acessibilidade rápida", "text":"Alvos 44 px, contraste rosé, headings, teclado e zoom.", "meta":"Impacto médio - esforço baixo", "color":ROSE},
        ]
    },
    {
        "kind":"timeline", "section":"Roadmap", "kicker":"31-60 DIAS", "title":"Endurecer dinheiro, dados e operação", "subtitle":"Objetivo: reduzir risco financeiro e trabalho manual após o lançamento.", "step_gap":88,
        "items":[
            {"title":"Pedido transacional e idempotente", "text":"RPC para order + items + reserva; compensação de preferência; chave por tentativa.", "meta":"P1 - arquitetura crítica", "color":RED},
            {"title":"Estoque numérico", "text":"stock_qty, limite baixo e decremento atômico por pagamento.", "meta":"P1 antes de escala", "color":RED},
            {"title":"Máquina de status", "text":"Transições válidas, timeline e eventos financeiros vindos do gateway.", "meta":"P1 coerência operacional", "color":AMBER},
            {"title":"Observabilidade", "text":"Logs estruturados, correlation id, alertas e dashboard de exceções.", "meta":"P2 - operação", "color":PARAIBA},
            {"title":"Frete e e-mail", "text":"Escolher gateway real; confirmação e postagem com templates aprovados.", "meta":"P2 - depende de fornecedores", "color":ROSE},
        ]
    },
    {
        "kind":"timeline", "section":"Roadmap", "kicker":"61-90 DIAS", "title":"Otimizar conversão com dados reais", "subtitle":"Objetivo: transformar métricas em mudanças controladas de UX e merchandising.", "step_gap":88,
        "items":[
            {"title":"Dashboard de funil", "text":"Sessão -> PDP -> ATC -> checkout -> purchase por canal e dispositivo.", "meta":"Base para experimentos", "color":EMERALD},
            {"title":"Catálogo evoluído", "text":"Filtros por pedra/material/preço, sort e URL state.", "meta":"P2 - validar volume de SKUs", "color":PARAIBA},
            {"title":"Guest checkout test", "text":"Comparar conta obrigatória com criação pós-compra.", "meta":"Experimento de conversão", "color":ROSE},
            {"title":"Kits e presente", "text":"Kit Paraíba, até R$ 200 e embalagem selecionável.", "meta":"AOV e frete grátis", "color":ROSE_DEEP},
            {"title":"CRM mínimo", "text":"Boas-vindas, carrinho, confirmação, rastreio e review.", "meta":"Consentimento e frequência", "color":AMBER},
        ]
    },
    {
        "kind":"timeline", "section":"Roadmap", "kicker":"12 MESES", "title":"Evoluir somente onde a operação pressionar", "subtitle":"O horizonte anual organiza dependências sem assumir que toda ideia precisa ser construída.", "step_gap":77,
        "items":[
            {"title":"Q1 - produção medida", "text":"Conteúdo real, deploy, analytics, testes e hardening financeiro.", "color":RED},
            {"title":"Q2 - operação escalável", "text":"Estoque, status, e-mail, frete, dashboard e bulk actions.", "color":AMBER},
            {"title":"Q3 - catálogo como plataforma", "text":"CMS, Storage, variantes, cupons, promoção e SEO no HTML inicial.", "color":PARAIBA},
            {"title":"Q4 - retenção e inteligência", "text":"CRM, clientes, cohorts, recompra, personalização e previsão simples.", "color":EMERALD},
            {"title":"Gate de arquitetura", "text":"Reavaliar framework/SSR apenas com evidência de gargalo, equipe ou SEO.", "color":ROSE_DEEP},
            {"title":"Gate de negócio", "text":"Não automatizar fluxo que ainda muda semanalmente.", "color":ROSE},
        ]
    },
    {
        "section":"Qualidade", "kicker":"RISCOS E TESTES", "title":"O que pode falhar e como detectar cedo",
        "columns":[
            [b("Risco crítico", "Preço divergente", "Pedido duplicado", "Webhook perdido", "Estoque negativo", "Status incoerente", "Secret exposto", accent=RED), b("Testes", "Unit: cálculos e estados", "Integration: RLS e funções", "Contract: Mercado Pago", "E2E: compra teste", "Visual: páginas-chave")],
            [b("Risco de experiência", "Hero invisível", "Tamanho não selecionado", "Carrinho perdido", "Erro sem recuperação", "Touch target pequeno", accent=AMBER), b("Cadência", "PR: lint + unit + smoke", "Diário: alertas", "Semanal: funil e operação", "Release: E2E pagamento")],
        ]
    },
    {
        "section":"Operação", "kicker":"DEFINITION OF DONE", "title":"Pronto significa publicável, observável e reversível",
        "columns":[
            [b("Produto digital", "Requisito e estado definidos", "Desktop/mobile", "Teclado e contraste", "Loading/error/vazio", "Analytics", "Teste", "Rollback"), b("Fornecedor", "Brief com objetivo e formato", "Cores e logo oficiais", "Direitos de uso", "Naming", "Prazo e revisão")],
            [b("Release", "Config revisada", "Secrets fora do repo", "Migração testada", "Backup", "Smoke", "Monitoramento", accent=EMERALD), b("Aprovação", "Dev: integridade", "Marca: coerência", "Operação: executabilidade", "Dono: decisão comercial", accent=ROSE_DEEP)],
        ], "decision":"Nenhuma entrega entra em produção apenas porque parece correta no navegador do dev."
    },
    {
        "kind":"sources", "section":"Fontes", "title":"Referências e próximo movimento", "subtitle":"A auditoria combina evidências do repositório, observação do site renderizado e documentação oficial atual consultada em 11 de julho de 2026.",
        "closing":"O próximo movimento recomendado é executar o plano de 30 dias. Ele fecha conteúdo, produção, mensuração e testes sem dispersar a equipe em uma reescrita prematura."
    },
]


# Revisão editorial v2: títulos mais diretos e subtítulos mais curtos.
TITLE_REVISIONS = {
    2: "Guia único para marca e produto",
    3: "Cinco estados de trabalho",
    7: "Meta: desejo rápido, compra segura",
    9: "Stack simples, complexidade crescente",
    10: "Evolução do produto",
    11: "Mapa das 27 páginas",
    12: "Capacidades já entregues",
    14: "Posicionamento da marca",
    15: "Três ocasiões de compra",
    16: "Jornada até a recompra",
    17: "Tom de voz",
    18: "Logo e cores",
    19: "Tipografia e fotografia",
    20: "Regras visuais",
    21: "Avaliação de UX",
    22: "Home: forte, mas incompleta",
    23: "Catálogo: faltam filtros",
    24: "Produto: a página mais madura",
    25: "Checkout: funcional, com atrito",
    26: "Conta: simples, pouco orientada",
    27: "Admin: seguro, pouco gerencial",
    28: "Acessibilidade: ajustes necessários",
    29: "Mobile: ajustar alvos de toque",
    30: "Estados da interface",
    32: "Plano de modularização",
    33: "Tokens e componentes",
    34: "Catálogo: duas fontes de conteúdo",
    35: "Arquitetura do back-end",
    36: "Dados: estoque e eventos incompletos",
    37: "Segurança: principal ponto forte",
    38: "Fluxo de pagamento",
    39: "Pedidos: transação e idempotência",
    40: "Admin: regras de status",
    41: "Observabilidade",
    42: "Performance",
    43: "SEO",
    44: "Analytics: falta ativar o funil",
    45: "Critérios para publicar conteúdo",
    46: "Merchandising por intenção",
    47: "Estratégia comercial",
    48: "Funil e KPIs",
    49: "Automações de relacionamento",
    50: "Benchmarks: aprender sem copiar",
    51: "O que aproveitar dos benchmarks",
    60: "Dashboard executivo",
    61: "Prioridades por impacto e esforço",
    62: "0-30 dias: lançar com segurança",
    63: "31-60 dias: proteger operação e receita",
    64: "61-90 dias: otimizar conversão",
    65: "12 meses: evoluir com evidência",
    66: "Riscos e testes",
    67: "Definition of Done",
    68: "Referências e próximo passo",
}

SUBTITLE_REVISIONS = {
    2: "Marca, experiência, tecnologia e prioridades em um só guia.",
    3: "Cada item recebe estado, responsável e evidência.",
    7: "A cliente entende a marca, escolhe a peça e compra sem ruído.",
    26: "Formulários simples, com pouca orientação sobre benefício e segurança.",
    27: "O 2FA é sólido. O painel ainda precisa orientar o trabalho diário.",
    68: "Fontes oficiais consultadas em 11 de julho de 2026.",
}

for page_number, revised_title in TITLE_REVISIONS.items():
    PAGES[page_number - 1]["title"] = revised_title

for page_number, revised_subtitle in SUBTITLE_REVISIONS.items():
    PAGES[page_number - 1]["subtitle"] = revised_subtitle


assert len(PAGES) == 68, f"Esperadas 68 páginas, encontradas {len(PAGES)}"

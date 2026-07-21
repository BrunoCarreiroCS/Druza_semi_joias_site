/* =====================================================================
   DRUZA — admin-help.js
   Camada de ajuda do painel administrativo.

   Três peças, todas dentro de #content — ou seja, só existem depois que
   o painel confirmou administradora + 2FA. Nenhum texto daqui aparece
   para cliente nem para visitante da loja.

     1. Ícone (i) ao lado de rótulos e títulos, que abre um balão curto
        explicando aquele campo. Fecha no X, no Esc ou clicando fora.
     2. Cartão-tutorial no topo de cada seção, com o passo a passo da
        tarefa. Pode ser dispensado; a escolha fica lembrada no
        navegador.
     3. Botão "Ajuda" na barra superior, que reabre o tutorial da seção
        em que ela estiver — para o cartão dispensado nunca virar
        conhecimento perdido.

   O conteúdo mora todo aqui, num único lugar, em português comum. Se um
   campo novo aparecer no formulário sem entrada aqui, ele simplesmente
   não ganha ícone — nada quebra.
   ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // 1) Tutoriais de cada seção
  // ------------------------------------------------------------------
  var GUIAS = {
    overview: {
      titulo: 'Visão geral',
      resumo: 'A tela inicial do painel. Em um olhar, ela responde três perguntas do seu dia a dia: quanto vendi, o que falta enviar e o que está acabando no estoque.',
      passos: [
        'No topo, os números de vendas de hoje, da semana e do mês — só contam os pedidos já pagos.',
        'O quadro rosa "Pedidos aguardando envio" é o que pede ação sua: são vendas pagas que ainda precisam ser postadas.',
        'Os quadros amarelos avisam sobre peças esgotadas ou com poucas unidades sobrando.',
        'Mais abaixo, quatro listas resumem o que está pendente. Cada uma tem um link — "Ver estoque", "Ver envios" — que leva direto para a tela certa.'
      ],
      dica: 'Os três botões logo abaixo do título levam direto às tarefas mais comuns: cadastrar uma peça nova, registrar entrada de estoque e ver os pedidos aguardando envio.'
    },

    orders: {
      titulo: 'Pedidos',
      resumo: 'A lista completa de vendas da loja, sempre com a mais recente no topo.',
      passos: [
        'Para achar um pedido específico, busque por nome da cliente, e-mail, telefone ou pelo número do pedido — os 8 caracteres mostrados em cada linha.',
        'Combine os filtros de situação e de período para fechar o mês: por exemplo, "Pago" mais o intervalo de datas que você quiser.',
        'Clique em "Ver detalhes" para abrir a ficha completa: dados da cliente, endereço, itens com foto, forma de pagamento e a linha do tempo do pedido.',
        '"Baixar planilha" exporta a lista que está na tela num arquivo que abre direto no Excel.'
      ],
      dica: 'O painel não altera o status de pagamento. Pago, cancelado e estornado são decididos automaticamente pelo Mercado Pago — aqui você só cuida da separação e do envio.'
    },

    products: {
      titulo: 'Produtos',
      resumo: 'O catálogo da loja: toda peça que você cadastra aqui passa a existir no site.',
      passos: [
        'Clique em "+ Novo produto" para começar um cadastro.',
        'Nome e preço são os únicos campos obrigatórios — o resto pode ficar em branco e ser completado depois, sem pressa.',
        'Ao salvar, a peça aparece na loja automaticamente, desde que a situação esteja como "À venda".',
        'Use "Duplicar" quando uma peça nova for parecida com outra já cadastrada — só muda a pedra, o tamanho, o preço.',
        '"Tirar da loja" esconde a peça da vitrine sem apagar nada; "Arquivar" encerra a peça de vez, mas preserva o histórico.'
      ],
      dica: 'Nenhum produto é excluído de verdade, porque pedidos antigos continuam apontando para ele. Por isso existem as opções "tirar da loja" e "arquivar" em vez de um botão de apagar.'
    },

    inventory: {
      titulo: 'Estoque',
      resumo: 'O lugar onde a quantidade de cada peça muda — e onde fica registrado, para sempre, o motivo de cada mudança.',
      passos: [
        'Escolha o produto e diga o que aconteceu com ele: chegou mercadoria nova, uma peça quebrou, uma cliente devolveu, ou você acabou de contar a prateleira.',
        'Informe a quantidade e confirme — o novo saldo é calculado sozinho, sem você precisar fazer conta.',
        'Toda saída de estoque (perda, avaria, ajuste para menos) pede um motivo. É um campo obrigatório de propósito.',
        'A lista "Estoque baixo", ao lado, mostra o que está acabando. O botão "Repor" já leva o produto certo para o formulário.',
        'Logo abaixo fica o histórico: cada linha mostra uma movimentação, com o saldo de antes e de depois.'
      ],
      dica: 'A quantidade de um produto só muda por aqui — nunca na tela de Produtos. É assim de propósito: se toda alteração de estoque passa pelo histórico, o número nunca muda sem uma explicação por trás.'
    },

    categories: {
      titulo: 'Categorias',
      resumo: 'As categorias que organizam os filtros da loja — Anéis, Brincos, Colares e as demais.',
      passos: [
        'Digite o nome e clique em "Criar categoria" — o endereço dela no site é gerado sozinho, a partir do nome.',
        'A "ordem de exibição" decide a sequência dos filtros na loja: quanto menor o número, mais cedo a categoria aparece.',
        'Para tirar uma categoria dos filtros sem apagar nada, desmarque a opção "Ativa".',
        'Para editar uma categoria existente, clique em "Editar" na lista ao lado do formulário.'
      ],
      dica: 'Uma categoria com produtos dentro não pode simplesmente ser excluída. Antes disso, o painel pergunta para qual outra categoria mover essas peças.'
    },

    customers: {
      titulo: 'Clientes',
      resumo: 'Uma visão de quem já comprou, montada automaticamente a partir dos pedidos — não é um cadastro à parte.',
      passos: [
        'Busque por nome, e-mail ou telefone para encontrar uma cliente específica.',
        'A tabela mostra, para cada uma, quantos pedidos já fez, quanto já gastou no total e quando comprou pela última vez.',
        'Clique em "Ver pedidos" para abrir a tela de Pedidos já filtrada só com o histórico dessa cliente.'
      ],
      dica: 'Estes são dados pessoais reais das suas clientes. Eles existem para você atender e organizar o envio — evite usá-los para enviar mensagens que a pessoa não pediu.'
    },

    shipping: {
      titulo: 'Envios',
      resumo: 'A fila de postagem da loja: pedidos já pagos que ainda precisam sair para a cliente.',
      passos: [
        'A tela já abre filtrada nos pedidos pagos que ainda não têm código de rastreio — ou seja, no que falta fazer agora.',
        'Clique em "Adicionar rastreio", escolha a transportadora e cole o código de rastreamento.',
        'Ao confirmar em "Salvar e marcar como enviado", a data de postagem é registrada automaticamente.',
        'Antes da primeira impressão, clique em "Remetente" e preencha seu endereço uma única vez — ele fica salvo para as próximas.',
        '"Imprimir etiquetas" gera, para cada pedido, uma página com a etiqueta de envio, a lista de separação e a declaração de conteúdo.'
      ],
      dica: 'Para códigos dos Correios (duas letras, nove números e "BR" no final), o link de rastreamento é gerado automaticamente — não precisa procurar em outro site.'
    },

    audit: {
      titulo: 'Histórico',
      resumo: 'O registro completo de tudo que já foi feito no painel: quem fez, o que mudou e quando aconteceu.',
      passos: [
        'A lista aparece sempre da ação mais recente para a mais antiga.',
        'Use-a para conferir depois: quem alterou um preço, quem deu baixa num estoque, em que momento um rastreio foi cadastrado.'
      ],
      dica: 'Este histórico é permanente e não pode ser editado ou apagado pelo painel — de propósito. Um registro que pode ser alterado deixa de servir como registro.'
    }
  };

  // ------------------------------------------------------------------
  // 2) Explicações campo a campo (ícone "i")
  // ------------------------------------------------------------------
  var DICAS = {
    // ---- Produtos ----
    'produto-basico': {
      titulo: 'O básico',
      texto: 'Só o nome e o preço são obrigatórios para a peça entrar na loja. Você pode salvar assim e completar o resto depois.'
    },
    'produto-preco': {
      titulo: 'Preço de venda',
      texto: 'É quanto a cliente paga. Digite com vírgula, como você fala: 189,00. Este é o valor que a loja mostra e que o pagamento cobra — os dois nunca ficam diferentes.'
    },
    'produto-categoria': {
      titulo: 'Categoria',
      texto: 'Define em qual filtro a peça aparece na loja (Anéis, Brincos…). Se faltar uma categoria, crie na seção Categorias e volte aqui.'
    },
    'produto-situacao': {
      titulo: 'Situação',
      texto: '"À venda" coloca a peça na loja. "Fora da loja" some da vitrine mas guarda tudo — bom para peça que acabou e vai voltar. "Arquivado" encerra a peça de vez, sem apagar os pedidos antigos dela.'
    },
    'produto-destaque': {
      titulo: 'Destaque na página inicial',
      texto: 'Marca a peça para aparecer no bloco "As favoritas da Druza", logo na primeira página do site. Use em poucas peças por vez, senão deixa de ser destaque.'
    },
    'produto-fotos': {
      titulo: 'Fotos',
      texto: 'A primeira foto é a que a cliente vê no catálogo — escolha a melhor. Use "Tornar principal" para trocar e as setas para reordenar. Se a peça ficar sem foto, a loja mostra um selo "Foto em breve" no lugar.',
      passos: [
        'Clique em "Escolher fotos" e selecione uma ou várias de uma vez.',
        'Espere o envio terminar (aparece "Enviando foto 1 de 3…").',
        'Escreva no campo abaixo de cada foto o que ela mostra. Isso ajuda quem não enxerga bem e ajuda o Google a entender a peça.'
      ]
    },
    'produto-descricao': {
      titulo: 'Descrição',
      texto: 'O resumo curto aparece logo abaixo do nome. A descrição completa aparece mais para baixo na página, para quem quer saber mais. Escreva como você contaria para uma cliente na loja.'
    },
    'produto-caracteristicas': {
      titulo: 'Características da peça',
      texto: 'Viram a "ficha técnica" na página do produto. Preencha só o que fizer sentido para aquela peça — um colar não precisa de aro, um anel não precisa de comprimento. Campo em branco não aparece no site.'
    },
    'produto-tamanhos': {
      titulo: 'Tamanhos',
      texto: 'Separe por vírgula: 14, 16, 18, 20. Com dois ou mais, a loja mostra os botões de tamanho para a cliente escolher.',
      aviso: 'O estoque é da peça inteira, não de cada tamanho. Se você precisa controlar quantos tem de cada aro separadamente, cadastre cada tamanho como um produto ("Anel Paraíba aro 16").'
    },
    'produto-estoque-inicial': {
      titulo: 'Quantidade inicial',
      texto: 'Quantas peças você tem agora. Este campo só aparece no cadastro. Depois que o produto existe, a quantidade muda pela seção Estoque — assim toda mudança fica registrada com data e motivo.'
    },
    'produto-estoque-minimo': {
      titulo: 'Avisar quando o estoque chegar em',
      texto: 'Quando a quantidade chegar nesse número ou menos, a peça aparece na lista de "Estoque baixo" da Visão geral e da seção Estoque. Deixe 0 se não quiser aviso.',
      passos: ['Peça que você repõe fácil: deixe 1 ou 2.', 'Peça que demora a chegar do fornecedor: use um número maior, para dar tempo de pedir mais.']
    },
    'produto-promo': {
      titulo: 'Preço promocional',
      texto: 'O preço com desconto. Precisa ser menor que o preço de venda. Enquanto estiver preenchido, é ele que a loja cobra, e a peça ganha o selo "Promoção" com o preço antigo riscado.',
      passos: [
        'Deixe as datas em branco para a promoção valer a partir de agora, até você tirar.',
        'Preencha as datas para a promoção começar e terminar sozinha (Dia das Mães, Black Friday).'
      ]
    },
    'produto-preco-anterior': {
      titulo: 'Preço anterior (o "de")',
      texto: 'Aparece riscado ao lado do preço, para mostrar a diferença. Só use se a peça realmente já foi vendida por esse valor — anunciar um preço "de" que nunca existiu é propaganda enganosa.'
    },
    'produto-custo': {
      titulo: 'Custo da peça',
      texto: 'Quanto você pagou por ela. Serve só para o cálculo de margem aqui ao lado. Este valor nunca aparece no site, nem para a cliente.'
    },
    'produto-estoque-precos': {
      titulo: 'Estoque e preços especiais',
      texto: 'Aqui ficam a quantidade, o aviso de estoque baixo, as promoções e o custo. Tudo opcional: uma peça sem promoção e sem custo funciona perfeitamente.'
    },
    'produto-endereco-seo': {
      titulo: 'Endereço no site e busca',
      texto: 'Esta parte inteira é opcional — o sistema preenche sozinho a partir do nome da peça. Mexa só se souber o que quer mudar.'
    },
    'produto-slug': {
      titulo: 'Endereço no site',
      texto: 'É o final do link da peça: druza.com.br/produto.html?slug=anel-coracao-esmeralda. Deixe em branco que ele é criado a partir do nome.',
      aviso: 'Depois que a peça for vendida pelo menos uma vez, este endereço não pode mais mudar — os pedidos antigos apontam para ele.'
    },
    'produto-sku': {
      titulo: 'Código interno (SKU)',
      texto: 'Um código curto só seu, para achar a peça na gaveta ou na planilha do fornecedor. Deixe em branco que o sistema gera um. Não pode repetir entre produtos.'
    },
    'produto-colecao': {
      titulo: 'Coleção',
      texto: 'Agrupa peças de um mesmo lançamento ou campanha: "Verão 2026", "Dia das Mães". Diferente de categoria — uma coleção pode ter anéis e brincos juntos.'
    },
    'produto-tags': {
      titulo: 'Etiquetas',
      texto: 'Palavras soltas separadas por vírgula: presente, lançamento, delicado. Ajudam você a reencontrar a peça depois na busca do painel.'
    },

    // ---- Estoque ----
    'estoque-movimentacao': {
      titulo: 'Registrar movimentação',
      texto: 'Todo lugar onde a quantidade de uma peça muda. Escolha o produto, diga o que aconteceu e confirme — o novo saldo é calculado sozinho.'
    },
    'estoque-tipo': {
      titulo: 'O que aconteceu?',
      texto: 'Escolher o tipo certo é o que faz o histórico servir para alguma coisa depois.',
      passos: [
        'Entrada de mercadoria: chegou peça nova do fornecedor.',
        'Devolução de cliente / Troca: a peça voltou para você.',
        'Perda: sumiu, não achou mais.',
        'Peça danificada: quebrou, riscou, não dá para vender.',
        'Ajuste para mais / para menos: correção pontual que não se encaixa nos outros.',
        'Corrigir para a quantidade contada: você contou a prateleira e o sistema estava errado.'
      ],
      aviso: 'Venda e reserva não aparecem nesta lista porque o sistema registra sozinho, quando a cliente compra.'
    },
    'estoque-quantidade': {
      titulo: 'Quantidade',
      texto: 'Quantas peças entraram ou saíram. Na opção "Corrigir para a quantidade contada" é diferente: aí você digita o total que contou na prateleira, e o sistema descobre a diferença.'
    },
    'estoque-motivo': {
      titulo: 'Motivo',
      texto: 'Uma frase curta explicando. Obrigatório quando a peça sai do estoque (perda, danificada, ajuste para menos): estoque que some sem explicação vira mistério três meses depois.'
    },
    'estoque-custo': {
      titulo: 'Custo por peça e fornecedor',
      texto: 'Opcionais, e só aparecem na entrada de mercadoria. O custo informado aqui atualiza o custo do produto e entra no cálculo de margem.'
    },
    'estoque-baixo': {
      titulo: 'Estoque baixo',
      texto: 'Peças que chegaram no limite que você definiu em "Avisar quando o estoque chegar em". O botão "Repor" já preenche o formulário ao lado com aquele produto.'
    },
    'estoque-historico': {
      titulo: 'Histórico de movimentações',
      texto: 'O extrato do estoque: cada linha mostra o que aconteceu, quanto mudou, qual era o saldo antes e depois, e quem fez.',
      aviso: 'Nenhuma linha daqui pode ser apagada ou corrigida. Se lançou errado, faça um novo lançamento no sentido contrário explicando o motivo — é assim que se corrige um registro sem apagar a história.'
    },

    // ---- Categorias ----
    'categoria-form': {
      titulo: 'Nova categoria',
      texto: 'Categorias são os filtros que a cliente usa na loja. Digite o nome e clique em criar — o resto é opcional.'
    },
    'categoria-superior': {
      titulo: 'Categoria superior',
      texto: 'Coloca esta categoria dentro de outra, por exemplo "Argolas" dentro de "Brincos". Deixe em "Nenhuma" para ela ficar no primeiro nível.'
    },
    'categoria-ordem': {
      titulo: 'Ordem de exibição',
      texto: 'Define a sequência dos filtros na loja: número menor aparece primeiro. Use de 10 em 10 (10, 20, 30) para conseguir encaixar uma categoria no meio depois sem renumerar tudo.'
    },
    'categoria-lista': {
      titulo: 'Categorias cadastradas',
      texto: 'O número ao lado de cada uma é quantos produtos ela tem. Categoria com produtos só pode ser excluída depois de escolher para onde mover as peças.'
    },

    // ---- Pedidos e envios ----
    'pedidos-busca': {
      titulo: 'Buscar pedido',
      texto: 'Aceita nome da cliente, e-mail, telefone ou o número do pedido (os 8 caracteres mostrados na lista). A busca procura no banco inteiro, não só na página aberta.'
    },
    'pedidos-planilha': {
      titulo: 'Baixar planilha',
      texto: 'Salva os pedidos que estão na tela num arquivo CSV, que abre no Excel. Filtre antes por período ou situação para baixar só o que interessa.'
    },
    'envios-como': {
      titulo: 'Como funciona esta tela',
      texto: 'É a sua fila de postagem. Ela já abre mostrando os pedidos pagos que ainda não têm rastreio — ou seja, o que precisa sair hoje.'
    },
    'envios-remetente': {
      titulo: 'Remetente',
      texto: 'Seu nome, documento e endereço, que saem impressos na etiqueta. Preencha uma vez; fica salvo neste computador para as próximas impressões.'
    },
    'envios-etiquetas': {
      titulo: 'Imprimir etiquetas',
      texto: 'Gera uma página por pedido da lista, com três partes: a etiqueta para colar no pacote, a lista de separação (o que colocar dentro) e a declaração de conteúdo exigida pelos Correios.'
    },

    // ---- Clientes e histórico ----
    'clientes-tela': {
      titulo: 'Clientes',
      texto: 'Montado a partir dos pedidos — não existe cadastro de cliente separado, e nenhum dado novo passou a ser coletado por causa desta tela.'
    },
    'historico-tela': {
      titulo: 'Histórico',
      texto: 'Registro de tudo que foi feito no painel. Serve para conferir depois quem mexeu em quê, e quando.'
    }
  };

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var DISPENSADOS_KEY = 'druza_admin_help_dispensados_v1';

  function lerDispensados() {
    try {
      var salvo = JSON.parse(localStorage.getItem(DISPENSADOS_KEY) || '[]');
      return Array.isArray(salvo) ? salvo : [];
    } catch (_) {
      return [];
    }
  }

  function dispensar(secao) {
    var lista = lerDispensados();
    if (lista.indexOf(secao) === -1) lista.push(secao);
    try { localStorage.setItem(DISPENSADOS_KEY, JSON.stringify(lista)); } catch (_) { /* sem storage: só não lembra */ }
  }

  function secaoAtual() {
    var ativo = document.querySelector('.admin-nav__link.is-active');
    return ativo ? ativo.getAttribute('data-section') : 'overview';
  }

  // ------------------------------------------------------------------
  // 3) Balão do ícone (i)
  // ------------------------------------------------------------------
  var balao = document.createElement('div');
  balao.className = 'help-pop';
  balao.setAttribute('role', 'dialog');
  balao.setAttribute('aria-modal', 'false');
  balao.hidden = true;
  document.body.appendChild(balao);

  var fundoBalao = document.createElement('div');
  fundoBalao.className = 'help-pop__scrim';
  fundoBalao.hidden = true;
  document.body.appendChild(fundoBalao);

  var gatilhoAtivo = null;

  function fecharBalao() {
    if (balao.hidden) return;
    balao.hidden = true;
    fundoBalao.hidden = true;
    if (gatilhoAtivo) {
      gatilhoAtivo.setAttribute('aria-expanded', 'false');
      gatilhoAtivo.focus();
      gatilhoAtivo = null;
    }
  }

  function corpoDaDica(dica) {
    var html = '<p>' + esc(dica.texto) + '</p>';
    if (dica.passos && dica.passos.length) {
      html += '<ul class="help-list">' + dica.passos.map(function (passo) {
        return '<li>' + esc(passo) + '</li>';
      }).join('') + '</ul>';
    }
    if (dica.aviso) {
      html += '<p class="help-warn">' + esc(dica.aviso) + '</p>';
    }
    return html;
  }

  function posicionarBalao(gatilho) {
    // No celular o balão vira uma faixa presa embaixo, larga e fácil de
    // fechar com o polegar. No computador ele fica ancorado no ícone.
    if (window.matchMedia('(max-width: 720px)').matches) {
      balao.style.top = '';
      balao.style.left = '';
      return;
    }

    var r = gatilho.getBoundingClientRect();
    var largura = balao.offsetWidth;
    var altura = balao.offsetHeight;
    var margem = 12;

    var esquerda = Math.min(
      Math.max(margem, r.left + r.width / 2 - largura / 2),
      window.innerWidth - largura - margem
    );
    var topo = r.bottom + 10;
    if (topo + altura > window.innerHeight - margem) {
      topo = Math.max(margem, r.top - altura - 10);
    }

    balao.style.top = topo + 'px';
    balao.style.left = esquerda + 'px';
  }

  function abrirBalao(gatilho) {
    var chave = gatilho.getAttribute('data-help-key');
    var dica = DICAS[chave];
    if (!dica) return;

    if (gatilhoAtivo === gatilho && !balao.hidden) { fecharBalao(); return; }
    if (gatilhoAtivo) gatilhoAtivo.setAttribute('aria-expanded', 'false');

    gatilhoAtivo = gatilho;
    gatilho.setAttribute('aria-expanded', 'true');

    balao.innerHTML =
      '<div class="help-pop__head">' +
        '<strong>' + esc(dica.titulo) + '</strong>' +
        '<button type="button" class="help-pop__close" aria-label="Fechar explicação">&times;</button>' +
      '</div>' +
      '<div class="help-pop__body">' + corpoDaDica(dica) + '</div>';

    balao.hidden = false;
    fundoBalao.hidden = !window.matchMedia('(max-width: 720px)').matches;
    posicionarBalao(gatilho);
    balao.querySelector('.help-pop__close').focus();
  }

  balao.addEventListener('click', function (evento) {
    if (evento.target.closest('.help-pop__close')) fecharBalao();
  });
  fundoBalao.addEventListener('click', fecharBalao);
  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') fecharBalao();
  });
  document.addEventListener('click', function (evento) {
    if (balao.hidden) return;
    if (evento.target.closest('.help-pop') || evento.target.closest('.help-btn')) return;
    fecharBalao();
  });
  window.addEventListener('resize', function () {
    if (!balao.hidden && gatilhoAtivo) posicionarBalao(gatilhoAtivo);
  });
  // No computador o balão é ancorado no ícone, então rolar o deixaria
  // apontando para o nada. No celular ele é uma faixa fixa embaixo, que
  // continua no lugar certo — aí fechar sozinho só atrapalharia quem
  // rolou para reler o campo.
  window.addEventListener('scroll', function () {
    if (!window.matchMedia('(max-width: 720px)').matches) fecharBalao();
  }, { passive: true });

  // ------------------------------------------------------------------
  // 4) Coloca os ícones (i) nos elementos marcados com data-help
  // ------------------------------------------------------------------
  function montarIcones() {
    var alvos = document.querySelectorAll('[data-help]:not([data-help-pronto])');
    Array.prototype.forEach.call(alvos, function (alvo) {
      var chave = alvo.getAttribute('data-help');
      if (!DICAS[chave]) return;

      alvo.setAttribute('data-help-pronto', '1');

      var botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'help-btn';
      botao.setAttribute('data-help-key', chave);
      botao.setAttribute('aria-expanded', 'false');
      botao.setAttribute('aria-label', 'O que é "' + DICAS[chave].titulo + '"?');
      botao.title = 'Entenda este campo';
      botao.textContent = 'i';
      botao.addEventListener('click', function (evento) {
        evento.preventDefault();
        evento.stopPropagation();
        abrirBalao(botao);
      });

      if (alvo.tagName === 'BUTTON' || alvo.tagName === 'INPUT') {
        // Botão não pode ter botão dentro: o ícone vira irmão, logo ao lado.
        alvo.insertAdjacentElement('afterend', botao);
      } else if (alvo.tagName === 'LABEL') {
        // Dentro de <label>, o ícone vai junto do texto do rótulo (o
        // primeiro <span>), não no fim do campo — senão cairia embaixo
        // do input.
        (alvo.querySelector(':scope > span') || alvo).appendChild(botao);
      } else {
        alvo.appendChild(botao);
      }
    });
  }

  // ------------------------------------------------------------------
  // 5) Cartão-tutorial no topo de cada seção
  // ------------------------------------------------------------------
  function montarCartao(secao) {
    var guia = GUIAS[secao];
    var painel = document.querySelector('.admin-panel[data-panel="' + secao + '"]');
    if (!guia || !painel) return;

    var cartao = document.createElement('aside');
    cartao.className = 'help-card';
    cartao.setAttribute('data-help-card', secao);
    cartao.hidden = lerDispensados().indexOf(secao) !== -1;
    cartao.innerHTML =
      '<div class="help-card__head">' +
        '<h2>' + esc(guia.titulo) + ' — como usar</h2>' +
        '<button type="button" class="help-card__close" aria-label="Fechar este tutorial">&times;</button>' +
      '</div>' +
      '<p class="help-card__lead">' + esc(guia.resumo) + '</p>' +
      '<ol class="help-card__steps">' + guia.passos.map(function (passo) {
        return '<li>' + esc(passo) + '</li>';
      }).join('') + '</ol>' +
      (guia.dica ? '<p class="help-card__tip"><strong>Vale saber:</strong> ' + esc(guia.dica) + '</p>' : '') +
      '<label class="help-card__mute"><input type="checkbox" data-help-mute> Não mostrar isto de novo</label>';

    painel.insertBefore(cartao, painel.firstChild);

    cartao.querySelector('.help-card__close').addEventListener('click', function () {
      if (cartao.querySelector('[data-help-mute]').checked) dispensar(secao);
      cartao.hidden = true;
    });
  }

  function abrirTutorial(secao) {
    var cartao = document.querySelector('[data-help-card="' + secao + '"]');
    if (!cartao) return;
    cartao.hidden = false;
    cartao.querySelector('[data-help-mute]').checked = false;
    cartao.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    cartao.querySelector('.help-card__close').focus();
  }

  // ------------------------------------------------------------------
  // 6) Botão "Ajuda" na barra superior
  // ------------------------------------------------------------------
  function montarBotaoAjuda() {
    var botao = document.getElementById('help-toggle');
    if (!botao) return;
    botao.addEventListener('click', function () { abrirTutorial(secaoAtual()); });
  }

  // ------------------------------------------------------------------
  // Início
  // ------------------------------------------------------------------
  Object.keys(GUIAS).forEach(montarCartao);
  montarIcones();
  montarBotaoAjuda();

  // Hoje todas as âncoras são fixas no HTML, então a passada acima já
  // cobre tudo. O observador é rede de segurança para telas montadas por
  // JavaScript no futuro — e só faz trabalho quando entra na página algo
  // que realmente pede ícone.
  if (window.MutationObserver) {
    var conteudo = document.getElementById('content');
    if (conteudo) {
      new MutationObserver(function (mutacoes) {
        var precisa = mutacoes.some(function (m) {
          return Array.prototype.some.call(m.addedNodes, function (no) {
            return no.nodeType === 1
              && (no.hasAttribute('data-help') || no.querySelector('[data-help]'));
          });
        });
        if (precisa) montarIcones();
      }).observe(conteudo, { childList: true, subtree: true });
    }
  }

  window.DruzaAdminHelp = { abrirTutorial: abrirTutorial, guias: GUIAS, dicas: DICAS };
})();

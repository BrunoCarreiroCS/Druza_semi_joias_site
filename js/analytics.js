/* =====================================================================
   DRUZA — analytics.js (Google Analytics 4)

   Cole aqui o Measurement ID do GA4 (formato "G-XXXXXXXXXX", visto em
   Analytics → Administrador → Fluxos de dados → seu site). Enquanto
   estiver vazio, este script não faz NADA — o site funciona normal, sem
   nenhuma chamada de rede a terceiros.

   Não incluído no painel admin (admin.html/admin-login.html) de propósito:
   é uma área restrita e não precisamos de um script de terceiro rodando
   ali (ver docs/SEGURANCA.md — minimizar dependências no que é sensível).
   ===================================================================== */
(function () {
  'use strict';

  var GA4_ID = ''; // <-- cole aqui, ex.: 'G-ABC1234XYZ'

  if (!GA4_ID) return;

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA4_ID);
})();

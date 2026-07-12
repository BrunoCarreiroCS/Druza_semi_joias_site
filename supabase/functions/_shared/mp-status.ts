// =====================================================================
// DRUZA — mapeamento de status de pagamento do MercadoPago -> pedido
// Usado por webhook-mp e process-payment (mesma fonte de verdade).
// =====================================================================

export function mapMpStatus(mpStatus: string): string {
  switch (mpStatus) {
    case 'approved':     return 'paid';
    case 'pending':      return 'pending';
    case 'in_process':   return 'pending';
    case 'rejected':     return 'canceled';
    case 'cancelled':    return 'canceled';
    case 'refunded':     return 'refunded';
    case 'charged_back': return 'refunded';
    default:             return 'pending';
  }
}

// Erro de regra de negocio com mensagem ja pronta para a usuaria e o
// status HTTP que ela merece. Vive num modulo sem nenhuma dependencia
// para que a camada de validacao possa ser testada sem levantar cliente
// Supabase nem tocar a rede.
export class AdminRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminRequestError';
    this.status = status;
  }
}

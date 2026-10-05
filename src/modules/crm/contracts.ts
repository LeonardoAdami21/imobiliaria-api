/**
 * Contrato público do CRM. Locação e vendas referenciam pessoas
 * (inquilino, proprietário, comprador) apenas por este resumo.
 */
export interface PersonSummary {
  id: string;
  name: string;
  document: string;
}

export interface PersonDirectory {
  findPerson(id: string): Promise<PersonSummary | null>;
}

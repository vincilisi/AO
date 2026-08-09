export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  status: "lead" | "attivo" | "inattivo";
  lastContact: string;
  satisfaction: number;
}

export class CrmService {
  private customers: Customer[] = [
    { id: "cus-1", name: "Giulia Bianchi", company: "Studio Bianchi", email: "giulia@example.com", status: "attivo", lastContact: new Date().toISOString(), satisfaction: 92 },
    { id: "cus-2", name: "Marco Conti", company: "Conti Retail", email: "marco@example.com", status: "lead", lastContact: new Date(Date.now() - 86400000).toISOString(), satisfaction: 78 }
  ];

  list() { return [...this.customers]; }

  create(input: Omit<Customer, "id" | "lastContact">) {
    const customer: Customer = { ...input, id: crypto.randomUUID(), lastContact: new Date().toISOString() };
    this.customers.unshift(customer);
    return customer;
  }
}
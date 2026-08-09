export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  weeklyHours: number;
  status: "presente" | "remoto" | "assente";
}

export class HrService {
  private employees: Employee[] = [
    { id: "emp-1", name: "Elena Rossi", role: "Account manager", department: "Commerciale", weeklyHours: 32, status: "presente" },
    { id: "emp-2", name: "Paolo Greco", role: "Customer specialist", department: "Supporto", weeklyHours: 30.5, status: "remoto" },
    { id: "emp-3", name: "Sara Neri", role: "Office manager", department: "Amministrazione", weeklyHours: 36, status: "presente" }
  ];

  list() { return [...this.employees]; }

  recordHours(employeeId: string, hours: number) {
    const employee = this.employees.find((item) => item.id === employeeId);
    if (!employee) throw new Error("Dipendente non trovato");
    employee.weeklyHours = Math.round((employee.weeklyHours + hours) * 100) / 100;
    return employee;
  }
}
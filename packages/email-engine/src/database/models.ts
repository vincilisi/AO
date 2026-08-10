export interface Customer {
  id: string;
  email: string;
  name: string;
  lastContact?: Date;
  lastEmailSubject?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AutomationTrigger = "email.received" | "quote.approved" | "attendance.missing" | "deadline.due";
export type AutomationAction = "create-task" | "create-order" | "notify" | "draft-reply";

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
}

export class AutomationEngine {
  private rules: AutomationRule[] = [
    { id: "rule-email-task", name: "Email in attività", trigger: "email.received", actions: ["create-task", "draft-reply"], enabled: true },
    { id: "rule-quote-order", name: "Preventivo in ordine", trigger: "quote.approved", actions: ["create-order", "notify"], enabled: true },
    { id: "rule-attendance", name: "Alert presenze", trigger: "attendance.missing", actions: ["notify"], enabled: true }
  ];

  list() { return this.rules.map((rule) => ({ ...rule, actions: [...rule.actions] })); }

  execute(trigger: AutomationTrigger) {
    return this.rules.filter((rule) => rule.enabled && rule.trigger === trigger).flatMap((rule) => rule.actions.map((action) => ({ ruleId: rule.id, action })));
  }
}
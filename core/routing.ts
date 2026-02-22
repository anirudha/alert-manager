/**
 * Notification routing service — rule matching, alert grouping, and CRUD.
 */

export interface RoutingRuleConfig {
  id: string;
  name: string;
  matchers: Record<string, string>;
  severityFilter?: string[];
  destinations: Array<{ type: string; target: string }>;
  groupBy?: string[];
  groupWindow?: string;
  priority: number;
  enabled: boolean;
}

export class NotificationRoutingService {
  private rules: Map<string, RoutingRuleConfig> = new Map();
  private nextId = 1;

  list(): RoutingRuleConfig[] {
    return Array.from(this.rules.values()).sort((a, b) => a.priority - b.priority);
  }

  get(id: string): RoutingRuleConfig | undefined {
    return this.rules.get(id);
  }

  create(input: Omit<RoutingRuleConfig, 'id'>): RoutingRuleConfig {
    const rule: RoutingRuleConfig = { ...input, id: `route-${this.nextId++}` };
    this.rules.set(rule.id, rule);
    return rule;
  }

  update(id: string, input: Partial<RoutingRuleConfig>): RoutingRuleConfig | null {
    const existing = this.rules.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, id };
    this.rules.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.rules.delete(id);
  }

  findMatchingRules(alert: { labels: Record<string, string>; severity: string }): RoutingRuleConfig[] {
    return this.list().filter(rule => {
      if (!rule.enabled) return false;
      // All matchers must match
      for (const [key, value] of Object.entries(rule.matchers)) {
        if (alert.labels[key] !== value) return false;
      }
      // Severity filter
      if (rule.severityFilter && rule.severityFilter.length > 0) {
        if (!rule.severityFilter.includes(alert.severity)) return false;
      }
      return true;
    });
  }

  groupAlerts<T extends { id: string; labels: Record<string, string> }>(
    alerts: T[],
    config: { groupBy: string[]; groupWindow?: string; groupLimit?: number },
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const alert of alerts) {
      const key = config.groupBy.map(k => alert.labels[k] || '').join('|');
      const group = groups.get(key) || [];
      group.push(alert);
      groups.set(key, group);
    }
    // Apply group limit
    if (config.groupLimit && config.groupLimit > 0) {
      for (const [key, group] of groups) {
        if (group.length > config.groupLimit) {
          groups.set(key, group.slice(0, config.groupLimit));
        }
      }
    }
    return groups;
  }
}

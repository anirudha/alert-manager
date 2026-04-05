/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Suppression rule service — schedule-based suppression, conflict detection, and CRUD.
 */

export interface SuppressionRuleConfig {
  id: string;
  name: string;
  description: string;
  matchers: Record<string, string>;
  scheduleType: 'one_time' | 'recurring';
  startTime: string;
  endTime: string;
  recurrence?: { days: number[]; timezone: string };
  createdBy: string;
  createdAt: string;
  active?: boolean;
}

export class SuppressionRuleService {
  private rules: Map<string, SuppressionRuleConfig> = new Map();
  private nextId = 1;

  list(): SuppressionRuleConfig[] {
    return Array.from(this.rules.values());
  }

  get(id: string): SuppressionRuleConfig | undefined {
    return this.rules.get(id);
  }

  create(input: Omit<SuppressionRuleConfig, 'id' | 'createdAt'>): SuppressionRuleConfig {
    const rule: SuppressionRuleConfig = {
      ...input,
      id: `sup-${this.nextId++}`,
      createdAt: new Date().toISOString(),
    };
    this.rules.set(rule.id, rule);
    return rule;
  }

  update(id: string, input: Partial<SuppressionRuleConfig>): SuppressionRuleConfig | null {
    const existing = this.rules.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, id };
    this.rules.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.rules.delete(id);
  }

  isAlertSuppressed(alert: { labels: Record<string, string> }): boolean {
    return this.getActiveRules().some((rule) => this.matchesLabels(rule, alert.labels));
  }

  getActiveRules(): SuppressionRuleConfig[] {
    const now = new Date();
    return this.list().filter((rule) => this.isRuleActive(rule, now));
  }

  detectConflicts(rule: SuppressionRuleConfig): SuppressionRuleConfig[] {
    return this.list().filter((existing) => {
      if (existing.id === rule.id) return false;
      if (!this.matchersOverlap(rule.matchers, existing.matchers)) return false;
      if (!this.schedulesOverlap(rule, existing)) return false;
      return true;
    });
  }

  private matchesLabels(rule: SuppressionRuleConfig, labels: Record<string, string>): boolean {
    for (const [key, value] of Object.entries(rule.matchers)) {
      if (labels[key] !== value) return false;
    }
    return true;
  }

  private isRuleActive(rule: SuppressionRuleConfig, now: Date): boolean {
    const start = new Date(rule.startTime);
    const end = new Date(rule.endTime);
    if (rule.scheduleType === 'one_time') {
      return now >= start && now <= end;
    }
    // Recurring: check if current day matches and time is within window.
    // Uses the rule's configured timezone (defaults to UTC).
    if (rule.recurrence) {
      const tz = rule.recurrence.timezone || 'UTC';
      // Get the current day and time in the rule's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const currentDay = dayMap[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? 0;
      const currentHour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
      const currentMinute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

      if (!rule.recurrence.days.includes(currentDay)) return false;

      // Compare current time against start/end hours in the configured timezone
      const startHour = start.getUTCHours();
      const startMinute = start.getUTCMinutes();
      const endHour = end.getUTCHours();
      const endMinute = end.getUTCMinutes();

      const currentMins = currentHour * 60 + currentMinute;
      const startMins = startHour * 60 + startMinute;
      const endMins = endHour * 60 + endMinute;

      return currentMins >= startMins && currentMins <= endMins;
    }
    return now >= start && now <= end;
  }

  private matchersOverlap(a: Record<string, string>, b: Record<string, string>): boolean {
    // Overlap if one is a subset of the other
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const aSubsetB = aKeys.every((k) => b[k] === a[k]);
    const bSubsetA = bKeys.every((k) => a[k] === b[k]);
    return aSubsetB || bSubsetA;
  }

  private schedulesOverlap(a: SuppressionRuleConfig, b: SuppressionRuleConfig): boolean {
    const aStart = new Date(a.startTime).getTime();
    const aEnd = new Date(a.endTime).getTime();
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    return aStart <= bEnd && bStart <= aEnd;
  }
}

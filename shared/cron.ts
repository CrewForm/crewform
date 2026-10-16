// SPDX-License-Identifier: MIT
// Five-field UTC cron with numeric lists/ranges/steps and Sunday 0/7.
interface Field {values: Set<number>; wildcard: boolean}
function field(source: string, min: number, max: number): Field | null {
    const values = new Set<number>();
    for (const part of source.split(',')) {
        const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
        if (!match) return null;
        const stepText = match.at(2);
        const step = stepText === undefined ? 1 : Number(stepText);
        if (!Number.isSafeInteger(step) || step < 1 || step > max + 1) return null;
        const range = match[1].split('-').map(Number);
        const start = match[1] === '*' ? min : range[0];
        const end = match[1] === '*' || (range.length === 1 && stepText !== undefined) ? max : range.at(-1) as number;
        if (start < min || end > max || start > end) return null;
        for (let value = start; value <= end; value += step) values.add(value);
    }
    // A stepped wildcard still follows wildcard day-combination semantics.
    return {values, wildcard: source.startsWith('*')};
}
function parse(expression: string): Field[] | null {
    if (expression.length > 256) return null;
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const limits = [[0,59],[0,23],[1,31],[1,12],[0,7]];
    const parsed = parts.map((part, index) => field(part, limits[index][0], limits[index][1]));
    return parsed.every((item): item is Field => item !== null) ? parsed : null;
}
function matches(fields: Field[], date: Date): boolean {
    const [minute,hour,dom,month,dow] = fields;
    const day = date.getUTCDay();
    const dayOfWeek = dow.values.has(day) || (day === 0 && dow.values.has(7));
    const dayOfMonth = dom.values.has(date.getUTCDate());
    const days = dom.wildcard || dow.wildcard ? dayOfMonth && dayOfWeek : dayOfMonth || dayOfWeek;
    return minute.values.has(date.getUTCMinutes()) && hour.values.has(date.getUTCHours()) && month.values.has(date.getUTCMonth()+1) && days;
}
export function cronMatchesDate(expression: string, date: Date): boolean {
    const fields = parse(expression);
    return fields !== null && Number.isFinite(date.getTime()) && matches(fields, date);
}
export function isValidCronExpression(expression: string): boolean {return parse(expression) !== null;}
export function isTriggerDue(expression: string, lastFiredAt: string | null, createdAt: string, now = new Date()): boolean {
    const fields = parse(expression), current = now.getTime(), created = Date.parse(createdAt);
    const last = lastFiredAt === null ? null : Date.parse(lastFiredAt);
    if (!fields || !Number.isFinite(current) || !Number.isFinite(created) || (last !== null && !Number.isFinite(last)) ||
        created > current || (last !== null && last > current)) return false;
    const minute = Math.floor(current/60000)*60000;
    if (last !== null && Math.floor(last/60000)*60000 >= minute) return false;
    if (matches(fields, now)) return true;
    const baseline = Math.max(created, last ?? created);
    const start = Math.floor(Math.max(baseline, current-48*60*60*1000)/60000)*60000+60000;
    for (let candidate = start; candidate < minute; candidate += 60000) if (matches(fields, new Date(candidate))) return true;
    return false;
}

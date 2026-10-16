// SPDX-License-Identifier: MIT
// Bounded, deliberately small JSON-schema subset. No refs, formats, regexes,
// coercion, remote resolution or executable validators.
export interface HandoffContract {version: 1; schema: HandoffSchema}
export interface HandoffSchema {
    type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, HandoffSchema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: HandoffSchema;
    enum?: (string | number | boolean | null)[];
    minLength?: number; maxLength?: number;
    minItems?: number; maxItems?: number;
    minimum?: number; maximum?: number;
}
export class HandoffValidationError extends Error {
    constructor(message: string) {super(message); this.name = 'HandoffValidationError';}
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(message: string): never {throw new HandoffValidationError(message);}
export function validateHandoffContract(value: unknown): asserts value is HandoffContract | undefined {
    if (value === undefined) return;
    if (JSON.stringify(value).length > 32768) invalid('Handoff contract exceeds the size limit.');
    if (!object(value) || value.version !== 1 || Object.keys(value).some(key => !['version', 'schema'].includes(key)))
        invalid('Handoff contract requires version 1 and a schema.');
    let nodes = 0;
    const walk = (schema: unknown, depth: number) => {
        if (++nodes > 256 || depth > 8) invalid('Handoff schema exceeds complexity limits.');
        if (!object(schema) || typeof schema.type !== 'string' || !['object','array','string','number','integer','boolean','null'].includes(schema.type))
            invalid('Handoff schema requires an explicit supported type.');
        const allowed = ['type', ...(schema.type === 'object' ? ['properties','required','additionalProperties'] : []),
            ...(schema.type === 'array' ? ['items','minItems','maxItems'] : []),
            ...(schema.type === 'string' ? ['minLength','maxLength'] : []),
            ...(['number','integer'].includes(schema.type) ? ['minimum','maximum'] : []), 'enum'];
        if (Object.keys(schema).some(key => !allowed.includes(key))) invalid('Unsupported handoff schema keyword.');
        if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.length > 64 ||
            schema.enum.some(item => (typeof item === 'number' && !Number.isFinite(item)) || (item !== null && !['string','number','boolean'].includes(typeof item))))) invalid('Invalid handoff enum.');
        for (const [min, max] of [['minItems','maxItems'], ['minLength','maxLength'], ['minimum','maximum']]) {
            for (const key of [min, max]) if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]) ||
                (key !== 'minimum' && key !== 'maximum' && (!Number.isInteger(schema[key]) || schema[key] < 0 || schema[key] > 1048576)))) invalid('Invalid handoff schema bounds.');
            if (typeof schema[min] === 'number' && typeof schema[max] === 'number' && schema[min] > schema[max]) invalid('Reversed handoff schema bounds.');
        }
        if (schema.type === 'object') {
            if (schema.properties !== undefined && !object(schema.properties)) invalid('Invalid handoff properties.');
            const properties = schema.properties ?? {};
            if (Object.keys(properties).length > 64) invalid('Too many handoff properties.');
            if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.length > 64 ||
                schema.required.some(key => typeof key !== 'string' || !Object.hasOwn(properties, key)))) invalid('Invalid required handoff properties.');
            if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') invalid('Invalid additionalProperties.');
            Object.values(properties).forEach(child => {walk(child, depth + 1);});
        }
        if (schema.type === 'array') walk(schema.items, depth + 1);
    };
    walk(value.schema, 0);
}

/** Throws before a downstream consumer receives invalid output; never rewrites it. */
export function assertHandoff(contract: unknown, output: string): void {
    if (contract === undefined) return;
    validateHandoffContract(contract);
    if (output.length > 1048576) invalid('Handoff output exceeds the size limit.');
    let value: unknown;
    try {value = JSON.parse(output);} catch {invalid('Handoff output must be one JSON value without Markdown fences.');}
    let visited = 0;
    const check = (schema: HandoffSchema, item: unknown, path: string, depth: number) => {
        if (++visited > 10000 || depth > 32) invalid('Handoff output exceeds complexity limits.');
        const fail = () => invalid(`Handoff output does not match the contract at ${path}.`);
        if (schema.enum && !schema.enum.some(option => option === item)) fail();
        switch (schema.type) {
            case 'object': {
                if (!object(item)) return fail();
                const properties = schema.properties ?? {};
                if (schema.required?.some(key => !Object.hasOwn(item, key))) fail();
                for (const key of Object.keys(item)) {
                    if (Object.hasOwn(properties, key)) check(properties[key], item[key], `${path}.${key.slice(0,80)}`, depth + 1);
                    else if (schema.additionalProperties === false) fail();
                }
                break;
            }
            case 'array':
                if (!Array.isArray(item) || item.length < (schema.minItems ?? 0) || item.length > (schema.maxItems ?? 10000)) return fail();
                item.forEach((child, index) => {check(schema.items as HandoffSchema, child, `${path}[${index}]`, depth + 1);});
                break;
            case 'string':
                if (typeof item !== 'string' || item.length < (schema.minLength ?? 0) || item.length > (schema.maxLength ?? 1048576)) fail();
                break;
            case 'number': case 'integer':
                if (typeof item !== 'number' || !Number.isFinite(item) || (schema.type === 'integer' && !Number.isInteger(item)) ||
                    item < (schema.minimum ?? -Infinity) || item > (schema.maximum ?? Infinity)) fail();
                break;
            case 'boolean': if (typeof item !== 'boolean') fail(); break;
            case 'null': if (item !== null) fail(); break;
        }
    };
    check(contract.schema, value, '$', 0);
}
export function handoffInstructions(contract: unknown): string {
    if (contract === undefined) return '';
    validateHandoffContract(contract);
    return `\n\n## Output Contract v1\nReturn only one JSON value matching this schema, without Markdown fences:\n${JSON.stringify(contract.schema)}`;
}

// SPDX-License-Identifier: MIT
import {expect, it} from 'vitest';
import {assertHandoff, validateHandoffContract} from './handoffContract';
const contract = {version: 1, schema: {type: 'object', additionalProperties: false, required: ['version','findings'], properties: {
    version: {type: 'integer', enum: [1]}, findings: {type: 'array', minItems: 1, maxItems: 5, items: {
        type: 'object', required: ['source','confidence'], additionalProperties: false, properties: {
            source: {type: 'string', minLength: 1}, confidence: {type: 'number', minimum: 0, maximum: 1},
        },
    }},
}}};
it('accepts a versioned evidence handoff without coercing or rewriting it', () => {
    const output = '{"version":1,"findings":[{"source":"P1:3","confidence":0.8}]}';
    expect(() => assertHandoff(contract, output)).not.toThrow();
});
it.each([
    '```json\n{}\n```', '{}', '{"version":2,"findings":[]}',
    '{"version":1,"findings":[{"source":"","confidence":0.8}]}',
    '{"version":1,"findings":[{"source":"P1:3","confidence":"0.8"}]}',
    '{"version":1,"findings":[{"source":"P1:3","confidence":2}]}',
    '{"version":1,"findings":[{"source":"P1:3","confidence":0.8,"command":"unexpected"}]}',
])('rejects malformed output before consumption: %s', output => {
    expect(() => assertHandoff(contract, output)).toThrow(/Handoff/);
});
it('rejects remote refs, unknown versions, invalid keywords and excessive complexity', () => {
    for (const value of [{version: 2, schema: {}}, {version: 1, schema: {$ref: 'https://example.com/schema'}},
        {version: 1, schema: {type: 'string', pattern: '.*'}}, {version: 1, schema: {type: 'array'}}, {version: 1, schema: {type: ['object']}},
        {version: 1, schema: {type: 'object', required: ['missing']}}])
        expect(() => validateHandoffContract(value)).toThrow(/Handoff|handoff/);
    let schema: unknown = {type: 'string'};
    for (let index = 0; index < 10; index++) schema = {type: 'array', items: schema};
    expect(() => validateHandoffContract({version: 1, schema})).toThrow(/complexity/);
    expect(() => assertHandoff({version: 1, schema: {type: 'string'}}, 'x'.repeat(1048577))).toThrow(/size limit/);
});

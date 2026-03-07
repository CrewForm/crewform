/**
 * List Agents — hidden trigger for dynamic dropdowns
 *
 * Powers the "Agent" dropdown in Create Task and other actions.
 * Not visible to users as a standalone trigger.
 */

const { getBaseUrl } = require('../lib/helpers');

const perform = async (z, bundle) => {
    const response = await z.request({
        url: `${getBaseUrl(bundle)}/api-agents`,
        method: 'GET',
    });

    // Return agents with id and name for the dropdown
    const data = response.data;
    return Array.isArray(data) ? data : [data];
};

module.exports = {
    key: 'list_agents',
    noun: 'Agent',

    display: {
        label: 'List Agents',
        description: 'Lists agents (used for dropdowns).',
        hidden: true,
    },

    operation: {
        perform: perform,

        sample: {
            id: '00000000-0000-0000-0000-000000000000',
            name: 'Sample Agent',
        },

        outputFields: [
            { key: 'id', label: 'Agent ID' },
            { key: 'name', label: 'Agent Name' },
        ],
    },
};

/**
 * List Teams — hidden trigger for dynamic dropdowns
 *
 * Powers the "Team" dropdown in Create Task and Run Team actions.
 * Not visible to users as a standalone trigger.
 */

const { getBaseUrl } = require('../lib/helpers');

const perform = async (z, bundle) => {
    const response = await z.request({
        url: `${getBaseUrl(bundle)}/api-teams`,
        method: 'GET',
    });

    // Return teams with id and name for the dropdown
    const data = response.data;
    return Array.isArray(data) ? data : [data];
};

module.exports = {
    key: 'list_teams',
    noun: 'Team',

    display: {
        label: 'List Teams',
        description: 'Lists teams (used for dropdowns).',
        hidden: true,
    },

    operation: {
        perform: perform,

        sample: {
            id: '00000000-0000-0000-0000-000000000000',
            name: 'Sample Team',
        },

        outputFields: [
            { key: 'id', label: 'Team ID' },
            { key: 'name', label: 'Team Name' },
        ],
    },
};

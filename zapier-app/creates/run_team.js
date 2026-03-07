/**
 * Run Team Action
 *
 * Allows Zapier users to kick off a team run (pipeline or orchestrator)
 * with a given input task / prompt.
 */

const { getBaseUrl } = require('../lib/helpers');

const perform = async (z, bundle) => {
    const response = await z.request({
        url: `${getBaseUrl(bundle)}/api-runs`,
        method: 'POST',
        body: {
            team_id: bundle.inputData.team_id,
            input_task: bundle.inputData.input_task,
        },
    });

    return response.data;
};

module.exports = {
    key: 'run_team',
    noun: 'Team Run',

    display: {
        label: 'Run Team',
        description: 'Starts a team run (pipeline or orchestrator) in CrewForm.',
    },

    operation: {
        perform: perform,

        inputFields: [
            {
                key: 'team_id',
                label: 'Team',
                type: 'string',
                required: true,
                dynamic: 'list_teams.id.name',
                helpText: 'Select the team to run.',
            },
            {
                key: 'input_task',
                label: 'Input Task',
                type: 'text',
                required: true,
                helpText: 'The task/prompt to send to the team pipeline or orchestrator.',
            },
        ],

        sample: {
            id: '00000000-0000-0000-0000-000000000000',
            team_id: '00000000-0000-0000-0000-000000000001',
            input_task: 'Analyze market trends for Q1 2026',
            status: 'pending',
            created_at: new Date().toISOString(),
        },

        outputFields: [
            { key: 'id', label: 'Run ID' },
            { key: 'team_id', label: 'Team ID' },
            { key: 'input_task', label: 'Input Task' },
            { key: 'status', label: 'Status' },
            { key: 'created_at', label: 'Created At' },
        ],
    },
};

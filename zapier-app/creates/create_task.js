/**
 * Create Task Action
 *
 * Allows Zapier users to create a new task in CrewForm,
 * optionally assigning it to a specific agent or team.
 *
 * When an agent or team is assigned, the task is auto-dispatched
 * so the task-runner picks it up immediately.
 *
 * Agent and Team fields use dynamic dropdowns powered by the
 * /api-agents and /api-teams endpoints.
 */

const { getBaseUrl } = require('../lib/helpers');

const perform = async (z, bundle) => {
    const body = {
        title: bundle.inputData.title,
        description: bundle.inputData.description,
        priority: bundle.inputData.priority || 'medium',
    };

    if (bundle.inputData.assigned_agent_id) {
        body.assigned_agent_id = bundle.inputData.assigned_agent_id;
    }

    if (bundle.inputData.assigned_team_id) {
        body.assigned_team_id = bundle.inputData.assigned_team_id;
    }

    const response = await z.request({
        url: `${getBaseUrl(bundle)}/api-tasks`,
        method: 'POST',
        body: body,
    });

    return response.data;
};

module.exports = {
    key: 'create_task',
    noun: 'Task',

    display: {
        label: 'Create Task',
        description: 'Creates a new task in CrewForm and dispatches it to an agent or team.',
    },

    operation: {
        perform: perform,

        inputFields: [
            {
                key: 'title',
                label: 'Title',
                type: 'string',
                required: true,
                helpText: 'The title of the task.',
            },
            {
                key: 'description',
                label: 'Description',
                type: 'text',
                required: true,
                helpText: 'The full task description / prompt for the AI agent.',
            },
            {
                key: 'priority',
                label: 'Priority',
                type: 'string',
                choices: ['low', 'medium', 'high', 'urgent'],
                default: 'medium',
                required: false,
                helpText: 'Task priority level.',
            },
            {
                key: 'assigned_agent_id',
                label: 'Agent',
                type: 'string',
                required: false,
                dynamic: 'list_agents.id.name',
                helpText: 'Select the agent to run this task. If set, the task is dispatched automatically.',
            },
            {
                key: 'assigned_team_id',
                label: 'Team',
                type: 'string',
                required: false,
                dynamic: 'list_teams.id.name',
                helpText: 'Select the team to run this task (pipeline or orchestrator). If set, the task is dispatched automatically.',
            },
        ],

        sample: {
            id: '00000000-0000-0000-0000-000000000000',
            title: 'Sample Task',
            description: 'Analyze the latest quarterly report',
            priority: 'medium',
            status: 'dispatched',
            created_at: new Date().toISOString(),
        },

        outputFields: [
            { key: 'id', label: 'Task ID' },
            { key: 'title', label: 'Title' },
            { key: 'description', label: 'Description' },
            { key: 'priority', label: 'Priority' },
            { key: 'status', label: 'Status' },
            { key: 'assigned_agent_id', label: 'Assigned Agent ID' },
            { key: 'assigned_team_id', label: 'Assigned Team ID' },
            { key: 'created_at', label: 'Created At' },
        ],
    },
};

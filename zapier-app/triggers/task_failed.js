const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'task_failed',
    event: 'task.failed',
    noun: 'Task',
    label: 'AI Agent Task Failed',
    desc: 'Triggers when an AI agent fails to complete a task.',
    listUrl: '/api-tasks?status=failed',
    inputFields: [
        {
            key: 'agent_id',
            label: 'Agent',
            type: 'string',
            required: false,
            helpText: 'Only trigger for this specific agent. Leave blank to trigger for any agent.',
            dynamic: 'list_agents.id.name',
        },
    ],
});

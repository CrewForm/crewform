const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'task_completed',
    event: 'task.completed',
    noun: 'Task',
    label: 'AI Agent Completed Task',
    desc: 'Triggers when an AI agent finishes a task and returns its result.',
    listUrl: '/api-tasks?status=completed',
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

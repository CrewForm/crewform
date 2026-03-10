const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'task_completed',
    event: 'task.completed',
    noun: 'Task',
    label: 'AI Agent Completed Task',
    desc: 'Triggers when an AI agent finishes a task and returns its result.',
    listUrl: '/api-tasks?status=completed',
});

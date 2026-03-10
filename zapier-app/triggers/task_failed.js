const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'task_failed',
    event: 'task.failed',
    noun: 'Task',
    label: 'AI Agent Task Failed',
    desc: 'Triggers when an AI agent fails to complete a task.',
    listUrl: '/api-tasks?status=failed',
});

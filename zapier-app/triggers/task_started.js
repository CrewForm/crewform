const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'task_started',
    event: 'task.started',
    noun: 'Task',
    label: 'AI Agent Started Task',
    desc: 'Triggers when an AI agent begins working on an assigned task.',
    listUrl: '/api-tasks?status=running',
});

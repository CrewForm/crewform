const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'team_run_failed',
    event: 'team_run.failed',
    noun: 'Team Run',
    label: 'AI Agent Team Run Failed',
    desc: 'Triggers when a multi-agent team run encounters an error.',
    listUrl: '/api-runs',
});

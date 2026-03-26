const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'team_run_failed',
    event: 'team_run.failed',
    noun: 'Team Run',
    label: 'AI Agent Team Run Failed',
    desc: 'Triggers when a multi-agent team run encounters an error.',
    listUrl: '/api-runs',
    inputFields: [
        {
            key: 'team_id',
            label: 'Team',
            type: 'string',
            required: false,
            helpText: 'Only trigger for this specific team. Leave blank to trigger for any team.',
            dynamic: 'list_teams.id.name',
        },
    ],
});

const { makeRestHookTrigger } = require('../lib/helpers');

module.exports = makeRestHookTrigger({
    key: 'team_run_completed',
    event: 'team_run.completed',
    noun: 'Team Run',
    label: 'AI Agent Team Completed Run',
    desc: 'Triggers when a multi-agent team (pipeline or orchestrator) finishes a run and returns the final result.',
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

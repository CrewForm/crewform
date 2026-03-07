/**
 * CrewForm Zapier App — Entry Point
 *
 * This file defines the Zapier app with:
 * - API Key authentication (X-API-Key header)
 * - Triggers: task.started, task.completed, task.failed,
 *             team_run.completed, team_run.failed
 * - Actions: Create Task, Run Team
 */

const { authentication, addApiKeyHeader } = require('./authentication');

const taskStartedTrigger = require('./triggers/task_started');
const taskCompletedTrigger = require('./triggers/task_completed');
const taskFailedTrigger = require('./triggers/task_failed');
const teamRunCompletedTrigger = require('./triggers/team_run_completed');
const teamRunFailedTrigger = require('./triggers/team_run_failed');
const listAgentsTrigger = require('./triggers/list_agents');
const listTeamsTrigger = require('./triggers/list_teams');

const createTaskAction = require('./creates/create_task');
const runTeamAction = require('./creates/run_team');

module.exports = {
    version: require('./package.json').version,
    platformVersion: require('zapier-platform-core').version,

    authentication: authentication,

    // Middleware — inject API key header into every outgoing request
    beforeRequest: [addApiKeyHeader],

    // Zapier will automatically register/deregister webhooks via these REST hooks.
    triggers: {
        [taskStartedTrigger.key]: taskStartedTrigger,
        [taskCompletedTrigger.key]: taskCompletedTrigger,
        [taskFailedTrigger.key]: taskFailedTrigger,
        [teamRunCompletedTrigger.key]: teamRunCompletedTrigger,
        [teamRunFailedTrigger.key]: teamRunFailedTrigger,
        [listAgentsTrigger.key]: listAgentsTrigger,
        [listTeamsTrigger.key]: listTeamsTrigger,
    },

    creates: {
        [createTaskAction.key]: createTaskAction,
        [runTeamAction.key]: runTeamAction,
    },

    // If you want to add searches later:
    // searches: {},
};

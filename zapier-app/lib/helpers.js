/**
 * Shared helper to build REST Hook triggers.
 *
 * All CrewForm triggers follow the same pattern:
 * - subscribeHook: POST /api-hooks to register Zapier's callback URL
 * - unsubscribeHook: DELETE /api-hooks?id= to remove it
 * - performList: Polling fallback for sample data
 */

const API_BASE_URL = 'https://api.crewform.tech/functions/v1';

const getBaseUrl = () => {
    return API_BASE_URL;
};

/**
 * Transform raw task/run data from the API into the standard webhook
 * payload shape so that Zapier field mappings are consistent whether
 * the data comes from a live webhook or from the polling fallback.
 */
const normaliseTaskPayload = (raw, event) => ({
    id: raw.id,
    event: event,
    task_id: raw.id || null,
    team_run_id: raw.team_id ? raw.id : null,
    task_title: raw.title || raw.input_task || '',
    agent_name: raw.agent_name || raw.team_name || '',
    status: raw.status || '',
    result_preview: raw.result
        ? raw.result.substring(0, 500)
        : (raw.output ? raw.output.substring(0, 500) : ''),
    result_full: raw.result || raw.output || '',
    error: raw.error || raw.error_message || null,
    timestamp: raw.updated_at || raw.created_at || new Date().toISOString(),
});

/**
 * Create a REST Hook trigger definition for a given event.
 *
 * @param {string}  key         - Zapier trigger key (e.g. 'task_completed')
 * @param {string}  event       - CrewForm event name (e.g. 'task.completed')
 * @param {string}  noun        - Display noun (e.g. 'Task')
 * @param {string}  label       - Human-readable label
 * @param {string}  desc        - Description shown in Zapier
 * @param {string}  listUrl     - API endpoint for sample data (polling fallback)
 * @param {object}  outputFields - Output field definitions
 * @param {Array}   inputFields  - Input fields for filtering (e.g. agent/team dropdown)
 */
const makeRestHookTrigger = ({ key, event, noun, label, desc, listUrl, outputFields, inputFields }) => {
    return {
        key: key,
        noun: noun,

        display: {
            label: label,
            description: desc,
        },

        operation: {
            type: 'hook',

            // Input fields — shown during Zap setup for filtering
            inputFields: inputFields || [],

            // Called when a Zap is turned on — register the webhook
            performSubscribe: async (z, bundle) => {
                const body = {
                    event: event,
                    target_url: bundle.targetUrl,
                };

                // Pass optional agent/team filter from the input fields
                if (bundle.inputData.agent_id) {
                    body.agent_id = bundle.inputData.agent_id;
                }
                if (bundle.inputData.team_id) {
                    body.team_id = bundle.inputData.team_id;
                }

                const response = await z.request({
                    url: `${getBaseUrl(bundle)}/api-hooks`,
                    method: 'POST',
                    body: body,
                });

                return response.data;
            },

            // Called when a Zap is turned off — remove the webhook
            performUnsubscribe: async (z, bundle) => {
                const response = await z.request({
                    url: `${getBaseUrl(bundle)}/api-hooks?id=${bundle.subscribeData.id}`,
                    method: 'DELETE',
                });

                return response.data;
            },

            // Called when a webhook fires — process the incoming payload
            perform: async (z, bundle) => {
                // Zapier sends the raw webhook body in bundle.cleanedRequest
                return [bundle.cleanedRequest];
            },

            // Called for sample data (Zap setup) — polling fallback
            performList: async (z, bundle) => {
                const response = await z.request({
                    url: `${getBaseUrl(bundle)}${listUrl}`,
                    method: 'GET',
                });

                // Transform raw API data to match the webhook payload schema
                const data = response.data;
                const items = Array.isArray(data) ? data.slice(0, 3) : [data];
                return items.map((item) => normaliseTaskPayload(item, event));
            },

            // Describe the shape of data Zapier receives
            sample: {
                id: '00000000-0000-0000-0000-000000000000',
                event: event,
                task_id: '00000000-0000-0000-0000-000000000000',
                team_run_id: null,
                task_title: 'Sample task title',
                agent_name: 'Sample Agent',
                status: 'completed',
                result_preview: 'This is a sample result preview...',
                result_full: 'This is the full result output from the agent. It contains the complete response text that can be used in downstream Zap actions like sending a Slack message.',
                error: null,
                timestamp: new Date().toISOString(),
            },

            outputFields: outputFields || [
                { key: 'id', label: 'ID' },
                { key: 'event', label: 'Event Type' },
                { key: 'task_id', label: 'Task ID' },
                { key: 'team_run_id', label: 'Team Run ID' },
                { key: 'task_title', label: 'Title' },
                { key: 'agent_name', label: 'Agent / Team Name' },
                { key: 'status', label: 'Status' },
                { key: 'result_preview', label: 'Result Preview (first 500 chars)' },
                { key: 'result_full', label: 'Result Full Text', type: 'string' },
                { key: 'error', label: 'Error Message' },
                { key: 'timestamp', label: 'Timestamp' },
            ],
        },
    };
};

module.exports = { makeRestHookTrigger, getBaseUrl };

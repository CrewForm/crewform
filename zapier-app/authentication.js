/**
 * CrewForm Zapier Authentication
 *
 * Uses API Key auth — the user enters their CrewForm REST API key,
 * which is sent as an X-API-Key header on all requests.
 *
 * All requests go to the CrewForm production API at api.crewform.tech.
 *
 * The test function calls GET /api-me to verify the key is valid
 * and returns the connected account label.
 */

const API_BASE_URL = 'https://api.crewform.tech/functions/v1';

const test = async (z, bundle) => {
    const response = await z.request({
        url: `${API_BASE_URL}/api-me`,
        method: 'GET',
    });

    if (response.status !== 200) {
        throw new z.errors.Error('Invalid API Key', 'AuthenticationError', response.status);
    }

    return response.data;
};

const getConnectionLabel = (z, bundle) => {
    return `${bundle.inputData.workspace_name} (${bundle.inputData.email || bundle.inputData.id})`;
};

const authentication = {
    type: 'custom',

    fields: [
        {
            key: 'api_key',
            label: 'API Key',
            type: 'string',
            required: true,
            helpText: 'Your CrewForm REST API key. Find it in Settings → API Keys.',
        },
    ],

    test: test,
    connectionLabel: getConnectionLabel,
};

// Middleware — inject API key header and base URL into every request
const addApiKeyHeader = (request, z, bundle) => {
    // Prefix relative URLs with the production API base URL
    if (!request.url.startsWith('http')) {
        request.url = `${API_BASE_URL}${request.url}`;
    }

    request.headers = request.headers || {};
    if (bundle.authData && bundle.authData.api_key) {
        request.headers['X-API-Key'] = bundle.authData.api_key;
    }
    request.headers['Content-Type'] = 'application/json';
    return request;
};

module.exports = { authentication, addApiKeyHeader };



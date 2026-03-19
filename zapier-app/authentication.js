/**
 * CrewForm Zapier Authentication
 *
 * Uses API Key auth — the user enters their CrewForm REST API key,
 * which is sent as an X-API-Key header on all requests.
 *
 * The test function calls GET /api-me to verify the key is valid
 * and returns the connected account label.
 */

const PRODUCTION_API_URL = 'https://api.crewform.tech/functions/v1';

const test = async (z, bundle) => {
    const apiUrl = bundle.authData.api_url || PRODUCTION_API_URL;
    const response = await z.request({
        url: `${apiUrl}/api-me`,
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
        {
            key: 'api_url',
            label: 'API URL',
            type: 'string',
            required: false,
            default: PRODUCTION_API_URL,
            helpText:
                'CrewForm API endpoint. Leave as default unless you are self-hosting.',
        },
    ],

    test: test,
    connectionLabel: getConnectionLabel,
};

// Middleware — inject API key + base URL into every request
const addApiKeyHeader = (request, z, bundle) => {
    const apiUrl = bundle.authData.api_url || PRODUCTION_API_URL;
    // Prefix relative URLs with the API URL
    if (!request.url.startsWith('http')) {
        request.url = `${apiUrl}${request.url}`;
    }

    request.headers = request.headers || {};
    request.headers['X-API-Key'] = bundle.authData.api_key;
    request.headers['Content-Type'] = 'application/json';
    return request;
};

module.exports = { authentication, addApiKeyHeader };



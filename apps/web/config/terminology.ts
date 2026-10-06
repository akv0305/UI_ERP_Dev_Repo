export const terminology = {
  app: {
    title: 'UIE ERP',
    description: 'Unique Infra ERP web application.',
  },
  home: {
    heading: 'Unique Infra ERP',
    intro: 'Monorepo scaffold health check for the web and API applications.',
    serverSectionTitle: 'Server-side health',
    serverSectionHint: 'Fetched on the server directly from the API base URL.',
    clientSectionTitle: 'Client-side health',
    clientSectionHint: 'Fetched through the Next.js rewrite at /api/health.',
  },
  fields: {
    status: 'Status',
    service: 'Service',
    version: 'Version',
    time: 'Time',
  },
  actions: {
    checkHealth: 'Check API health',
    checking: 'Checking...',
  },
  messages: {
    serverUnavailable: 'The API health endpoint could not be reached from the server.',
    clientIdle: 'Press the button to call /api/health through the web rewrite.',
    clientSuccess: 'The rewrite to the API succeeded.',
    clientError: 'The API health endpoint could not be reached from the browser.',
  },
} as const;

export type Terminology = typeof terminology;

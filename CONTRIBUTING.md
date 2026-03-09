# Contributing to CrewForm

First off, thank you for considering contributing to CrewForm! It's people like you that make CrewForm such a great open-source tool. We welcome contributions from everyone.

## Code of Conduct

By participating in this project, you are expected to uphold standard open-source community guidelines. Please treat all maintainers and contributors with respect and professionalism.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing GitHub issues as you might find that it has already been reported. When creating a bug report, please include as many details as possible:

*   Use a clear and descriptive title.
*   Describe the exact steps to reproduce the problem.
*   Provide specific examples, logs, or screenshots to demonstrate the issue.
*   Include your environment details (OS, Node version, browser, etc.).

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please:

*   Use a clear and descriptive title.
*   Provide a step-by-step description of the suggested enhancement.
*   Explain why this enhancement would be useful to most CrewForm users and how it aligns with the project goals.

### Pull Requests

1.  Fork the repo and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  If you've changed APIs, update the documentation.
4.  Ensure the test suite passes and your code lints correctly.
5.  Make sure your PR description clearly describes the problem and solution. Include the relevant issue number if applicable.

## Development Setup

To set up the project locally for development:

1.  **Fork and clone** the repository to your local machine:
    ```bash
    git clone https://github.com/YOUR_USERNAME/crewform.git
    cd crewform
    ```

2.  **Install dependencies** (for both frontend and the task runner):
    ```bash
    npm install
    cd task-runner && npm install && cd ..
    ```

3.  **Environment Variables**:
    Copy `.env.example` to `.env.local` for the frontend and configure the required Supabase credentials and API keys. Do the same for `task-runner` if applicable.

4.  **Start the development servers**:
    ```bash
    # Start the frontend
    npm run dev
    
    # In a separate terminal, start the task runner:
    npm run task-runner:dev # or the relevant start command
    ```

## Project Structure

*   `src/`: Frontend React application built with Vite, Tailwind CSS, and ShadCN UI.
*   `ee/`: Enterprise Edition proprietary code (license validation, feature flags). **Requires CLA.**
*   `task-runner/`: Node.js backend execution engine.
*   `supabase/`: Database schema, migrations, and edge functions.
*   `crewform-docs/`: Project documentation and ROADMAP.

## Coding Standards

*   **TypeScript**: Use strictly typed TypeScript. Avoid using `any` wherever possible.
*   **Linting & Formatting**: We use ESLint and Prettier. Ensure your code passes all lint checks (`npm run lint`).
*   **Components**: Follow the established React functional component patterns in `src/components`, keeping components modular and utilizing specialized hooks in `src/hooks`.

## Community Edition vs Enterprise Edition

CrewForm uses a dual-license (open-core) model:

*   **Community Edition** (everything outside `ee/`)  — Licensed under AGPL-3.0. Contributions welcome!
*   **Enterprise Edition** (inside `ee/`)  — Proprietary. Contributions require a signed **Contributor License Agreement (CLA)**.

If you're unsure whether your change touches EE code, just open an issue or PR and we'll guide you.

## License

By contributing to Community Edition code (outside `ee/`), you agree that your contributions will be licensed under the project's [GNU Affero General Public License v3.0 (AGPL v3)](LICENSE).

Contributions to Enterprise Edition code (inside `ee/`) require a signed Contributor License Agreement. Contact team@crewform.tech for details.

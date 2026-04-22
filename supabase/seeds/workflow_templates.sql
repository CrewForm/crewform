-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: 5 starter workflow templates
-- Run against a Supabase instance to populate the template library.
-- These use a placeholder workspace_id and creator_id that should be replaced.
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: Set your workspace/creator IDs here
-- In production, these templates are owned by the CrewForm system workspace.

INSERT INTO workflow_templates (name, description, readme, category, tags, icon, template_definition, variables, is_published, workspace_id, creator_id)
VALUES

-- ─── 1. Weekly Sports Coach ─────────────────────────────────────────────────
(
  'Weekly Sports Coach',
  'Get weekly coaching insights, training tips, and development advice for your sport and age group. Perfect for youth coaches who want AI-assisted session planning.',
  '## Weekly Sports Coach

This template creates an AI coaching assistant that delivers weekly insights tailored to your sport and age group.

### What You Get
- A dedicated coaching agent with deep knowledge of youth sport development
- Automatic weekly delivery via CRON trigger (configurable)
- Age-appropriate drill suggestions, tactical tips, and development milestones

### How to Use
1. Install the template and fill in your sport, age group, and focus areas
2. The agent will run on your configured schedule
3. Check task results for your weekly coaching brief',
  'coaching',
  ARRAY['sports', 'coaching', 'weekly', 'youth', 'training'],
  '🏉',
  '{
    "agents": [{
      "name": "{{sport}} Coach",
      "description": "Expert {{sport}} coach specialising in {{age_group}} youth development. Provides weekly training insights, drill ideas, and development tips.",
      "system_prompt": "You are an expert {{sport}} coach with extensive experience in youth development, specifically working with {{age_group}} players.\n\nYour role is to provide weekly coaching insights that include:\n\n1. **Training Focus** — What skills and techniques to prioritise this week for {{age_group}} players\n2. **Drill Ideas** — 2-3 age-appropriate drills with clear setup instructions\n3. **Tactical Awareness** — Simple concepts that {{age_group}} players can start to understand\n4. **Physical Development** — Age-appropriate fitness and conditioning tips\n5. **Player Management** — Tips for keeping {{age_group}} players engaged and having fun\n6. **Things to Watch For** — Common challenges and red flags at this age group\n\nFocus areas to emphasise: {{focus_areas}}\n\nKeep advice practical, actionable, and fun. Remember these are young players — enjoyment and development over results.\n\nFormat your output as a well-structured coaching brief with clear headings and bullet points.",
      "model": "gpt-4o-mini",
      "provider": "openai",
      "temperature": 0.7,
      "max_tokens": null,
      "tags": ["coaching", "{{sport}}"],
      "tools": ["web_search"]
    }],
    "team": null,
    "trigger": {
      "type": "cron",
      "cron_expression": "{{cron_expression}}",
      "task_title_template": "Weekly {{sport}} Coaching — {{age_group}}",
      "task_description_template": "Generate this week''s coaching insights for {{age_group}} {{sport}} players. Focus on: {{focus_areas}}"
    }
  }'::jsonb,
  '[
    {"key": "sport", "label": "Sport", "type": "text", "placeholder": "e.g. Rugby, Football, Cricket, Basketball", "required": true, "default": ""},
    {"key": "age_group", "label": "Age Group", "type": "text", "placeholder": "e.g. Under 8s moving to Under 9s", "required": true, "default": ""},
    {"key": "focus_areas", "label": "Focus Areas", "type": "text", "placeholder": "e.g. tackling technique, game awareness, passing accuracy", "required": false, "default": "general skills development and game awareness"},
    {"key": "cron_expression", "label": "Schedule (CRON)", "type": "text", "placeholder": "0 9 * * 5 = every Friday at 9am", "required": false, "default": "0 9 * * 5"}
  ]'::jsonb,
  true,
  NULL,
  NULL
),

-- ─── 2. Content Research Pipeline ───────────────────────────────────────────
(
  'Content Research Pipeline',
  'A 3-agent pipeline that researches a topic, analyses findings, and writes publication-ready content. Ideal for blog posts, reports, and thought leadership.',
  '## Content Research Pipeline

A team of 3 AI agents working in sequence to produce high-quality written content.

### Pipeline Steps
1. **Researcher** — Gathers information, finds sources, and builds a knowledge base
2. **Analyst** — Extracts key insights, identifies trends, and structures findings
3. **Writer** — Synthesizes everything into polished, publication-ready content

### Best For
- Blog posts and articles
- Market research reports
- Technical documentation
- Thought leadership pieces',
  'research',
  ARRAY['research', 'content', 'writing', 'pipeline', 'blog'],
  '📝',
  '{
    "agents": [
      {
        "name": "{{topic}} Researcher",
        "description": "Research specialist that gathers comprehensive information on {{topic}}.",
        "system_prompt": "You are a thorough researcher. Your task is to gather comprehensive information about {{topic}} for a {{audience}} audience.\n\nResearch guidelines:\n- Find current, relevant information and data points\n- Identify key trends, statistics, and expert opinions\n- Note any controversies or differing viewpoints\n- Gather real-world examples and case studies\n\nOutput a structured research brief with sources and key findings.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.3,
        "max_tokens": null,
        "tags": ["research"],
        "tools": ["web_search"]
      },
      {
        "name": "{{topic}} Analyst",
        "description": "Analyses research findings and extracts actionable insights.",
        "system_prompt": "You are an analytical thinker. Given research findings on {{topic}}, your job is to:\n\n1. Identify the most important insights and trends\n2. Find connections between data points\n3. Prioritise findings by relevance to a {{audience}} audience\n4. Suggest a narrative structure for the final content\n5. Highlight any gaps in the research\n\nOutput a structured analysis with prioritised insights and a recommended content outline.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.4,
        "max_tokens": null,
        "tags": ["analysis"],
        "tools": []
      },
      {
        "name": "{{topic}} Writer",
        "description": "Writes polished, publication-ready content from research and analysis.",
        "system_prompt": "You are a skilled content writer. Using the research and analysis provided, write a compelling piece about {{topic}} for a {{audience}} audience.\n\nWriting guidelines:\n- Tone: {{tone}}\n- Include data points and examples from the research\n- Use clear headings and subheadings\n- Write in an engaging, accessible style\n- Include a strong introduction and conclusion\n- Aim for 1,500-2,000 words\n\nProduce publication-ready content in markdown format.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.7,
        "max_tokens": null,
        "tags": ["writing"],
        "tools": []
      }
    ],
    "team": {
      "name": "{{topic}} Research Pipeline",
      "description": "End-to-end content pipeline: research → analysis → writing",
      "mode": "pipeline",
      "steps": [
        {"agent_index": 0, "step_name": "Research", "instructions": "Gather comprehensive information on {{topic}}", "expected_output": "Structured research brief with key findings"},
        {"agent_index": 1, "step_name": "Analysis", "instructions": "Analyse research findings and create content outline", "expected_output": "Prioritised insights and content structure"},
        {"agent_index": 2, "step_name": "Writing", "instructions": "Write publication-ready content using research and analysis", "expected_output": "Polished article in markdown format"}
      ]
    },
    "trigger": null
  }'::jsonb,
  '[
    {"key": "topic", "label": "Topic", "type": "text", "placeholder": "e.g. AI in Healthcare, Remote Work Trends", "required": true, "default": ""},
    {"key": "audience", "label": "Target Audience", "type": "text", "placeholder": "e.g. developers, executives, general public", "required": true, "default": ""},
    {"key": "tone", "label": "Writing Tone", "type": "text", "placeholder": "e.g. professional, casual, technical", "required": false, "default": "professional but accessible"}
  ]'::jsonb,
  true,
  NULL,
  NULL
),

-- ─── 3. Daily News Digest ───────────────────────────────────────────────────
(
  'Daily News Digest',
  'A 2-agent pipeline that curates and summarises the latest news in your industry. Delivered daily with key headlines, analysis, and actionable takeaways.',
  '## Daily News Digest

Stay informed with an AI-powered daily briefing tailored to your industry.

### How It Works
1. **Curator** — Scans for the latest news, announcements, and developments
2. **Summariser** — Distills findings into a concise, scannable digest

### Output Format
- Top headlines with quick summaries
- Key trends and patterns
- Actionable takeaways
- Links to original sources',
  'content',
  ARRAY['news', 'digest', 'daily', 'summary', 'industry'],
  '📰',
  '{
    "agents": [
      {
        "name": "{{industry}} News Curator",
        "description": "Curates the latest news and developments in {{industry}}.",
        "system_prompt": "You are a news curator specialising in {{industry}}. Your job is to:\n\n1. Find the latest news, announcements, and developments from the past 24 hours\n2. Prioritise by impact and relevance\n3. Include a mix of breaking news, trend pieces, and analysis\n4. Note key sources: {{sources}}\n\nOutput a structured list of 8-12 news items with headlines, brief descriptions, and source links.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.3,
        "max_tokens": null,
        "tags": ["news", "curation"],
        "tools": ["web_search"]
      },
      {
        "name": "{{industry}} Digest Writer",
        "description": "Writes a concise, scannable news digest from curated stories.",
        "system_prompt": "You are a digest writer. Given curated news items about {{industry}}, create a polished daily digest.\n\nFormat: {{format}}\n\nStructure:\n- **📋 Executive Summary** (3-4 sentences)\n- **🔥 Top Stories** (3-5 most important items, each with headline + 2-sentence summary)\n- **📈 Trends to Watch** (2-3 emerging patterns)\n- **💡 Takeaways** (2-3 actionable insights)\n\nKeep it concise and scannable. Busy professionals should be able to read it in under 5 minutes.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.5,
        "max_tokens": null,
        "tags": ["writing", "summary"],
        "tools": []
      }
    ],
    "team": {
      "name": "{{industry}} Daily Digest",
      "description": "Daily news pipeline: curation → digest",
      "mode": "pipeline",
      "steps": [
        {"agent_index": 0, "step_name": "Curate", "instructions": "Find and prioritise today''s {{industry}} news", "expected_output": "Structured list of 8-12 news items"},
        {"agent_index": 1, "step_name": "Summarise", "instructions": "Write concise daily digest from curated news", "expected_output": "Polished daily digest in specified format"}
      ]
    },
    "trigger": {
      "type": "cron",
      "cron_expression": "0 7 * * 1-5",
      "task_title_template": "Daily {{industry}} News Digest",
      "task_description_template": "Curate and summarise today''s top {{industry}} news"
    }
  }'::jsonb,
  '[
    {"key": "industry", "label": "Industry", "type": "text", "placeholder": "e.g. AI & Machine Learning, Fintech, SaaS", "required": true, "default": ""},
    {"key": "sources", "label": "Preferred Sources", "type": "text", "placeholder": "e.g. TechCrunch, Hacker News, The Verge", "required": false, "default": "major industry publications"},
    {"key": "format", "label": "Output Format", "type": "text", "placeholder": "e.g. email-friendly, bullet points, newsletter", "required": false, "default": "concise bullet-point format"}
  ]'::jsonb,
  true,
  NULL,
  NULL
),

-- ─── 4. Code Review Assistant ───────────────────────────────────────────────
(
  'Code Review Assistant',
  'An AI code reviewer that analyses code against configurable standards. Trigger via webhook from your CI pipeline for automated review feedback.',
  '## Code Review Assistant

Automated AI-powered code reviews triggered by your CI/CD pipeline.

### How It Works
1. Configure your language and coding standards
2. Set up the webhook trigger in your CI pipeline
3. On each trigger, the reviewer analyses the code and provides feedback

### Review Checks
- Code quality and readability
- Security vulnerabilities
- Performance concerns
- Adherence to configured standards
- Suggested improvements with examples',
  'devops',
  ARRAY['code-review', 'devops', 'automation', 'webhook', 'ci-cd'],
  '🔍',
  '{
    "agents": [{
      "name": "{{language}} Code Reviewer",
      "description": "Expert code reviewer for {{language}} codebases following {{standards}} standards.",
      "system_prompt": "You are an expert {{language}} code reviewer. Analyse code against these standards: {{standards}}\n\nReview checklist:\n1. **Code Quality** — Readability, naming conventions, code structure\n2. **Security** — Common vulnerabilities (injection, auth issues, data exposure)\n3. **Performance** — Inefficiencies, memory leaks, unnecessary complexity\n4. **Best Practices** — {{language}}-specific idioms and patterns\n5. **Maintainability** — Test coverage gaps, documentation, modularity\n\nSeverity levels: {{severity_level}}\n\nFor each issue found:\n- Describe the problem clearly\n- Explain why it matters\n- Provide a corrected code example\n- Rate severity (critical / warning / suggestion)\n\nEnd with a summary score and top 3 priorities.",
      "model": "gpt-4o",
      "provider": "openai",
      "temperature": 0.2,
      "max_tokens": null,
      "tags": ["code-review", "{{language}}"],
      "tools": []
    }],
    "team": null,
    "trigger": {
      "type": "webhook",
      "cron_expression": "",
      "task_title_template": "Code Review — {{language}}",
      "task_description_template": "Review submitted {{language}} code against {{standards}} standards"
    }
  }'::jsonb,
  '[
    {"key": "language", "label": "Language", "type": "text", "placeholder": "e.g. TypeScript, Python, Go, Rust", "required": true, "default": ""},
    {"key": "standards", "label": "Coding Standards", "type": "text", "placeholder": "e.g. Airbnb style guide, PEP 8, Google Go style", "required": false, "default": "industry best practices"},
    {"key": "severity_level", "label": "Severity Levels", "type": "text", "placeholder": "e.g. all levels, critical only, warnings+", "required": false, "default": "all levels — critical, warning, and suggestion"}
  ]'::jsonb,
  true,
  NULL,
  NULL
),

-- ─── 5. Weekly Report Generator ─────────────────────────────────────────────
(
  'Weekly Report Generator',
  'A 2-agent pipeline that analyses data and writes professional weekly reports. Perfect for team leads and managers who need automated status updates.',
  '## Weekly Report Generator

Automated weekly status reports for teams and departments.

### Pipeline
1. **Analyst** — Processes metrics and identifies highlights, risks, and trends
2. **Writer** — Creates a professional, stakeholder-ready report

### Report Sections
- Executive summary
- Key metrics and KPIs
- Highlights and wins
- Risks and blockers
- Next week priorities',
  'reporting',
  ARRAY['reporting', 'weekly', 'management', 'pipeline', 'status'],
  '📊',
  '{
    "agents": [
      {
        "name": "{{department}} Analyst",
        "description": "Analyses {{department}} metrics and identifies key highlights and risks.",
        "system_prompt": "You are a data analyst for the {{department}} department. Your job is to:\n\n1. Review the provided metrics: {{metrics}}\n2. Identify key highlights and wins from the past week\n3. Flag any risks, blockers, or declining trends\n4. Compare performance to previous periods\n5. Note items requiring stakeholder attention\n\nOutput a structured analysis with clear data points and trend indicators.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.3,
        "max_tokens": null,
        "tags": ["analysis", "reporting"],
        "tools": []
      },
      {
        "name": "{{department}} Report Writer",
        "description": "Writes professional weekly reports for {{stakeholders}}.",
        "system_prompt": "You are a professional report writer. Using the analysis provided, create a weekly report for {{department}} addressed to {{stakeholders}}.\n\nReport structure:\n- **Executive Summary** (3-4 sentences, the most important takeaways)\n- **Key Metrics** (table format with current vs previous week)\n- **Highlights & Wins** (bullet points)\n- **Risks & Blockers** (with severity and recommended actions)\n- **Next Week Priorities** (top 3-5 items)\n- **Action Items** (who, what, when)\n\nTone: Professional but concise. The reader should understand the state of {{department}} in under 3 minutes.",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "temperature": 0.5,
        "max_tokens": null,
        "tags": ["writing", "reporting"],
        "tools": []
      }
    ],
    "team": {
      "name": "{{department}} Weekly Report",
      "description": "Weekly report pipeline: analysis → report writing",
      "mode": "pipeline",
      "steps": [
        {"agent_index": 0, "step_name": "Analyse", "instructions": "Review {{department}} metrics and identify highlights, risks, and trends", "expected_output": "Structured analysis with data points"},
        {"agent_index": 1, "step_name": "Write Report", "instructions": "Write professional weekly report from analysis", "expected_output": "Stakeholder-ready weekly report"}
      ]
    },
    "trigger": {
      "type": "cron",
      "cron_expression": "0 8 * * 1",
      "task_title_template": "Weekly {{department}} Report",
      "task_description_template": "Generate the weekly status report for {{department}}"
    }
  }'::jsonb,
  '[
    {"key": "department", "label": "Department / Team", "type": "text", "placeholder": "e.g. Engineering, Marketing, Sales", "required": true, "default": ""},
    {"key": "metrics", "label": "Key Metrics to Track", "type": "text", "placeholder": "e.g. sprint velocity, bug count, revenue, churn rate", "required": true, "default": ""},
    {"key": "stakeholders", "label": "Report Audience", "type": "text", "placeholder": "e.g. VP Engineering, C-Suite, team leads", "required": false, "default": "team leadership"}
  ]'::jsonb,
  true,
  NULL,
  NULL
);

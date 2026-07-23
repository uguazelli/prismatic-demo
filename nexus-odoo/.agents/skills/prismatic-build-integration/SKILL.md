---
name: prismatic-build-integration
description: Build, modify, validate, deploy, and test Prismatic Code Native Integrations (CNI) from this repository. Use when the user asks to create a Prismatic integration, connect two systems through Prismatic, scaffold CNI TypeScript, add or change CNI flows, configure Prismatic components and connections, or troubleshoot a CNI build or deployment.
---

# Prismatic Build Integration

Use the upstream Prismatic workflow with Codex-native paths. Keep the user in control at scaffold, code-generation, and deployment boundaries.

## Resolve resources

Treat the directory containing this `SKILL.md` as `SKILL_DIR`.

- Runtime dispatcher: `SKILL_DIR/assets/runtime/scripts/run.ts`
- Runtime templates: `SKILL_DIR/assets/runtime/templates/integration/`
- Requirements specification: `SKILL_DIR/assets/runtime/scripts/questions/integration.yaml`
- Knowledge base: sibling skill `../integration-patterns/`
- API and platform reference: sibling skill `../prismatic-api/`
- Product documentation lookup: sibling skill `../prismatic-docs/`

The vendored runtime is from `prismatic-io/prismatic-skills` commit `954ccb1b6bb2f9b1ec1d7605a5ea5325d93aeca6` and retains its MIT license in `assets/runtime/LICENSE`.

Invoke runtime commands with the pinned project-local toolchain:

```bash
npm exec --prefix <SKILL_DIR>/assets/runtime -- tsx <SKILL_DIR>/assets/runtime/scripts/run.ts <command> [arguments]
```

Run commands from the working directory that contains this project's `.agents` folder so session state remains under `.prismatic/` in the project.

## Guardrails

- Never ask the user to paste tokens, passwords, private keys, or webhook URLs into chat.
- Store local secrets only in ignored `.env` files, or have the user configure them in Prismatic's admin UI.
- Search components and connections through the runtime commands, not broad Prismatic MCP list/init/publish tools; those omit data required by scaffolding.
- Use official API documentation only when researching an external system.
- Do not deploy or publish until the user explicitly approves the reviewed build.
- Do not silently choose an authentication or connection strategy. Explain the tradeoff and obtain the user's decision.
- Preserve existing code and configuration when modifying an integration.

## Workflow

### 1. Orient

Determine whether this is a new integration or a modification. For a new integration, obtain a concise integration name and description. Ask one decision question at a time when user input is required.

Read `../integration-patterns/references/narration-guide.md` and `../integration-patterns/references/tool-catalog.md`. Then run:

```bash
npm exec --prefix <SKILL_DIR>/assets/runtime -- tsx <SKILL_DIR>/assets/runtime/scripts/run.ts prerequisites <name> --type integration
```

Report missing prerequisites without exposing credentials. Prismatic CLI authentication is required for registry searches, scaffolding, deployment, and tests.

### 2. Gather and confirm requirements

Read `../integration-patterns/references/spec-loading-config.md` and the runtime requirements specification. Record confirmed choices with `record-choices`; use exact choice slugs from the specification. For each source, destination, or additional system:

1. Run `find-components` before claiming a component exists.
2. Record the complete component object returned by the search.
3. Follow the connection dependency chain and present any existing connection to the user before selecting it.
4. If no component exists, ask whether to use direct HTTP calls or build a custom component.

For multi-flow integrations, record integration-level answers first, then flow-level answers with `--flow <flow-id>`. Before scaffolding, show a plain-language summary of systems, triggers, flows, mappings, connections, error handling, and operational behavior. Wait for confirmation.

### 3. Scaffold

Run `scaffold-project` with every confirmed public and private component key. Do not hand-create manifests. Validate the scaffold with `validate-phase --phase scaffold --type integration`.

### 4. Generate code

Before editing source files:

1. Run `code-plan` for the confirmed session.
2. Read the referenced sections from `../integration-patterns/references/answer-to-code-cookbook.md`.
3. Read `../integration-patterns/references/spectral-types.md`; treat it as the type source of truth.
4. Read every file in the runtime integration templates directory.
5. Load only conditional pattern references relevant to the selected trigger, auth, state, and flow design.

Generate complete TypeScript without placeholder logic. Use component manifests and Prismatic config wrapper functions. Then run code-generation validation and `verify-code` against the confirmed session.

### 5. Build and review

Build with the generated project's package script. On failure, run `diagnose-build`, explain the root cause, apply a targeted fix, and rebuild. Present the files and behavior that will be deployed, then wait for approval.

### 6. Deploy and test

After approval, validate the deploy phase and run `deploy-integration`. Guide the user through any remaining connection or config values in Prismatic. Run `test-integration`, inspect execution results, and iterate until the requested flow works.

For unclear failures, inspect execution logs through the configured Prism MCP server or Prism CLI. In CNI logs, the full `onExecution` callback is one step; add temporary structured logging around individual component action results when deeper visibility is needed.

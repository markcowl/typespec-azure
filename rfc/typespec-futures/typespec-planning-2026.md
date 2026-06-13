# TypeSpec Planning 2026 — Summer Vision

## Overview

This document outlines the TypeSpec ecosystem's strategic direction for Summer 2026 and beyond. It extends and expands upon the existing team planning, organized into nine workstreams that collectively drive TypeSpec toward becoming the definitive API specification platform for Azure and beyond.

### Priorities Key

| Priority | Meaning |
|----------|---------|
| **Pri 0** | Must ship this period — blocking other teams or critical path |
| **Pri 1** | High value, planned for this period |
| **Pri 2** | Stretch goals / future period |

---

## 1. AutoRest Retirement / TypeSpec Native CI Tools

**Goal:** Complete the transformation from OpenAPI-centric tooling to TypeSpec-native CI pipelines, eliminating dependencies on AutoRest and OpenAPI 2.0 workflows.

### TypeSpec Linting Tool (Replaces LintDiff)

- **Pri 0** — Normalize TypeSpec suppression mechanisms and replace LintDiff with a TypeSpec-native linting tool
- Provide equivalent or better lint coverage compared to existing OpenAPI-based LintDiff
- Support suppression comments, baseline files, and incremental linting for PR workflows

### TypeSpec Breaking Change Detection

- **Pri 0** — Replace the OpenAPI Breaking Change Tool with a TypeSpec-native equivalent
- Detect breaking changes directly from TypeSpec source (not from generated OpenAPI)
- Support versioning-aware diff that understands `@added`/`@removed` decorators
- Integrate into CI pipelines as a required check

### TypeSpec Examples and Documentation

- **Pri 0** — Add TypeSpec equivalents to API documentation in the RPaaS wiki and ARM RPC
- Ensure all API guidance references TypeSpec as the primary authoring format
- Provide migration guides for teams still using OpenAPI 2.0 specs

### SDK Language Team Migration

- Drive CLI, PowerShell, and Terraform teams to consume TypeSpec or OpenAPI 3.0 instead of OpenAPI 2.0
- Provide tooling and guidance for the transition
- Establish timelines for OpenAPI 2.0 deprecation in downstream pipelines

---

## 2. TypeSpec Service Spec Tools

**Goal:** Build AI-powered tools that simplify common API specification workflows for service teams.

### AI Skills for Spec Authoring

- Intelligent code completion and generation for TypeSpec specs
- Context-aware suggestions based on Azure patterns and best practices
- Inline validation and quick-fix suggestions

### API Version Extraction Workflow

- **Pri 1** — Automated extraction of new API versions from existing specs
- Support complex versioning patterns (additive, breaking, preview/GA transitions)
- Generate version diff reports for review

### Spec Validation and Simplification

- AI-driven tools to validate specs against Azure guidelines
- Automated simplification of specs based on new patterns and templates
- Detect and suggest refactoring opportunities (e.g., migrate to newer ARM templates)

### TypeSpec-to-TypeSpec Source Emitter

- A source-level emitter that can transform TypeSpec code in an API-neutral way
- Rule-based transformations (e.g., apply new decorator patterns, migrate deprecated constructs)
- Preserve authoring intent while modernizing spec structure
- Enable bulk migrations across the spec repo

---

## 3. TypeSpec Contribution Tools

**Goal:** Accelerate development of TypeSpec extensions (libraries, emitters, linting rules, documentation, and tools) using AI-assisted workflows.

### AI Skills for Extension Authoring

- **Pri 0** — Basic TypeSpec Skill Library covering:
  - Formatting and code style
  - Testing and examples
  - Code coverage analysis
  - Documentation generation
- Scaffolding tools for new libraries, emitters, and linter rules
- AI-assisted bug fix and feature development workflows

### Website-Integrated Documentation

- **Pri 0** — Website-integrated documentation chatbots
- Interactive docs that can answer questions about TypeSpec APIs, decorators, and patterns
- Context-aware help integrated into the authoring experience

### Data Collection for AI PRs

- **Pri 0** — Systematic data collection from AI-generated PRs
- Track quality, acceptance rate, and iteration patterns
- Use data to improve AI skill accuracy over time

---

## 4. TypeSpec Simplification

**Goal:** Extend TypeSpec core to make common specification patterns easier to write, reducing boilerplate and cognitive load.

### Functions

- **Pri 0** — First-class functions in TypeSpec
- Enable composable logic within specs without requiring JavaScript decorator implementations
- Support function composition for building up libraries from TypeSpec templates

### Meta-Language Improvements

- **Pri 0** — Improvements to the TypeSpec meta-language for library/emitter authors
- **Pri 0** — String interpolation in function and template implementations
- **Pri 1** — TypeKit normalization for consistent type manipulation
- **Pri 1** — Building functions and decorators without code (declarative definitions)

### Composable Operations and Templates

- **Pri 1** — Composable transformation functions/templates
- Allow function composition to provide basic, composable operations for building up libraries
- Make libraries, functions, and templates easier to write and maintain
- Reduce the JavaScript knowledge required for common library patterns

### Complex Versioning Patterns

- **Pri 1** — Versioning mechanism for template instantiation parameter changes
- **Pri 1** — Versioning decorators for decorator application (including new syntax)
- **Pri 1** — Version range decorators for expressing compatibility spans
- TypeSpec-native scope for versioning that goes beyond current `@added`/`@removed`

### Compiler and Infrastructure

- **Pri 1** — Additional test coverage for core compiler
- **Pri 1** — Refactoring to simplify compiler code
- New performance tests and minimum performance standards for linting rules, decorators, and JS APIs

---

## 5. TypeSpec-Azure Simplification

**Goal:** Use new TypeSpec core features (especially functions) to simplify the `typespec-azure-core` and `typespec-azure-resource-manager` libraries.

### Azure.Core Simplification

- **Pri 1** — API normalization for the REST, Azure.Core, and Azure.ResourceManager libraries
- Leverage functions to replace complex decorator-based patterns
- Reduce template nesting and improve readability of Azure specs
- Provide simpler abstractions for common patterns (LRO, paging, error handling)

### Azure.ResourceManager Simplification

- **Pri 0** — Merge Patch support in Azure libraries
- Simplify ARM resource definitions using composable functions
- Reduce boilerplate for standard CRUD operations
- Make ARM-specific patterns (singleton resources, child resources, scoped resources) more intuitive

### Migration Tooling

- Automated migration of existing specs to simplified patterns
- Backward-compatible changes with deprecation paths
- Side-by-side comparison tooling for validating migrations

---

## 6. Agentic Tools for Repository Maintenance

**Goal:** Deploy AI agents to maintain the azure-rest-api-specs, typespec, and typespec-azure repositories.

### Issue Triage Agent

- **Pri 0** — Automated issue triage for incoming bug reports and feature requests
- Classify, label, assign, and prioritize issues
- Detect duplicates and link related issues

### Release Management Agents

- **Pri 0** — Release notes generation
- **Pri 1** — Updating specs and SDK repos with new version releases
- **Pri 1** — Creating hotfix releases
- **Pri 1** — Versioning and changelog updates
- End-to-end release orchestration with human approval gates

### Continuous Code Quality

- **Pri 0** — Continuous code quality, test coverage, samples, and documentation skills
- Automated detection of bad patterns in specs
- API-neutral simplification suggestions
- Continuous validation and testing across the spec repo

### Spec Rollout Tools

- Tools for rolling out TypeSpec changes into the spec repo at scale
- Automated PR generation for bulk migrations
- Impact analysis before rolling out breaking changes

### Documentation Maintenance

- Keep specs and docs in sync automatically
- Detect stale documentation and generate updates
- Cross-reference validation between specs and published docs

---

## 7. Accelerating Service Development

**Goal:** Provide mechanisms that speed up the service team development lifecycle from spec to running service.

### Service Stub Generation

- Tools to generate service implementation stubs from TypeSpec specs
- Support for multiple target languages and frameworks
- Include boilerplate for auth, middleware, and observability

### Test Generation

- Automated test case generation from spec definitions
- Contract tests that validate service implementations against their specs
- Load test scaffolding based on API shape and expected usage patterns

### Live Service Validation

- Tools to validate running services against their TypeSpec specs
- Runtime conformance checking (request/response validation)
- Integration with CI/CD for continuous conformance

### ARM to RPaaS TypeSpec Transformation

- **Pri 1** — Automated transformation of ARM specs to RPaaS TypeSpec
- Handle complex resource hierarchies and cross-resource references
- Validate transformed specs against RPaaS requirements

---

## 8. API Audits, Cleanup, and Completeness Assessments

**Goal:** Drive `typespec-azure-core`, `typespec-azure-resource-manager`, and TCGC to 1.0 quality through systematic audits.

### API Surface Audit

- Comprehensive review of all public APIs in core packages
- Identify inconsistencies, naming issues, and gaps
- Document intended vs. actual behavior for all decorators and templates

### Cleanup and Deprecation

- Remove or deprecate APIs that have been superseded
- Consolidate overlapping functionality
- Establish clear migration paths for deprecated APIs

### Completeness Assessment

- Gap analysis: what patterns exist in Azure services that aren't well-supported?
- Prioritize missing patterns by service team demand
- Define 1.0 criteria for each package:
  - `@azure-tools/typespec-azure-core`
  - `@azure-tools/typespec-azure-resource-manager`
  - `@azure-tools/typespec-client-generator-core` (TCGC)
  - Potentially the REST library

### Stability Guarantees

- Define semantic versioning policies for 1.0+
- Establish breaking change policies and review processes
- Create compatibility test suites

---

## 9. TypeSpec and TypeSpec-Azure Additions for New Service Patterns

**Goal:** Extend TypeSpec to support emerging Azure service patterns that aren't well-served by current abstractions.

### New ARM Patterns

- Support for new ARM resource lifecycle patterns
- Enhanced common-types coverage
- Better modeling for complex resource relationships and dependencies

### Streaming Support

- First-class support for streaming APIs (SSE, WebSocket, gRPC streaming)
- TypeSpec modeling for streaming request/response bodies
- Emitter support for generating streaming client code

### Azure AI and Foundry APIs

- Better support for Azure AI service patterns
- Foundry API modeling (agents, prompt flows, model deployments)
- Support for AI-specific patterns (token streaming, tool calling, structured outputs)
- Templates for common AI service shapes

### Additional Patterns

- Event-driven API patterns (webhooks, event subscriptions)
- Batch and bulk operation patterns
- Multi-tenant and cross-region patterns
- API gateway and aggregation patterns

---

## 10. Success Metrics

Each workstream defines measurable outcomes to track progress and validate that our investments are delivering value.

### Specs Repo CI Tools (§1)

| Metric | Baseline | Target |
|--------|----------|--------|
| Time to completion for a specs PR (open → merge) | TBD | 30% reduction |
| Time spent resolving breaking change errors | TBD | 50% reduction |
| Time spent resolving LintDiff errors | TBD | 50% reduction |
| Time spent resolving example errors | TBD | 50% reduction |
| Time in review (reviewer turnaround) | TBD | 25% reduction |
| CI check wall-clock time | TBD | No regression vs. OpenAPI tools |

### TypeSpec & TypeSpec-Azure Tooling (§3, §6)

| Metric | Baseline | Target |
|--------|----------|--------|
| Number of contributed PRs (AI-assisted) | TBD | 2× increase per quarter |
| Time taken per PR (AI-assisted feature/fix) | TBD | 50% reduction |
| Token cost per AI-assisted PR | TBD | Establish baseline, then 25% reduction |
| Human interaction rounds required per PR | TBD | Reduce to ≤3 rounds for standard features |
| New linting rules contributed (AI-assisted) | TBD | 2× increase per quarter |

### TypeSpec Simplification (§4, §5)

| Metric | Baseline | Target |
|--------|----------|--------|
| Time to author new TypeSpec APIs, TypeKits, functions, and template building blocks | TBD | 40% reduction |
| Token cost for AI-assisted TypeSpec feature development | TBD | Establish baseline, then 30% reduction |
| Human interaction rounds for new TypeSpec features | TBD | Reduce to ≤5 rounds for complex features |
| Time to author new specs in azure-rest-api-specs (using simplified patterns) | TBD | 40% reduction |
| Token cost for AI-assisted spec authoring | TBD | Establish baseline, then 30% reduction |
| Human interaction rounds for spec authoring | TBD | Reduce to ≤3 rounds for standard resources |
| Lines of TypeSpec per resource definition (boilerplate reduction) | TBD | 30% reduction |

---

## 11. End-to-End User Experience Vision

When all workstreams deliver, the combined user experience transforms how teams interact with the Azure API ecosystem.

### The Service Team Experience (When Complete)

A service team starting a new API will:

1. **Author** their spec in TypeSpec using AI-assisted tooling that suggests patterns, validates against Azure guidelines in real-time, and auto-completes complex ARM templates — all without leaving their editor.
2. **Evolve** their API by adding versions with AI-assisted extraction, where the tool understands versioning semantics and generates the correct decorators and diff reports automatically.
3. **Validate** through TypeSpec-native CI that runs in seconds (not minutes), gives clear actionable errors for breaking changes and lint violations, and provides one-click fixes for common issues.
4. **Ship** with confidence because live service validation confirms their implementation matches the spec, and generated stubs/tests gave them a head start on implementation.

### The TypeSpec Contributor Experience (When Complete)

A developer extending TypeSpec will:

1. **Scaffold** a new library, emitter, or linting rule using AI skills that generate working boilerplate with tests and documentation from a natural-language description.
2. **Implement** using functions and composable templates that require minimal JavaScript knowledge, with AI assistance that understands TypeSpec internals.
3. **Validate** through continuous quality agents that check code coverage, performance, documentation completeness, and pattern adherence automatically.
4. **Release** through automated agents that handle versioning, changelogs, release notes, and downstream propagation.

### The Platform Maintainer Experience (When Complete)

The TypeSpec platform team will:

1. **Triage** issues automatically, with agents classifying, deduplicating, and routing incoming reports.
2. **Maintain** specs at scale through agentic tools that detect drift, suggest simplifications, and roll out pattern updates across thousands of specs.
3. **Audit** API surfaces systematically, with tooling that identifies gaps, inconsistencies, and 1.0 readiness across all packages.

---

## 12. Quarterly Roadmap and Capabilities

### Summer 2026 (July–September)

**End-to-end capabilities delivered:**
- Service teams can run TypeSpec-native linting and breaking change detection in CI (replacing LintDiff and OpenAPI breaking change tools)
- Contributors can use a basic AI skill library for formatting, testing, examples, and documentation
- Issue triage and release notes are automated
- Functions are available in TypeSpec for library authors

**Key deliverables:**
- TypeSpec CI tools replace LintDiff/Breaking Change (§1)
- Functions ship in TypeSpec core (§4)
- AI skill library v1 (§3)
- Issue triage agent live (§6)
- Merge Patch in Azure libraries (§5)
- Website documentation chatbots (§3)
- Data collection pipeline for AI PRs (§3)

**Metrics checkpoint:**
- Establish baselines for all metrics above
- CI tool parity confirmed (no regression in coverage)
- Measure initial AI skill library usage and token costs

### Fall 2026 (October–December)

**End-to-end capabilities delivered:**
- Service teams author specs using simplified Azure patterns (functions-based) with dramatically less boilerplate
- AI-assisted version extraction workflows are operational
- Continuous code quality agents are monitoring repos and flagging issues proactively
- TypeSpec-to-TypeSpec source emitter enables bulk pattern migrations

**Key deliverables:**
- Azure library simplification using functions (§5)
- API version extraction workflow (§2)
- TypeSpec-to-TypeSpec source emitter (§2)
- Composable operations and templates (§4)
- Release management agents (§6)
- 1.0 audit complete for core packages (§8)
- Service stub generation v1 (§7)

**Metrics checkpoint:**
- 30% reduction in specs PR completion time
- 50% reduction in time resolving CI errors
- 2× increase in AI-assisted PRs to TypeSpec repos
- Establish token cost baselines for all AI workflows

### Winter 2026–27 (January–March)

**End-to-end capabilities delivered:**
- Full agentic maintenance suite operational across all repos
- Streaming and AI/Foundry patterns available for service teams
- SDK language teams fully migrated off OpenAPI 2.0
- All core packages at 1.0 readiness with stability guarantees
- Live service validation integrated into service team CI/CD

**Key deliverables:**
- Streaming and AI/Foundry patterns (§9)
- Full agent suite operational (§6)
- SDK team migration complete — CLI, PowerShell, Terraform on TypeSpec/OpenAPI3 (§1)
- Complex versioning patterns (§4)
- Live service validation (§7)
- ARM to RPaaS transformation tool (§7)
- New ARM patterns (§9)

**Metrics checkpoint:**
- All target metrics achieved or on-track
- 40% reduction in time to author new TypeSpec features
- 40% reduction in time to author new specs
- ≤3 human interaction rounds for standard AI-assisted work
- Token costs reduced 25-30% from baseline

---

## References

- Prior planning: [TypeSpec Team Planning (Loop)](https://loop.cloud.microsoft/p/eyJ3Ijp7InUiOiJodHRwczovL21pY3Jvc29mdC5zaGFyZXBvaW50LmNvbS8_bmF2PWN6MGxNa1ltWkQxaUlXOXhaV2sxUTJSVGFqQlRRbWd4UW00dFVWQk9NbkZMTUZoV2NFOXBZVVpRYUhOblVGUm9SMUpPZEc4ME0yTXpVa3N4VFRsUmNEUlBWbkZtVlhkdlpXa21aajB3TVZWUlYwVlpVRTFHU0U5WFF6Uk1WMVphTlVGSlJWYzNURXRMVGtSUFRrOHlKbU05Sm1ac2RXbGtQVEUlM0QiLCJyIjpmYWxzZX0sInAiOnsidSI6Imh0dHBzOi8vbWljcm9zb2Z0LnNoYXJlcG9pbnQuY29tL3NpdGVzLzRiOGNkNTZiLTZkNDAtNGFiMy1iZWE1LTE3NDRkNGQ3M2NkZj9uYXY9Y3owbE1rWnphWFJsY3lVeVJqUmlPR05rTlRaaUxUWmtOREF0TkdGaU15MWlaV0UxTFRFM05EUmtOR1EzTTJOa1ppWmtQV0loYjNGbGFUVkRaRk5xTUZOQ2FERkNiaTFSVUU0eWNVc3dXRlp3VDJsaFJsQm9jMmRRVkdoSFVrNTBielF6WXpOU1N6Rk5PVkZ3TkU5V2NXWlZkMjlsYVNabVBUQXhWVkZYUlZsUVNqUTNTRGRYUWxoR1ZsbGFRVW8wU1ZvMldWbFVORnBVUlVJbVl6MGxNa1ltWm14MWFXUTlNU1poUFZSbFlXMXpKbkE5SlRRd1pteDFhV1I0SlRKR2JHOXZjQzF3WVdkbExXTnZiblJoYVc1bGNnJTNEJTNEIiwiciI6ZmFsc2V9LCJpIjp7ImkiOiJhZTBhYmU1Zi0yZDNiLTQwYjQtOWIwNS0yY2Q4MTMyNmI4MWMifX0)
- Repository: [Azure/typespec-azure](https://github.com/Azure/typespec-azure)
- TypeSpec core: [microsoft/typespec](https://github.com/microsoft/typespec)

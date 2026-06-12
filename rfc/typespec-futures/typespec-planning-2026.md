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
- Owner: Will

### TypeSpec Breaking Change Detection

- **Pri 0** — Replace the OpenAPI Breaking Change Tool with a TypeSpec-native equivalent
- Detect breaking changes directly from TypeSpec source (not from generated OpenAPI)
- Support versioning-aware diff that understands `@added`/`@removed` decorators
- Integrate into CI pipelines as a required check
- Owner: Mark

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
- Owner: Will

### Data Collection for AI PRs

- **Pri 0** — Systematic data collection from AI-generated PRs
- Track quality, acceptance rate, and iteration patterns
- Use data to improve AI skill accuracy over time
- Owner: Tim

---

## 4. TypeSpec Simplification

**Goal:** Extend TypeSpec core to make common specification patterns easier to write, reducing boilerplate and cognitive load.

### Functions

- **Pri 0** — First-class functions in TypeSpec
- Enable composable logic within specs without requiring JavaScript decorator implementations
- Support function composition for building up libraries from TypeSpec templates
- Owner: Will

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
- Owner: Tim

### Release Management Agents

- **Pri 0** — Release notes generation
  - Owner: Will
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

## Timeline Summary

| Quarter | Key Milestones |
|---------|---------------|
| **Summer 2026** | TypeSpec CI tools replace LintDiff/Breaking Change (§1), Functions ship (§4), AI skill library v1 (§3), Issue triage agent live (§6) |
| **Fall 2026** | Azure library simplification (§5), Service stub generation (§7), 1.0 audit complete (§8) |
| **Winter 2026-27** | Streaming and AI patterns (§9), Full agent suite operational (§6), SDK team migration complete (§1) |

---

## References

- Prior planning: [TypeSpec Team Planning (Loop)](https://loop.cloud.microsoft/)
- Repository: [Azure/typespec-azure](https://github.com/Azure/typespec-azure)
- TypeSpec core: [microsoft/typespec](https://github.com/microsoft/typespec)

---
name: "Plan Facebook Roofing Landing"
description: "Create an approval-first plan for a static Facebook-ad landing page that closely recreates a reference page and uses a Cloudflare Worker for lead submission and Google review retrieval."
argument-hint: "Reference URL, form fields, integrations, and deployment constraints"
agent: "plan"
---

Create a minimal, production-credible implementation plan for a Facebook-ad landing page.

Inputs:
- Reference URL or existing page to mirror closely
- Ad source and audience context
- Required form flow, fields, and CTA behavior
- Backend integrations such as JobNimbus and Google reviews
- Hosting/runtime constraints such as static site plus Cloudflare Worker

Required output:
1. UX and information architecture summary that preserves the reference page's flow and trust signals
2. Minimal technical architecture for the static site and Worker
3. Integration plan for form submission, review retrieval, caching, and failure handling
4. File and directory touch map
5. Validation plan
6. Risks, constraints, and open questions

Rules:
- Prefer the smallest viable implementation that can be deployed quickly
- Stay close to the reference page to avoid confusing paid-traffic visitors
- Flag requirements that are not fully achievable with native platform APIs
- Avoid retaining customer data unless explicitly requested
- If fallback retention is needed, recommend failure-only logging with minimal fields
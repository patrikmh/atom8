---
name: web-research
description: |
  Research any topic on the web using the browser automation skill.
  The agent directly uses playwright-cli via bash to search, browse, and extract
  information. No extension needed.
  Use when you need to find information about companies, people, news, products,
  or any topic that requires web browsing.
compatibility: Requires playwright-cli and bash tool.
license: MIT
metadata:
  version: "1.0.0"
  category: research
  author: atom8
  
  Requires: playwright-cli skill (for browser commands)
---

# Web Research

## Research Workflow

You are researching: **{{topic}}**

Follow this workflow step by step. Do NOT skip phases.

### Phase 1 — Search (Discover URLs)

Find 3-5 relevant URLs for this topic.

**Strategy:**
- Try direct navigation first if the topic contains a known website name (e.g., "Markethype" → go to https://www.markethype.io/sv/)
- If no known URL, use Gibiru search (https://gibiru.com/results.html?q=QUERY)
- For news about Swedish topics, use Sportbladet (https://www.aftonbladet.se/sportbladet), Aftonbladet (https://www.aftonbladet.se)
- For company info, use the company website's about page

**Commands:**
```bash
# Search with Gibiru
playwright-cli open "https://gibiru.com/results.html?q=YOUR+QUERY"

# Or direct to known site
playwright-cli open "https://www.example.com"

# Take snapshot to see current state
playwright-cli snapshot

# Extract links with eval
playwright-cli eval "() => { return Array.from(document.querySelectorAll('a')).map(a => ({text: a.textContent.trim().substring(0,80), href: a.href})).slice(0,20); }"

# Close browser
playwright-cli close
```

**Output format:**
```xml
<search_results>
  <source url="https://..." title="Page Title" relevance="high|medium|low" />
</search_results>
```

### Phase 2 — Browse (Extract Content)

Visit each source URL and extract the relevant content.

**Commands:**
```bash
playwright-cli open "https://URL"
playwright-cli snapshot

# Get page text content
playwright-cli eval "() => { var text = document.body.innerText; return text.substring(0,3000); }"

# Or extract specific elements
playwright-cli eval "() => { return Array.from(document.querySelectorAll('article, .article, .post, .news-item, .teaser, .story, .card, [data-testid]')).map(el => ({title: el.querySelector('h1,h2,h3,.title,.headline') ? el.querySelector('h1,h2,h3,.title,.headline').textContent.trim().substring(0,200) : '', text: el.textContent.trim().substring(0,300), href: el.querySelector('a') ? el.querySelector('a').href : ''})).filter(x => x.title); }"

# Close browser
playwright-cli close
```

**Output format:**
```xml
<page_content>
  <source url="https://..." title="Page Title" />
  <summary>Up to 800 chars of the main content</summary>
  <key_quotes>
    <quote>Important text from the page</quote>
  </key_quotes>
</page_content>
```

### Phase 3 — Synthesize (Produce Report)

Combine all extracted information into a structured report.

**Output format:**
```json
{
  "status": "ok",
  "topic": "{{topic}}",
  "summary": "Executive summary (2-3 sentences)",
  "key_findings": [
    {
      "claim": "What was found",
      "evidence": "Quote from source",
      "source": "https://...",
      "confidence": "high|medium|low"
    }
  ],
  "sources": [
    {
      "url": "https://...",
      "title": "Page title",
      "date": "YYYY-MM-DD or unknown"
    }
  ]
}
```

## Rules

1. **Cite every claim** — Every factual claim must have a source URL
2. **No hallucination** — If you can't find it, say "Not found" instead of making it up
3. **Handle failures** — If a site is blocked, paywalled, or returns no content, note it and try another source
4. **Use eval safely** — Keep eval functions simple. No template literals, no optional chaining, no async/await. Use regular string concatenation and ternary operators.
5. **Close sessions** — Always run `playwright-cli close` after each page to free resources
6. **Be concise** — Extract only the information relevant to the topic. Don't dump entire page text.

## Query Type Hints

- **Company**: Look for About page, founders, products, funding, employees
- **Person**: Look for biography, career, achievements, social media
- **News**: Look for latest articles, headlines, publication dates
- **Product**: Look for features, pricing, reviews, specifications
- **General**: Look for overview, definitions, key facts, expert opinions

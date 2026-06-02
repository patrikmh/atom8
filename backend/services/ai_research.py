"""Headless AI research service using Playwright."""
import asyncio
from typing import Dict, List, Any
from playwright.async_api import async_playwright, BrowserContext, Page
from playwright_stealth import Stealth

async def _search_duckduckgo(page: Page, query: str) -> List[Dict[str, str]]:
    """Search DuckDuckGo and return top result URLs + titles."""
    results: List[Dict[str, str]] = []
    try:
        await page.goto("https://duckduckgo.com/?q=" + query.replace(" ", "+"), wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_selector("#links", timeout=15000)
        # Extract results
        links = await page.query_selector_all("#links .result")
        for link in links[:10]:
            a = await link.query_selector(".result__a")
            if not a:
                continue
            title = await a.get_attribute("textContent") or ""
            if not title:
                title = await a.inner_text() or ""
            href = await a.get_attribute("href") or ""
            snippet_el = await link.query_selector(".result__snippet")
            snippet = await snippet_el.inner_text() if snippet_el else ""
            if href and href.startswith("http"):
                results.append({"title": title.strip(), "url": href, "snippet": snippet.strip()})
    except Exception as e:
        print(f"[research] DuckDuckGo search error: {e}")
    return results


async def _extract_page_content(page: Page, url: str) -> str:
    """Visit a page and extract main text content."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        # Wait a bit for dynamic content
        await asyncio.sleep(1.5)
        # Try to extract main content — remove nav, footer, ads, scripts
        content = await page.evaluate("""
            () => {
                const scripts = document.querySelectorAll('script, style, nav, footer, aside, .ad, .advertisement, .sidebar, header, [role="banner"], [role="navigation"]');
                scripts.forEach(el => el.remove());
                const article = document.querySelector('article, main, [role="main"], .content, .post, .entry, .article-body');
                const text = (article || document.body).innerText;
                return text.replace(/\\s+/g, ' ').trim().substring(0, 8000);
            }
        """)
        return content
    except Exception as e:
        print(f"[research] Page extraction error for {url}: {e}")
        return ""


async def do_web_research(topic: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Perform a headless web research session using Playwright.
    Returns {content, sources, status}.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)

        try:
            # Search
            search_results = await _search_duckduckgo(page, topic)
            if not search_results:
                return {
                    "content": f"No web results found for '{topic}'. Try a different query.",
                    "sources": [],
                    "status": "ok"
                }

            # Visit top N results and extract content
            findings: List[str] = []
            sources: List[Dict[str, str]] = []
            for r in search_results[:max_results]:
                content = await _extract_page_content(page, r["url"])
                if content:
                    # Summarize the content (first 800 chars as a summary)
                    summary = content[:800].replace("\n", " ").strip()
                    findings.append(f"From {r['title']}: {summary}")
                    sources.append({"title": r["title"], "url": r["url"]})

            if not findings:
                return {
                    "content": f"Found search results for '{topic}' but could not extract content from the pages.",
                    "sources": sources,
                    "status": "ok"
                }

            # Build a natural language summary
            content = f"Here's what I found about **{topic}**:\n\n"
            for i, f in enumerate(findings, 1):
                content += f"{i}. {f}\n\n"

            content += f"Based on {len(sources)} web source(s)."

            return {
                "content": content,
                "sources": sources,
                "status": "ok"
            }

        finally:
            await context.close()
            await browser.close()

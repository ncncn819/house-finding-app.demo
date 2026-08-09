"""
scraper.py — Async Playwright scraper for OpenRent property listings.

Design decisions:
- Async context manager per scrape (Playwright browsers are reused via module-level instance).
- 15-second timeout matches the plan specification.
- Graceful degradation: if scraping fails for any reason, returns an empty list
  so the API doesn't 500.
- Extracted data: title, price_pcm, bedrooms, source URL, image URL.
"""
import asyncio
import re
from typing import Optional

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

from app.config import get_settings
from app.models.location import PropertyListing

settings = get_settings()

OPENRENT_URL = "https://www.openrent.co.uk/properties-to-rent/-london?term={term}"


def _parse_price(text: str) -> Optional[int]:
    """Extract integer PCM price from text like '£1,250 pcm'."""
    match = re.search(r"[\d,]+", text.replace(",", ""))
    return int(match.group()) if match else None


def _parse_beds(text: str) -> Optional[int]:
    """Extract integer bedroom count from text like '2 bed'."""
    match = re.search(r"(\d+)\s*bed", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


async def scrape_openrent(location_name: str) -> list[PropertyListing]:
    """
    Scrape OpenRent for listings in the given London location.
    Returns up to 10 PropertyListing objects (or empty list on failure).
    """
    slug = location_name.lower().replace(" ", "-").replace("'", "").replace(",", "")
    url = OPENRENT_URL.format(term=slug)

    listings: list[PropertyListing] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.set_extra_http_headers({
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            })

            await page.goto(url, timeout=settings.PLAYWRIGHT_TIMEOUT, wait_until="domcontentloaded")

            # Wait briefly for JS-rendered listings
            await asyncio.sleep(2)

            # OpenRent listing cards
            cards = await page.query_selector_all(".property-result, .listing-card, article[class*='property']")

            for card in cards[:10]:
                try:
                    title_el   = await card.query_selector("h2, h3, .property-title, .listing-title")
                    price_el   = await card.query_selector(".price, .pcm, [class*='price']")
                    bed_el     = await card.query_selector("[class*='bed'], .beds")
                    link_el    = await card.query_selector("a[href]")
                    img_el     = await card.query_selector("img")

                    title    = (await title_el.inner_text()).strip() if title_el else location_name
                    price_t  = (await price_el.inner_text()).strip()  if price_el else ""
                    bed_t    = (await bed_el.inner_text()).strip()     if bed_el   else ""
                    href     = await link_el.get_attribute("href")    if link_el  else None
                    img_src  = await img_el.get_attribute("src")      if img_el   else None

                    full_url = (
                        f"https://www.openrent.co.uk{href}"
                        if href and href.startswith("/")
                        else (href or url)
                    )

                    listings.append(PropertyListing(
                        title=title,
                        price_pcm=_parse_price(price_t),
                        bedrooms=_parse_beds(bed_t),
                        url=full_url,
                        image_url=img_src,
                        source="openrent",
                    ))
                except Exception:
                    continue

        except PlaywrightTimeoutError:
            pass
        except Exception:
            pass
        finally:
            await browser.close()

    return listings

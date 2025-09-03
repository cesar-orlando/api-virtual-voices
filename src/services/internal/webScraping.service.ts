import { chromium, Browser } from 'playwright';
import { Request, Response } from 'express';
import { openai } from '../../config/openai';
import * as cheerio from 'cheerio';
import axios from 'axios';

let browser: Browser | null = null;

async function getBrowser() {
	if (!browser) {
		browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox'] });
	}
	return browser;
}

export async function scrapeUrl(url: string, search:string): Promise<string> {
	try {
        const response = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(response.data);
        const text = $('body').text().replace(/\s+/g, ' ').slice(0, 3000); // Limita tokens
		const completion = await openai.chat.completions.create({
			model: "gpt-4",
			messages: [
                {
                    role: 'system',
                    content: 'Extraes informacion clave de la pagina web'
                },
                {
                    role: 'user',
                    content: `El usuario busca: "${search}"`,
                },
				{
					role: "user",
					content: text
				}
			],
            temperature: 0.4
		});
		return completion.choices[0].message.content;
	} catch (e) {
		return `Error scraping ${url}`;
	}
}

// Example: scrape product data from a given URL
export async function scrapeProduct(url: string): Promise<Record<string, { title: string; price: string; link: string }>> {
	const browser = await getBrowser();
	const context = await browser.newContext();
	const page = await context.newPage();

	// Navigate and wait for DOM content to load (automatically follows redirects)
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	// Optional: Check final URL after redirects (useful for debugging)
	const finalUrl = page.url();
	if (finalUrl !== url) {
		console.log(`🔄 Redirected: ${url} → ${finalUrl}`);
	}

	// Adjust selectors as needed for the target site
	const data = await page.evaluate(() => {
		// Try to select all product containers (li or product card)
		const productNodes = Array.from(document.querySelectorAll('div[class*="mf-shop-content"] li, ul[class*="ProductGrid"] li'));
		const results: Record<string, { title: string; price: string; link: string }> = {};
		let count = 1;
		productNodes.forEach(node => {
			// Title
			let title = '';
			const titleEl = node.querySelector('h2[class*="woo-loop-product__title"] a, [data-testid="product-grid-title"]');
			if (titleEl) title = titleEl.textContent?.trim() || '';
			// Price
			let price = '';
			const priceEl = node.querySelector('span[class*="woocommerce-Price-amount"] bdi, .Price__whole__mQGs5');
			if (priceEl) price = priceEl.textContent?.trim() || '';
			// Link
			const linkEl = node.querySelector('a[class*="ProductGridItem__overlay"], .woo-loop-product__title a, a');
			const link = linkEl ? linkEl.getAttribute('href') || '' : finalUrl;
			// Only add if at least one field is present
			if (title || price || link) {
				results[count.toString()] = { title, price, link };
				count++;
			}
		});
		return results;
	});

	await page.close();
	await context.close();
	return data;
}

export async function scrapeProductHandler(req: Request, res: Response) {
    const {
        filters,
    } = req.query;

    let parsedFilters

    if (filters && typeof filters === 'string') {
        parsedFilters = JSON.parse(filters);
    } else {
        res.status(400).json({ error: "Invalid or missing filters parameter" });
        return;
    }

    console.log("Checking in URL:", parsedFilters.url);

	if (!parsedFilters.url || typeof parsedFilters.url !== 'string') {
		res.status(400).json({ error: 'Missing or invalid url parameter' });
		return;
	}
	try {
		const data = await scrapeProduct(parsedFilters.url);
		res.json({ success: true, data });
	} catch (error) {
        console.log(error)
		res.status(500).json({ error: (error as Error).message });
	}
}
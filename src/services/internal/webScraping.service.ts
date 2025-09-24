import { chromium, Browser } from 'playwright';
import { Request, Response } from 'express';
import { openai } from '../../config/openai';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Define ScrapeConfig interface
interface ScrapeConfig {
	url: string;
	search?: string;
	mode?: string;
	type?: string;
	maxDepth?: number;
	maxPages?: number; 
}

let browser: Browser | null = null;

async function getBrowser() {
	if (!browser) {
		browser = await chromium.launch({ 
			headless: true, 
			args: [
				'--disable-gpu', 
				'--no-sandbox', 
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-background-timer-throttling',
				'--disable-backgrounding-occluded-windows',
				'--disable-renderer-backgrounding',
				'--disable-features=TranslateUI',
				'--disable-ipc-flooding-protection',
				'--no-first-run',
				'--disable-extensions',
				'--disable-plugins',
				'--disable-images', // Disable image loading for faster performance
				'--disable-javascript-harmony-shipping',
				'--memory-pressure-off'
			]
		});
	}
	return browser;
}

export async function scrapeUrl(url: string, search: string): Promise<string> {
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

// Playwright-based scraping for dynamic pages (like individual property pages)
export async function scrapeUrlWithPlaywrightOpenAI(url: string, search: string): Promise<string> {
	try {
		const browser = await getBrowser();
		const context = await browser.newContext({
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			viewport: { width: 1280, height: 800 }
		});
		const page = await context.newPage();
		
		// Block non-essential resources for faster loading
		await page.route('**/*', (route) => {
			const resourceType = route.request().resourceType();
			if (['image', 'font', 'media', 'websocket'].includes(resourceType)) {
				route.abort();
			} else {
				route.continue();
			}
		});

		await page.goto(url, { 
			waitUntil: 'domcontentloaded',
			timeout: 15000 
		});
		await page.waitForTimeout(5000); // Increased wait time for production environment

		// Look for iframe with real estate content - wait a bit longer in production
		let targetFrame = page.frames().find(f => f.url().includes('/realEstate/ppp')) || null;
		
		// If iframe not found immediately, wait and try again
		if (!targetFrame) {
			await page.waitForTimeout(3000);
			targetFrame = page.frames().find(f => f.url().includes('/realEstate/ppp')) || null;
		}
		
		// Extract property details - try multiple approaches
		let propertyData = '';

		try {
			// Only use targetFrame if it exists, otherwise use main page
			if (targetFrame) {
				propertyData = await targetFrame.evaluate(() => {
					// Look for property details in container - try multiple selectors based on actual HTML structure
					const selectors = [
						'#asset-area',
						'.asset.viewer',
						'.asset-body',
						'.asset-title',
						'.asset-body-text',
						'.asset-price',
						'#asset-focus',
						'div[class="asset viewer"]',
						'.asset',
						'.viewer',
						'[class*="asset-body"]',
						'[class*="asset"]',
						'.property-details',
						'.listing-details',
						'#content',
						'main'
					];
					let content = '';
					for (const selector of selectors) {
						const element = document.querySelector(selector) as HTMLElement;
						if (element && element.innerText && element.innerText.trim().length > 50) {
							content += element.innerText + '\n';
							break; // Take the first meaningful match
						}
					}
					// If no specific containers found, get all visible text but filter out navigation
					if (!content.trim()) {
						const allText = document.body.innerText;
						// Filter out common navigation/header content
						const lines = allText.split('\n');
						content = lines.join('\n');
					}
					return content.replace(/\s+/g, ' ').trim();
				});
			}
		} catch (extractError) {
			console.warn('Error during content extraction:', extractError);
		}

		// If still no meaningful content, get a basic text extraction
		if (!propertyData.trim()) {
			propertyData = await page.evaluate(() => {
				return document.body.innerText.replace(/\s+/g, ' ').slice(0, 2000);
			});
		}

		await context.close();

		const completion = await openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: 'system',
					content: 'Eres un experto extractor de información inmobiliaria. Extrae y organiza toda la información detallada de esta página de propiedad, incluyendo precio, características, ubicación, contacto, amenidades, descripción y cualquier detalle relevante. Si la información parece incompleta o contiene mucho contenido de navegación, indícalo.'
				},
				{
					role: 'user',
					content: `El usuario busca: "${search}"`,
				},
				{
					role: "user",
					content: propertyData
				}
			],
			temperature: 0.4
		});
		return completion.choices[0].message.content || `Error analyzing ${url}`;
	} catch (e) {
		console.error(`Error scraping ${url} with Playwright:`, e);
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

// Smart link discovery - finds relevant links automatically, including iframe content
export async function discoverRelevantLinks(url: string, search: string): Promise<string[]> {
	const browser = await getBrowser();
	const context = await browser.newContext();
	const page = await context.newPage();
	
	try {
		await page.goto(url, { waitUntil: 'load' });
		
		const discoveredLinks = await page.evaluate((searchTerm) => {
			const links = Array.from(document.querySelectorAll('a[href]'));
			const baseUrl = window.location.origin;
			
			return links
				.map(link => {
					const href = link.getAttribute('href');
					const text = link.textContent?.toLowerCase() || '';
					const fullUrl = href?.startsWith('http') ? href : `${baseUrl}${href}`;
					
					// Score links based on relevance
					let score = 0;
					
					// Common navigation indicators
					if (text.includes('más') || text.includes('more') || text.includes('ver') || text.includes('view')) score += 3;
					if (text.includes('detalle') || text.includes('detail') || text.includes('info')) score += 3;
					if (text.includes('conoce') || text.includes('explore') || text.includes('discover')) score += 2;
					
					// Search term relevance
					if (searchTerm && text.includes(searchTerm.toLowerCase())) score += 5;
					
					// URL patterns that often contain detailed content
					if (href?.includes('/producto') || href?.includes('/product')) score += 4;
					if (href?.includes('/detalle') || href?.includes('/detail')) score += 4;
					if (href?.includes('/item') || href?.includes('/property')) score += 3;
					
					// Avoid common non-content links
					if (text.includes('contacto') || text.includes('contact')) score -= 2;
					if (text.includes('login') || text.includes('register')) score -= 3;
					if (href?.includes('#') || href?.includes('javascript:')) score -= 5;
					
					return { url: fullUrl, text, score };
				})
				.filter(link => link.score > 1 && link.url.startsWith('http'))
				.sort((a, b) => b.score - a.score)
				.map(link => link.url);
		}, search);
		
		return [...new Set(discoveredLinks)]; // Remove duplicates
	} finally {
		await page.close();
		await context.close();
	}
}

// Multi-level scraping with intelligent content extraction for Wix and other dynamic sites
export async function scrapeMultiLevel(config: ScrapeConfig): Promise<any> {
	const { url, search, maxDepth = 2, maxPages = 10 } = config;
	const results = {
		mainPage: null,
		discoveredPages: [],
		summary: {
			totalPages: 0,
			successfulScrapes: 0,
			errors: []
		}
	};
	
	try {
		// Step 1: Scrape main page
		results.mainPage = await scrapeUrl(url, search || '');
		results.summary.totalPages++;
		results.summary.successfulScrapes++;
		
		if (maxDepth <= 1) return results;
		
		// Step 2: Discover relevant links
		const relevantLinks = await discoverRelevantLinks(url, search || '');
		
		console.log(relevantLinks);
		
		// Limit number of pages to scrape
		const linksToScrape = relevantLinks.slice(0, maxPages);
		
		// Step 3: Scrape discovered pages concurrently
		const scrapePromises = linksToScrape.map(async (linkUrl, index) => {
			try {
				// Add staggered delay to avoid overwhelming the server
				await new Promise(resolve => setTimeout(resolve, index * 200));
				
				const pageData = await scrapeUrl(linkUrl, search || '');
				
				return {
					success: true,
					result: {
						url: linkUrl,
						data: pageData,
						scrapedAt: new Date().toISOString()
					}
				};
			} catch (error) {
				console.warn(`❌ Error scraping ${linkUrl}:`, error);
				return {
					success: false,
					error: {
						url: linkUrl,
						error: (error as Error).message
					}
				};
			}
		});

		// Wait for all scraping operations to complete
		const scrapeResults = await Promise.allSettled(scrapePromises);
		
		// Process results
		scrapeResults.forEach((result) => {
			results.summary.totalPages++;
			
			if (result.status === 'fulfilled') {
				if (result.value.success) {
					results.discoveredPages.push(result.value.result);
					results.summary.successfulScrapes++;
				} else {
					results.summary.errors.push(result.value.error);
				}
			} else {
				results.summary.errors.push({
					url: 'unknown',
					error: result.reason?.message || 'Promise rejected'
				});
			}
		});
		
	} catch (error) {
		console.error('Error in multi-level scraping:', error);
		results.summary.errors.push({
			url: 'main',
			error: (error as Error).message
		});
	}
	
	return results;
}

// Specialized function for Wix properties using direct API access
export async function scrapeWixWebpage(url: string, search: string): Promise<string> {
	
	try {

		const browser = await getBrowser();
		const context = await browser.newContext({
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			viewport: { width: 1280, height: 800 },
			// Performance optimizations
			javaScriptEnabled: true,
			ignoreHTTPSErrors: true,
			// Block unnecessary resources to speed up loading
			extraHTTPHeaders: {
				'Accept-Language': 'en-US,en;q=0.9'
			}
		});
		const page = await context.newPage();
		
		// Block images, fonts, and other non-essential resources for faster loading
		await page.route('**/*', (route) => {
			const resourceType = route.request().resourceType();
			if (['image', 'font', 'media', 'websocket'].includes(resourceType)) {
				route.abort();
			} else {
				route.continue();
			}
		});

		// Store unique properties by id
		const propertiesById = new Map();

		// Helper: extract properties from DOM
		async function extractFromDOM() {
			// Prefer operating inside the realEstate iframe if present
			let targetFrame = page.frames().find(f => f.url().includes('/realEstate/ppp')) || null;

			// Scroll multiple times to trigger lazy loading - optimized for speed
			if (targetFrame) {
				try {
					await targetFrame.evaluate(() => {
						return new Promise((resolve) => {
							let scrollCount = 0;
							const scrollInterval = setInterval(() => {
								window.scrollTo(0, document.body.scrollHeight);
								scrollCount++;
								if (scrollCount >= 10) { // Reduced from 20 to 10
									clearInterval(scrollInterval);
									resolve(true);
								}
							}, 300); // Reduced from 500ms to 300ms
						});
					});
				} catch(e) {
					// fallback to main page scrolling
					await page.evaluate(() => {
						return new Promise((resolve) => {
							let scrollCount = 0;
							const scrollInterval = setInterval(() => {
								window.scrollTo(0, document.body.scrollHeight);
								scrollCount++;
								if (scrollCount >= 5) { // Reduced from 8 to 5
									clearInterval(scrollInterval);
									resolve(true);
								}
							}, 300); // Reduced from 600ms to 300ms
						});
					});
				}
			} else {
				await page.evaluate(() => {
					return new Promise((resolve) => {
						let scrollCount = 0;
						const scrollInterval = setInterval(() => {
							window.scrollTo(0, document.body.scrollHeight);
							scrollCount++;
							if (scrollCount >= 5) { // Reduced from 8 to 5
								clearInterval(scrollInterval);
								resolve(true);
							}
						}, 300); // Reduced from 600ms to 300ms
					});
				});
			}

			// Extract properties from the page - first try to get data from JavaScript variables
			const list = await (targetFrame ? targetFrame : page).evaluate((currentUrl) => {
				let properties = [];
				
				try {
					// Check if assetsToDisplay is available in the global scope
					if (typeof (window as any).assetsToDisplay !== 'undefined' && Array.isArray((window as any).assetsToDisplay)) {
						
						for (const asset of (window as any).assetsToDisplay) {
							if (asset && asset.id && asset.title) {
								
								properties.push({
									id: asset.id,
									title: asset.title,
									price: asset.price || null,
									propertyUrl: `${currentUrl}/propE${asset.id}`,
									data: asset.data || {}
								});
							}
						}
						
						if (properties.length > 0) {
							return properties;
						}
					}
				} catch (e) {
					console.log('Failed to extract from assetsToDisplay:', e.message);
				}
			}, url);

			// add to map using generated key
			for (const p of list) {
				const key = p.id || p.title || (Math.random() + '');
				if (!propertiesById.has(key)) {
					propertiesById.set(key, { 
						id: key,
						title: p.title, 
						price: p.price,
						propertyUrl: p.propertyUrl,
						data: p.data
					});
				}
			}
		}

		// Helper: find and click next button
		async function clickNextButton() {
			// Focus on the realEstate iframe
			const realEstateFrame = page.frames().find(f => f.url().includes('wix.shareiiit.com/realEstate/ppp'));
			if (!realEstateFrame) {
				return false;
			}
			
			try {
				// Get current page information first
				const currentPageInfo = await realEstateFrame.evaluate(() => {
					const paginationContainer = document.querySelector('#pagination');
					if (!paginationContainer) {
						return null;
					}
					
					// Find current page indicator
					const currentPageElements = paginationContainer.querySelectorAll('[class*="current"], [class*="active"], [class*="selected"], .pagination-current-page');
					let currentPage = 1;
					
					if (currentPageElements.length > 0) {
						const text = currentPageElements[0].textContent?.trim();
						const pageNum = parseInt(text);
						if (!isNaN(pageNum)) currentPage = pageNum;
					}
					
					// Get all page numbers available
					const pageElements = [];
					const allElements = Array.from(paginationContainer.querySelectorAll('a, button, span, div'));
					for (const el of allElements) {
						const text = el.textContent?.trim();
						if (text && /^\d+$/.test(text)) {
							const pageNum = parseInt(text);
							if (pageNum >= 1 && pageNum <= 10) {
								pageElements.push({
									pageNum,
									element: el,
									isCurrent: el.classList.contains('current') || el.classList.contains('active') || el.classList.contains('selected') || el.classList.contains('pagination-current-page')
								});
							}
						}
					}
					
					return {
						currentPage,
						availablePages: pageElements.map(p => p.pageNum).sort((a,b) => a-b),
						pageElements: pageElements,
						containerFound: true
					};
				});
				
				if (!currentPageInfo) {
					return false;
				}
				
				const nextPage = currentPageInfo.currentPage + 1;
				const maxPage = Math.max(...currentPageInfo.availablePages);
				
				if (nextPage > maxPage) {
					return false;
				}
				
				// Find the element for the next page
				const nextPageElement = currentPageInfo.pageElements.find(p => p.pageNum === nextPage && !p.isCurrent);
				
				if (nextPageElement) {
					// Try to click the next page element
					let clicked = false;
					
					try {
						const clickResult = await realEstateFrame.evaluate((pageNum) => {
							const paginationContainer = document.querySelector('#pagination');
							if (!paginationContainer) return { success: false };
							
							const elements = Array.from(paginationContainer.querySelectorAll('a, button, span'));
							for (const el of elements) {
								const text = el.textContent?.trim();
								if (text && parseInt(text) === pageNum) {
									(el as HTMLElement).click();
									return { success: true };
								}
							}
							return { success: false };
						}, nextPage);
						
						if (clickResult.success) {
							clicked = true;
						}
					} catch(e) {
						// Try alternative approach
					}
					
					// Fallback: direct click by text content
					if (!clicked) {
						try {
							const pageButton = await realEstateFrame.locator(`#pagination`).locator(`text=${nextPage}`);
							if (await pageButton.count() > 0) {
								await pageButton.click();
								clicked = true;
							}
						} catch(e) {
							// Click failed
						}
					}
					
					if (clicked) {
						await page.waitForTimeout(2000); // Reduced from 4000ms to 2000ms
						return true;
					}
				}
				
			} catch(e) {
				// Pagination error
			}
			
			return false;
		}

		await page.goto(url, { 
			waitUntil: 'domcontentloaded', // Changed from 'networkidle' to 'domcontentloaded' for faster loading
			timeout: 15000 // Reduced timeout from default 30s to 15s
		});
		await page.waitForTimeout(1500); // Reduced from 3000ms to 1500ms

		// Main scraping loop
		let pageCount = 0;
		let consecutiveEmptyPages = 0;

		while (pageCount < 5) { // Limit to 5 pages for service usage
			pageCount++;

			// Extract data from current page
			const beforeCount = propertiesById.size;
			await extractFromDOM();
			const afterCount = propertiesById.size;
			const newProperties = afterCount - beforeCount;

			// Check for empty pages (no new properties found)
			if (newProperties === 0) {
				consecutiveEmptyPages++;
				if (consecutiveEmptyPages >= 2) {
					break;
				}
			} else {
				consecutiveEmptyPages = 0;
			}

			// Try to click next button
			const clicked = await clickNextButton();
			if (!clicked) {
				break;
			}
		}

		// Get all properties
		const allProperties = Array.from(propertiesById.values());
		await context.close();

		console.log(`✅ Successfully extracted ${allProperties.length} results from ${url}`);

		// Transform and format the data for AI analysis
		const formattedProperties = allProperties.map((property: any, index: number) => {
			const result: any = {
				id: property.id,
				title: property.title || `Propiedad ${index + 1}`,
				price: property.price || 'N/A',
				propertyUrl: property.propertyUrl,
				details: {}
			};

			return result;
		});
		
		// Format for AI analysis
		const analysisContent = `
PROPIEDADES DIOCSA - DATOS DIRECTOS DEL SCRAPER MEJORADO:

RESUMEN GENERAL:
- Total de propiedades disponibles: ${formattedProperties.length}
- Fuente: Scraping directo con navegador (diocsa.com.mx)

LISTADO COMPLETO DE PROPIEDADES:

${formattedProperties.map((prop, i) => `
${i + 1}. ${prop.title}
   💰 Precio: ${prop.price}
   � URL: ${prop.propertyUrl || 'No disponible'}
`).join('\n---\n')}

ANÁLISIS ADICIONAL:
- Datos obtenidos mediante scraping avanzado con JavaScript
- URLs directas disponibles para acceso a propiedades individuales
- Información extraída de la base de datos en tiempo real
- Soporte para paginación automática
- Ordenalas de mayor a menor relevancia según el criterio de búsqueda del usuario: ${search}
		`.trim();

		// Send to AI for analysis
		const completion = await openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: 'system',
					content: 'Eres un experto asesor inmobiliario especializado en propiedades DIOCSA. Analiza la información detallada de las propiedades y proporciona recomendaciones específicas basadas en los criterios del usuario. Incluye siempre los precios exactos, ubicaciones, características específicas, información de contacto, y explica por qué cada propiedad recomendada cumple con los requisitos del usuario.'
				},
				{
					role: "user",
					content: analysisContent
				}
			],
			temperature: 0.3
		});

		const initialAnalysis = completion.choices[0].message.content || 'No se pudo analizar la información de las propiedades';

		// Extract URLs from the AI response for detailed scraping (simple and generic)
		const urlPattern = /https?:\/\/[^\s\)\]\>\"\']+/g;
		const allMatches = initialAnalysis.match(urlPattern) || [];
		const extractedUrls = allMatches
			.filter((url: string) => 
				url.length > 15 && 
				!url.includes('javascript:') && 
				!url.includes('mailto:') &&
				!url.match(/\.(pdf|jpg|png|gif|css|js)$/i)
			)
			.slice(0, 5); // Limit to first 5 URLs
		
		if (extractedUrls.length > 0) {
			console.log(`🔍 Found ${extractedUrls.length} property URLs for detailed scraping...`);

			const detailedProperties = await Promise.all(extractedUrls.map(async url => {
				try {
					url = url.trim();
					const detailedInfo = await scrapeUrlWithPlaywrightOpenAI(url, `El usuario busca informacion detallada acerca de la propiedad en base a su busqueda ${search}`);
					
					// Small delay between requests
					await new Promise(resolve => setTimeout(resolve, 500));
					
					return {
						url: url,
						detailedInfo: detailedInfo,
					};
				} catch (error) {
					console.warn(`❌ Error scraping detailed info for ${url}:`, error);
					return {
						url: url,
						detailedInfo: `Error scraping ${url}`,
					};
				}
			}));

			return JSON.stringify({
				summary: initialAnalysis,
				detailedProperties: detailedProperties
			}, null, 2);
		}

		return initialAnalysis;
		
	} catch (error) {
		console.error('❌ Error scraping DIOCSA properties:', error.message);
		// Fallback to standard scraping if enhanced method fails
		console.log('🔄 Falling back to standard scraping method...');
		return await scrapeUrl(url, search);
	}
}

// Enhanced handler with multiple scraping modes
export async function scrapeHandler(req: Request, res: Response) {
	const { filters } = req.query;
	let config: ScrapeConfig;

	if (filters && typeof filters === 'string') {
		config = JSON.parse(filters);
	} else {
		res.status(400).json({ error: "Invalid or missing filters parameter" });
		return;
	}

	if (!config.url || typeof config.url !== 'string') {
		res.status(400).json({ error: 'Missing or invalid url parameter' });
		return;
	}

	try {
		let data;
		
		// Special handling for DIOCSA properties
		if (config.url.includes('diocsa.com.mx')) {
			if (config.url.includes('/rentas') || config.url.includes('/inmobiliaria')) {
				data = await scrapeWixWebpage(config.url, config.search || '');
			} else {
				data = await scrapeMultiLevel({ ...config, mode: 'smart-discovery' });
			}
		} else {
			// Use regular scraping modes for other sites
			switch (config.mode) {
				case 'single':
					data = await scrapeUrl(config.url, config.search || '');
					break;
				case 'product-grid':
					data = await scrapeProduct(config.url);
					break;
				case 'multi-level':
					data = await scrapeMultiLevel(config);
					break;
				case 'smart-discovery':
					config.maxDepth = 2;
					data = await scrapeMultiLevel(config);
					break;
				default:
					// Auto-detect best mode
					data = await scrapeMultiLevel({ ...config, mode: 'smart-discovery' });
			}
		}

		res.json({ 
			success: true, 
			data,
			config: {
				mode: config.mode,
				url: config.url,
				maxDepth: config.maxDepth,
				maxPages: config.maxPages
			}
		});
	} catch (error) {
		console.log(error)
		res.status(500).json({ error: (error as Error).message });
	}
}
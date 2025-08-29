import { getEnvironmentConfig } from "../../config/environments";
import { Request, Response } from "express";
import axios from 'axios';
import { scrapeUrl } from "../internal/webScraping.service";

// Obtener la configuración del entorno actual
const config = getEnvironmentConfig();

export const googleSearch = async (req: Request, res: Response): Promise<void> => {
    const {
        filters,
    } = req.query;
    const apiKey = config.googleApiKey;
    const cx = config.googleSearchCx;

    let parsedFilters

    if (filters && typeof filters === 'string') {
        parsedFilters = JSON.parse(filters);
    } else {
        res.status(400).json({ error: "Invalid or missing filters parameter" });
        return;
    }

    if (!parsedFilters.search) {
        res.status(400).json({ error: "Missing 'search' in filters" });
        return;
    }

    console.log("Searching Google for:", parsedFilters.search);

    try {
        const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
            params: {
                key: apiKey,
                cx: cx,
                q: parsedFilters.search
            }
        });
        const results = await Promise.all(response.data.items.map(async item => ({
            title: item.title,
            link: item.link,
            context: await scrapeUrl(item.link, parsedFilters.search),
        })));
        res.status(200).json({ results });
        return;
    } catch (error) {
        console.log("Error performing Google search:", error);
        res.status(500).json({ error: "Internal Server Error" });
        return;
    }
}
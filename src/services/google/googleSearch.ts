import { getEnvironmentConfig } from "../../config/environments";
import { Request, Response } from "express";
import axios from 'axios';

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

    try {
        console.log("Search Filters:", parsedFilters.search);
        const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
            params: {
                key: apiKey,
                cx: cx,
                q: parsedFilters.search
            }
        });
        const results = response.data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
        }));
        console.log("Google Search Results:", results);
        res.status(200).json({ results });
        return;
    } catch (error) {
        console.log("Error performing Google search:", error);
        res.status(500).json({ error: "Internal Server Error" });
        return;
    }
}
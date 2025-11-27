
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env from project root
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.log("Warning: .env file not found at", envPath);
}

async function testApi() {
    console.log("Testing CoinGecko API (Standalone)...");
    const apiKey = process.env.COINGECKO_API_KEY;

    if (apiKey) {
        console.log(`API Key found: ${apiKey.substring(0, 4)}...`);
    } else {
        console.log("WARNING: No API Key found in environment!");
    }

    const tokens = ["bitcoin", "ethereum", "tether", "uniswap"];
    const ids = tokens.join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${tokens.length}&page=1&sparkline=false`;

    console.log(`Fetching from: ${url}`);

    const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            if (response.status === 429) {
                console.error("Rate Limit Hit!");
            }
            return;
        }

        const data = await response.json();
        console.log(`Success! Fetched ${data.length} tokens.`);
        data.forEach((t: any) => {
            console.log(`- ${t.name} (${t.symbol.toUpperCase()}): $${t.current_price}`);
        });

    } catch (error) {
        console.error("Fetch Failed:", error);
    }
}

testApi();

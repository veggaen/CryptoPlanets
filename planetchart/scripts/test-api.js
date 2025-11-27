
const fs = require('fs');
const path = require('path');
const https = require('https');

async function fetchUrl(url, headers) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: headers
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        }).on('error', (err) => reject(err));
    });
}

async function testApi() {
    console.log("Testing CoinGecko API (Node.js)...");

    // Hardcoded for verification
    const apiKey = "CG-WgfVqtEGz4UhwXtGHVQZDJ7o";

    if (apiKey) {
        console.log(`Using Hardcoded Key: ${apiKey.substring(0, 4)}...`);
    } else {
        console.log("WARNING: No API Key found!");
    }

    const tokens = ["bitcoin", "ethereum", "tether", "uniswap"];
    const ids = tokens.join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${tokens.length}&page=1&sparkline=false`;

    console.log(`Fetching from: ${url}`);

    const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

    try {
        const data = await fetchUrl(url, headers);
        console.log(`Success! Fetched ${data.length} tokens.`);
        data.forEach(t => {
            console.log(`- ${t.name} (${t.symbol.toUpperCase()}): $${t.current_price}`);
        });
    } catch (error) {
        console.error("Fetch Failed:", error.message);
    }
}

testApi();

export default function Footer() {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm border-t border-white/10 px-6 py-3 z-50">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                {/* Attribution */}
                <div className="flex items-center gap-4 text-white/60">
                    <span>🌌 CryptoPlanets</span>
                    <span>
                        Data by{' '}
                        <a href="https://defillama.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                            DefiLlama
                        </a>
                        {', '}
                        <a href="https://coingecko.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                            CoinGecko
                        </a>
                        {', '}
                        <a href="https://dexscreener.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                            DexScreener
                        </a>
                    </span>
                    <span className="text-yellow-400/70">Free tier APIs</span>
                </div>

                {/* Donation */}
                <div className="flex items-center gap-2 text-white/70">
                    <span className="hidden sm:inline">Built by a poor dev 😅</span>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText('0x45Ce973C2363785a1FB3ca7a2714575432DD8C99');
                            const btn = document.activeElement as HTMLButtonElement;
                            const originalText = btn.textContent;
                            btn.textContent = '✅ Copied!';
                            setTimeout(() => {
                                if (btn.textContent === '✅ Copied!') {
                                    btn.textContent = originalText;
                                }
                            }, 2000);
                        }}
                        className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 rounded-lg hover:from-purple-500/30 hover:to-pink-500/30 transition-all text-white/90 hover:text-white flex items-center gap-1.5"
                        title="Copy ETH donation address"
                    >
                        <span className="text-sm">💜</span>
                        <span className="font-mono text-[10px]">Donate ETH</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

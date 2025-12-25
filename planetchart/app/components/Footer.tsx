export default function Footer() {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm border-t border-white/10 px-6 py-3 z-50">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                {/* Attribution */}
                <div className="flex items-center gap-4 text-white/60">
                    <span>🌌 CryptoPlanets</span>
                    <span>
                        Data sources:{' '}
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
                    <span className="text-white/40 hidden sm:inline">Public endpoints</span>
                </div>

                {/* Donation */}
                <div className="flex items-center gap-3 text-white/60">
                    <a
                        href="https://x.com/vetlethetweeter"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/60 hover:text-white/80 transition-colors"
                        title="Follow / feedback"
                    >
                        <span className="hidden sm:inline">Feedback / updates</span>
                        <span className="sm:hidden">@X</span>
                    </a>
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
                        className="px-2 py-1 border border-white/10 rounded-lg hover:border-white/20 transition-colors text-white/40 hover:text-white/60"
                        title="Copy tip address"
                    >
                        <span className="font-mono text-[10px]">Tip</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

const iconPaths={
food:'<path d="M7 3v7M4.5 3v4a2.5 2.5 0 0 0 5 0V3M7 10v11M17 3v18M14 3v5a3 3 0 0 0 6 0V3"/>',
transport:'<path d="M5 16h14l-1-7a2 2 0 0 0-2-1H8a2 2 0 0 0-2 1l-1 7Z"/><path d="M7 16v3M17 16v3M4 13h16"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
shopping:'<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
home:'<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
ent:'<path d="M4 7h16v12H4z"/><path d="m8 7 2-3h4l2 3M8 13h8M12 10v6"/>',
salary:'<path d="M12 3v18M16 7.5c-.7-1-2-1.5-4-1.5-2.5 0-4 1.2-4 3s1.4 2.6 4 3c2.6.4 4 1.3 4 3s-1.5 3-4 3c-2 0-3.4-.5-4.2-1.7"/>',
cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9h.01M17 15h.01"/>',
bank:'<path d="m3 9 9-5 9 5"/><path d="M5 10v7M9 10v7M15 10v7M19 10v7M3 19h18"/>',
card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
wallet:'<path d="M4 7a2 2 0 0 1 2-2h12v14H6a2 2 0 0 1-2-2V7Z"/><path d="M4 8h14v8h-4a2 2 0 0 1 0-4h4"/>',
default:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'
};
export function svg(type){return `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[type]||iconPaths.default}</svg>`}
export function accountIcon(a){return a?.type==='cash'?'cash':a?.type==='card'?'card':a?.type==='bank'?'bank':'wallet'}
export function svgForAccount(a){return svg(accountIcon(a))}

export const TREASURES = Object.freeze([
  { id: 'scallop-shell', name: 'Scallop shell', color: '#d9957e' },
  { id: 'clam-shell', name: 'Clam shell', color: '#ead6ad' },
  { id: 'spiral-shell', name: 'Spiral shell', color: '#d9c69b' },
  { id: 'conch-shell', name: 'Conch shell', color: '#d4a18b' },
  { id: 'olive-seaweed', name: 'Olive seaweed', color: '#657d35' },
  { id: 'amber-seaweed', name: 'Amber seaweed', color: '#87603d' },
]);
export const isTreasure = id => TREASURES.some(item => item.id === id);

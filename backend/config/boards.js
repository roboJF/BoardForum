// Add a board here to make it available in the API and navigation.
export const BOARDS = [
  { slug: "general", name: "General", description: "Talk about anything." },
  { slug: "technology", name: "Technology", description: "Discuss technology, software, and gadgets." },
  { slug: "entertainment", name: "Entertainment", description: "Share movies, music, games, and more." },
];

export const DEFAULT_BOARD = "general";
export const BOARD_SLUGS = BOARDS.map((board) => board.slug);
export const isBoard = (slug) => BOARD_SLUGS.includes(slug);

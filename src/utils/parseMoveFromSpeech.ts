export interface ParsedMove {
  toSquare?: string
  piece?: string          // chess.js piece symbol: 'n','b','r','q','k','p'
  fromSquare?: string     // full square (e.g. 'g1') or just file (e.g. 'g') for disambiguation
  isCastleKingside?: boolean
  isCastleQueenside?: boolean
  promotion?: string      // 'q','r','b','n'
}

const PIECE_MAP: Record<string, string> = {
  knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k', pawn: 'p',
}

const PROMO_MAP: Record<string, string> = {
  queen: 'q', rook: 'r', bishop: 'b', knight: 'n',
}

export function parseMoveFromSpeech(transcript: string): ParsedMove | null {
  let text = transcript.toLowerCase().trim()

  // Strip trailing annotations
  text = text.replace(/\b(check|checkmate|mate|plus|please)\b/g, '')

  // Detect queenside castling first (before kingside to avoid partial match on "o-o")
  if (/\b(castle\s*queen\s*side|long\s*castle|queen\s*side\s*castle|o\s*-?\s*o\s*-?\s*o)\b/.test(text)) {
    return { isCastleQueenside: true }
  }
  // Detect kingside castling
  if (/\b(castle\s*king\s*side|short\s*castle|king\s*side\s*castle|o\s*-?\s*o)\b/.test(text)) {
    return { isCastleKingside: true }
  }
  // Plain "castle" — try kingside first (more common), caller will fall back to queenside
  if (/\bcastle\b/.test(text)) {
    return { isCastleKingside: true }
  }

  // Normalize piece misrecognitions
  text = text
    .replace(/\b(night|naught|nought|horse|nite|neigh)\b/g, 'knight')
    .replace(/\b(rock)\b/g, 'rook')

  // Remove noise words
  text = text.replace(/\bto\b/g, ' ')

  // NATO phonetic alphabet → file letters
  text = text
    .replace(/\b(alpha|alfa|able)\b/g, 'a')
    .replace(/\b(bravo|beta)\b/g, 'b')
    .replace(/\bcharlie\b/g, 'c')
    .replace(/\bdelta\b/g, 'd')
    .replace(/\becho\b/g, 'e')
    .replace(/\b(foxtrot|fox)\b/g, 'f')
    .replace(/\bgolf\b/g, 'g')
    .replace(/\bhotel\b/g, 'h')

  // Rank words → digits
  text = text
    .replace(/\bone\b/g, '1')
    .replace(/\btwo\b/g, '2')
    .replace(/\bthree\b/g, '3')
    .replace(/\bfour\b/g, '4')
    .replace(/\bfive\b/g, '5')
    .replace(/\bsix\b/g, '6')
    .replace(/\bseven\b/g, '7')
    .replace(/\beight\b/g, '8')

  // Collapse "f 3" → "f3"
  text = text.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2')

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim()

  // Extract promotion piece at end (must come before piece extraction)
  let promotion: string | undefined
  const promoMatch = text.match(/\b(queen|rook|bishop|knight)\s*$/)
  if (promoMatch) {
    promotion = PROMO_MAP[promoMatch[1]]
    text = text.slice(0, text.lastIndexOf(promoMatch[0])).trim()
  }

  // Extract piece name at start
  let piece: string | undefined
  const pieceMatch = text.match(/^(knight|bishop|rook|queen|king|pawn)\b\s*/)
  if (pieceMatch) {
    piece = PIECE_MAP[pieceMatch[1]]
    text = text.slice(pieceMatch[0].length)
  }

  // Detect capture keywords
  text = text.replace(/\b(takes|captures|x)\b/g, ' ').replace(/\s+/g, ' ').trim()

  // Find all squares (file+rank combos)
  const squares = [...text.matchAll(/\b([a-h][1-8])\b/g)].map(m => m[1])

  // Find lone files (for disambiguation without rank)
  const squaresRemoved = text.replace(/[a-h][1-8]/g, ' ')
  const loneFiles = [...squaresRemoved.matchAll(/\b([a-h])\b/g)].map(m => m[1])

  let fromSquare: string | undefined
  let toSquare: string | undefined

  if (squares.length >= 2) {
    fromSquare = squares[0]
    toSquare = squares[1]
  } else if (squares.length === 1) {
    toSquare = squares[0]
    if (loneFiles.length === 1) {
      fromSquare = loneFiles[0]
    }
  } else {
    return null
  }

  // If no piece name was given and no disambiguation, treat as pawn move
  if (!piece && !fromSquare) {
    piece = 'p'
  }

  return { toSquare, piece, fromSquare, promotion }
}

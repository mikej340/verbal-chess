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

// Digit in file position → file letter (e.g. "84" heard when user said "a4")
const DIGIT_TO_FILE: Record<string, string> = { '8': 'a' }

export function parseMoveFromSpeech(transcript: string): ParsedMove | null {
  let text = transcript.toLowerCase().trim()

  // Strip trailing annotations and leading article
  text = text.replace(/\b(check|checkmate|mate|plus|please)\b/g, '')
  text = text.replace(/\bthe\b/g, ' ')

  // Detect queenside castling first (before kingside to avoid partial match on "o-o")
  if (/\b(castle\s*queen\s*side|long\s*castle|queen\s*side\s*castle|o\s*-?\s*o\s*-?\s*o|oh\s*oh\s*oh|zero\s*zero\s*zero)\b/.test(text)) {
    return { isCastleQueenside: true }
  }
  // Detect kingside castling
  if (/\b(castle\s*king\s*side|short\s*castle|king\s*side\s*castle|o\s*-?\s*o|oh\s*oh|zero\s*zero)\b/.test(text)) {
    return { isCastleKingside: true }
  }
  // Plain "castle"/"castles" — try kingside first (more common)
  if (/\bcastles?\b/.test(text)) {
    return { isCastleKingside: true }
  }

  // Normalize piece misrecognitions
  text = text
    .replace(/\b(night|naught|nought|horse|nite|neigh|mike|might)\b/g, 'knight')
    .replace(/\b(cream|clean)\b/g, 'queen')
    .replace(/\b(rock)\b/g, 'rook')

  // Remove noise words
  text = text.replace(/\b(to|on|move)\b/g, ' ')

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

  // Phonetic letter aliases (STT often returns letter names as words)
  text = text
    .replace(/\b(ay|aye)\b/g, 'a')
    .replace(/\b(bee|be)\b/g, 'b')
    .replace(/\b(pee|pe)\b/g, 'b')      // b/p voiced-unvoiced bilabial confusion
    .replace(/\b(sea|see|si)\b/g, 'c')
    .replace(/\b(zee|ze|zed)\b/g, 'c')  // zee sounds like sea = c
    .replace(/\bdee\b/g, 'd')
    .replace(/\b(tee|te)\b/g, 'd')      // d/t voiced-unvoiced alveolar confusion
    .replace(/\b(ef|eff)\b/g, 'f')      // letter F's spoken name
    .replace(/\b(gee|jay|j)\b/g, 'g')  // letter G's name; j/jay sounds like gee
    .replace(/\b(aitch|haitch)\b/g, 'h')

  // Rank words → digits
  text = text
    .replace(/\b(one|won)\b/g, '1')
    .replace(/\b(two|too)\b/g, '2')
    .replace(/\b(three|tree|free)\b/g, '3')
    .replace(/\b(four|for|fore)\b/g, '4')
    .replace(/\bfive\b/g, '5')
    .replace(/\bsix\b/g, '6')
    .replace(/\bseven\b/g, '7')
    .replace(/\b(eight|ate)\b/g, '8')

  // Specific whole-phrase misrecognitions that survive earlier substitutions
  text = text.replace(/\bdefault\b/g, 'd4')

  // Two-digit number where second digit is a valid rank → likely a misheard square
  // e.g. "84" → "a4" when STT hears "a" as "eight"
  text = text.replace(/\b([0-9])([1-8])\b/g, (_, d, r) => {
    const file = DIGIT_TO_FILE[d]
    return file != null ? file + r : d + r
  })

  // Collapse "f 3" → "f3"
  text = text.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2')

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim()

  // Reject if any unrecognised word remains — prevents "cream d6" silently becoming a pawn move
  const remainder = text
    .replace(/\b(knight|bishop|rook|queen|king|pawn|takes|captures|eats|x)\b/g, '')
    .replace(/\b[a-h][1-8]\b/g, '')
    .replace(/\b[a-h]\b/g, '')
    .replace(/\b[1-8]\b/g, '')
    .replace(/\s+/g, '')
  if (remainder.length > 0) return null

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
  text = text.replace(/\b(takes|captures|eats|x)\b/g, ' ').replace(/\s+/g, ' ').trim()

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

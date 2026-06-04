export interface MoveMatchResult {
  move: string       // SAN string, e.g. "Qf6"
  confidence: number // 0–1, higher is better
}

const DIGIT_TO_FILE: Record<string, string> = { '8': 'a' }

const SAN_PIECE_MAP: Record<string, string> = {
  N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king',
}

const SAN_PROMO_MAP: Record<string, string> = {
  Q: 'queen', R: 'rook', B: 'bishop', N: 'knight',
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  // Use a single flat Uint16Array row to avoid GC pressure on mobile
  const row = new Uint16Array(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const cur = row[j]
      row[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, row[j], row[j - 1])
      prev = cur
    }
  }
  return row[n]
}

// Convert a SAN move to its natural spoken form for distance comparison.
// e.g. "Nf3" → "knight f3", "Bxc5" → "bishop c5", "O-O" → "castle kingside"
function sanToSpoken(san: string): string {
  if (san === 'O-O-O') return 'castle queenside'
  if (san === 'O-O') return 'castle kingside'

  let s = san.replace(/[+#!?]/g, '')

  // Promotion suffix e.g. "=Q"
  let promotion = ''
  const promoMatch = s.match(/=([QRBN])$/)
  if (promoMatch) {
    promotion = ' ' + (SAN_PROMO_MAP[promoMatch[1]] ?? promoMatch[1].toLowerCase())
    s = s.slice(0, -2)
  }

  // Leading piece letter
  let piece = ''
  if (s.length > 0 && s[0] in SAN_PIECE_MAP) {
    piece = SAN_PIECE_MAP[s[0]] + ' '
    s = s.slice(1)
  }

  // Replace capture 'x' with a space
  s = s.replace('x', ' ').replace(/\s+/g, ' ').trim()

  return (piece + s + promotion).trim()
}

// Normalise a raw transcript to a spoken-chess form suitable for distance comparison.
// Applies the same alias passes as parseMoveFromSpeech but skips strict validation.
function normalizeTranscript(transcript: string): string {
  let text = transcript.toLowerCase().trim()

  // Strip trailing annotations and leading article
  text = text.replace(/\b(check|checkmate|mate|plus|please)\b/g, '')
  text = text.replace(/\bthe\b/g, ' ')

  // Piece misrecognition aliases
  text = text
    .replace(/\b(night|naught|nought|horse|nite|neigh|mike|might)\b/g, 'knight')
    .replace(/\b(cream|clean)\b/g, 'queen')
    .replace(/\b(rock)\b/g, 'rook')
    .replace(/\b(porn)\b/g, 'pawn')

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
    .replace(/\b(bee|be|vee|v)\b/g, 'b')
    .replace(/\b(pee|pe)\b/g, 'b')
    .replace(/\b(sea|see|si)\b/g, 'c')
    .replace(/\b(zee|ze|zed)\b/g, 'c')
    .replace(/\bdee\b/g, 'd')
    .replace(/\b(tee|te)\b/g, 'd')
    .replace(/\b(ef|eff)\b/g, 'f')
    .replace(/\b(gee|jay|j)\b/g, 'g')
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

  // Specific whole-phrase misrecognitions
  text = text.replace(/\bdefault\b/g, 'd4')
  text = text.replace(/\bbefore\b/g, 'b4')

  // Two-digit → square (e.g. "84" → "a4")
  text = text.replace(/\b([0-9])([1-8])\b/g, (_, d, r) => {
    const file = DIGIT_TO_FILE[d]
    return file != null ? file + r : d + r
  })

  // Collapse "f 3" → "f3"
  text = text.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2')

  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Find the closest legal move to a raw speech transcript using Levenshtein distance.
 *
 * @param transcript - Raw string from the speech recogniser
 * @param legalMoves - SAN strings from chess.moves()
 * @param threshold  - Minimum confidence (0–1) required to return a result; defaults to 0.5
 * @returns The best-matching move and its confidence, or null if nothing is close enough
 */
export function matchTranscriptToMove(
  transcript: string,
  legalMoves: string[],
  threshold = 0.5,
): MoveMatchResult | null {
  if (legalMoves.length === 0) return null

  const normalised = normalizeTranscript(transcript)
  if (normalised.length === 0) return null

  let bestMove = ''
  let bestConfidence = -1

  for (const san of legalMoves) {
    const spoken = sanToSpoken(san)
    const dist = levenshtein(normalised, spoken)
    const maxLen = Math.max(normalised.length, spoken.length)
    const confidence = maxLen === 0 ? 1 : 1 - dist / maxLen
    if (confidence > bestConfidence) {
      bestConfidence = confidence
      bestMove = san
    }
  }

  if (bestConfidence < threshold) return null
  return { move: bestMove, confidence: bestConfidence }
}

import { Chess, Move, Square } from 'chess.js'
import { useCallback, useRef, useState } from 'react'
import { ParsedMove } from '../utils/parseMoveFromSpeech'

export interface LastMove {
  from: string
  to: string
}

export interface GameState {
  fen: string
  turn: 'w' | 'b'
  isCheck: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  lastMove: LastMove | null
}

export interface UseChessGameReturn extends GameState {
  makeMove: (san: string) => boolean
  makeParsedMove: (parsed: ParsedMove) => boolean
  makeMoveFromSquares: (from: string, to: string, promotion?: string) => boolean
  undo: () => void
  reset: () => void
  loadFen: (fen: string) => boolean
  getChess: () => Chess
}

function getGameState(chess: Chess, lastMove: LastMove | null): GameState {
  return {
    fen: chess.fen(),
    turn: chess.turn(),
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    lastMove,
  }
}

function otherColor(color: 'w' | 'b'): 'w' | 'b' {
  return color === 'w' ? 'b' : 'w'
}

// Each entry tracks how many undo() calls are needed to reverse one logical move.
// Using setTurn() inserts a null move, requiring an extra undo.
type HistoryEntry = { undoCount: 1 | 2 }

export function useChessGame(): UseChessGameReturn {
  const chessRef = useRef(new Chess())
  const historyRef = useRef<HistoryEntry[]>([])
  const [gameState, setGameState] = useState<GameState>(() =>
    getGameState(chessRef.current, null)
  )

  const applyAndRecord = useCallback(
    (result: Move, undoCount: 1 | 2) => {
      historyRef.current.push({ undoCount })
      setGameState(getGameState(chessRef.current, { from: result.from, to: result.to }))
    },
    []
  )

  // Find candidates among legal moves in chess (which may have had its turn adjusted)
  function findCandidates(chess: Chess, parsed: ParsedMove): Move[] {
    const verbose = chess.moves({ verbose: true }) as Move[]
    return verbose.filter(m => {
      if (parsed.toSquare && m.to !== parsed.toSquare) return false
      if (parsed.piece && m.piece !== parsed.piece) return false
      if (parsed.fromSquare) {
        if (parsed.fromSquare.length === 2 && m.from !== parsed.fromSquare) return false
        if (parsed.fromSquare.length === 1 && m.from[0] !== parsed.fromSquare) return false
      }
      return true
    })
  }

  const makeParsedMove = useCallback((parsed: ParsedMove): boolean => {
    const chess = chessRef.current

    // Try the move as-is, then try again with the turn flipped.
    // setTurn() inserts a null move; we undo it if the attempt fails.
    const tryWithTurns = (attempt: () => Move | null): boolean => {
      const r1 = attempt()
      if (r1) { applyAndRecord(r1, 1); return true }

      const flipped = chess.setTurn(otherColor(chess.turn()))
      if (!flipped) return false // setTurn failed (e.g. position is illegal)

      const r2 = attempt()
      if (r2) { applyAndRecord(r2, 2); return true }

      chess.undo() // remove the null move since the attempt failed
      return false
    }

    // Handle castling
    if (parsed.isCastleKingside || parsed.isCastleQueenside) {
      const target = parsed.isCastleKingside ? 'O-O' : 'O-O-O'
      return tryWithTurns(() => {
        if (!chess.moves().includes(target)) return null
        try { return chess.move(target) } catch { return null }
      })
    }

    if (!parsed.toSquare) return false

    // Regular move: find the unique legal candidate, then apply it
    return tryWithTurns(() => {
      let candidates = findCandidates(chess, parsed)
      if (candidates.length === 0) return null
      // chess.js emits 4 moves for promotions (one per piece) — narrow to the desired/default
      if (candidates.length > 1 && candidates.every(m => m.isPromotion())) {
        const want = parsed.promotion ?? 'q'
        candidates = candidates.filter(m => m.promotion === want)
      }
      if (candidates.length !== 1) return null
      const c = candidates[0]
      const mv: { from: string; to: string; promotion?: string } = { from: c.from, to: c.to }
      if (c.isPromotion()) mv.promotion = parsed.promotion ?? 'q'
      try { return chess.move(mv) } catch { return null }
    })
  }, [applyAndRecord])

  const makeMoveFromSquares = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const chess = chessRef.current
      const piece = chess.get(from as Square)
      if (!piece) return false

      // Flip turn if the piece belongs to the side not currently to move
      let flipped = false
      if (piece.color !== chess.turn()) {
        const ok = chess.setTurn(piece.color)
        if (!ok) return false
        flipped = true
      }

      // Detect promotion
      const verbose = chess.moves({ verbose: true }) as Move[]
      const isPromotion = verbose.some(m => m.from === from && m.to === to && m.isPromotion())
      const mv: { from: string; to: string; promotion?: string } = { from, to }
      if (isPromotion) mv.promotion = promotion ?? 'q'

      try {
        const result = chess.move(mv)
        applyAndRecord(result, flipped ? 2 : 1)
        return true
      } catch {
        if (flipped) chess.undo() // remove the null move from setTurn
        return false
      }
    },
    [applyAndRecord]
  )

  const makeMove = useCallback(
    (san: string): boolean => {
      const chess = chessRef.current
      try {
        const result = chess.move(san)
        applyAndRecord(result, 1)
        return true
      } catch {
        return false
      }
    },
    [applyAndRecord]
  )

  const undo = useCallback(() => {
    const chess = chessRef.current
    const entry = historyRef.current.pop()
    if (!entry) return
    for (let i = 0; i < entry.undoCount; i++) {
      chess.undo()
    }
    setGameState(getGameState(chess, null))
  }, [])

  const reset = useCallback(() => {
    const chess = chessRef.current
    chess.reset()
    historyRef.current = []
    setGameState(getGameState(chess, null))
  }, [])

  const loadFen = useCallback((fen: string): boolean => {
    const chess = chessRef.current
    try {
      chess.load(fen)
      historyRef.current = []
      setGameState(getGameState(chess, null))
      return true
    } catch {
      return false
    }
  }, [])

  const getChess = useCallback(() => chessRef.current, [])

  return {
    ...gameState,
    makeMove,
    makeParsedMove,
    makeMoveFromSquares,
    undo,
    reset,
    loadFen,
    getChess,
  }
}

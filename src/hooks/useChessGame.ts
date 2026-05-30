import { Chess, Move } from 'chess.js'
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

// Each entry tracks how many undo() calls are needed to reverse one logical move.
type HistoryEntry = { undoCount: 1 }

export function useChessGame(): UseChessGameReturn {
  const chessRef = useRef(new Chess())
  const historyRef = useRef<HistoryEntry[]>([])
  const [gameState, setGameState] = useState<GameState>(() =>
    getGameState(chessRef.current, null)
  )

  const applyAndRecord = useCallback(
    (result: Move) => {
      historyRef.current.push({ undoCount: 1 })
      setGameState(getGameState(chessRef.current, { from: result.from, to: result.to }))
    },
    []
  )

  // Find candidates among legal moves matching the parsed move description
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

    if (parsed.isCastleKingside || parsed.isCastleQueenside) {
      const target = parsed.isCastleKingside ? 'O-O' : 'O-O-O'
      if (!chess.moves().includes(target)) return false
      try {
        const result = chess.move(target)
        applyAndRecord(result)
        return true
      } catch { return false }
    }

    if (!parsed.toSquare) return false

    let candidates = findCandidates(chess, parsed)
    if (candidates.length === 0) return false
    // chess.js emits 4 moves for promotions (one per piece) — narrow to desired/default
    if (candidates.length > 1 && candidates.every(m => m.isPromotion())) {
      const want = parsed.promotion ?? 'q'
      candidates = candidates.filter(m => m.promotion === want)
    }
    if (candidates.length !== 1) return false
    const c = candidates[0]
    const mv: { from: string; to: string; promotion?: string } = { from: c.from, to: c.to }
    if (c.isPromotion()) mv.promotion = parsed.promotion ?? 'q'
    try {
      const result = chess.move(mv)
      applyAndRecord(result)
      return true
    } catch { return false }
  }, [applyAndRecord])

  const makeMoveFromSquares = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const chess = chessRef.current
      const verbose = chess.moves({ verbose: true }) as Move[]
      const isPromotion = verbose.some(m => m.from === from && m.to === to && m.isPromotion())
      const mv: { from: string; to: string; promotion?: string } = { from, to }
      if (isPromotion) mv.promotion = promotion ?? 'q'
      try {
        const result = chess.move(mv)
        applyAndRecord(result)
        return true
      } catch { return false }
    },
    [applyAndRecord]
  )

  const makeMove = useCallback(
    (san: string): boolean => {
      const chess = chessRef.current
      try {
        const result = chess.move(san)
        applyAndRecord(result)
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

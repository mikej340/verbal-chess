import { useCallback, useEffect, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { useChessGame } from './hooks/useChessGame'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { StatusBar } from './components/StatusBar'
import { parseMoveFromSpeech } from './utils/parseMoveFromSpeech'
import type { ChessboardOptions } from 'react-chessboard'

export default function App() {
  const {
    fen,
    turn,
    isCheck,
    isCheckmate,
    isStalemate,
    isDraw,
    lastMove,
    makeParsedMove,
    makeMoveFromSquares,
    undo,
    reset,
    loadFen: loadFenFromGame,
  } = useChessGame()

  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [lastHeard, setLastHeard] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [fenInput, setFenInput] = useState('')
  const [fenError, setFenError] = useState<string | null>(null)
  const [showFenInput, setShowFenInput] = useState(false)
  const parseErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the FEN input in sync with the current position
  useEffect(() => {
    setFenInput(fen)
  }, [fen])

  const showError = useCallback((msg: string) => {
    setParseError(msg)
    if (parseErrorTimerRef.current) clearTimeout(parseErrorTimerRef.current)
    parseErrorTimerRef.current = setTimeout(() => setParseError(null), 4000)
  }, [])

  const onTranscript = useCallback(
    (transcript: string) => {
      setLastHeard(transcript)
      const parsed = parseMoveFromSpeech(transcript)
      if (!parsed) {
        showError(`Didn't understand: "${transcript}"`)
        return
      }
      const success = makeParsedMove(parsed)
      if (!success) {
        showError(`Illegal move: "${transcript}"`)
      } else {
        setParseError(null)
        setSelectedSquare(null)
      }
    },
    [makeParsedMove, showError]
  )

  const { isListening, isSupported, toggleListening } = useSpeechRecognition({ onTranscript })

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!targetSquare) return false
      setSelectedSquare(null)
      return makeMoveFromSquares(sourceSquare, targetSquare)
    },
    [makeMoveFromSquares]
  )

  const handleSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null)
          return
        }
        // Try to move from selected to clicked
        const moved = makeMoveFromSquares(selectedSquare, square)
        setSelectedSquare(null)
        if (!moved) {
          // If the clicked square has a piece, select it instead
          setSelectedSquare(square)
        }
      } else {
        setSelectedSquare(square)
      }
    },
    [selectedSquare, makeMoveFromSquares]
  )

  const handleLoadFen = useCallback(() => {
    const success = loadFenFromGame(fenInput.trim())
    if (!success) {
      setFenError('Invalid FEN')
      setTimeout(() => setFenError(null), 3000)
    } else {
      setFenError(null)
      setSelectedSquare(null)
      setShowFenInput(false)
    }
  }, [fenInput, loadFenFromGame])

  // Build square styles: last move highlight + selected square highlight
  const squareStyles: Record<string, React.CSSProperties> = {}
  if (lastMove) {
    const lastMoveStyle: React.CSSProperties = { backgroundColor: 'rgba(255, 210, 0, 0.35)' }
    squareStyles[lastMove.from] = lastMoveStyle
    squareStyles[lastMove.to] = lastMoveStyle
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: 'rgba(100, 200, 255, 0.5)' }
  }

  const boardOptions: ChessboardOptions = {
    position: fen,
    boardOrientation: orientation,
    onPieceDrop: handlePieceDrop,
    onSquareClick: handleSquareClick,
    squareStyles,
    darkSquareStyle: { backgroundColor: '#4a6741' },
    lightSquareStyle: { backgroundColor: '#ffffdd' },
    dropSquareStyle: { backgroundColor: 'rgba(255, 210, 0, 0.6)' },
    showNotation: true,
    animationDurationInMs: 150,
  }

  return (
    <div className="app">
      <h1 className="title">Verbal Chess</h1>

      <div className="board-container">
        <Chessboard options={boardOptions} />
      </div>

      <div className="controls">
        {isSupported ? (
          <button
            className={`btn btn-mic ${isListening ? 'active' : ''}`}
            onClick={toggleListening}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
            title={isListening ? 'Stop voice recognition' : 'Start voice recognition'}
          >
            🎤
          </button>
        ) : (
          <div className="no-speech-warning">
            Voice not available in this browser
          </div>
        )}

        <button className="btn" onClick={undo} title="Undo last move">↩</button>
        <button className="btn" onClick={reset} title="Reset to starting position">↺</button>
        <button
          className="btn"
          onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
          title="Flip board"
        >
          ⇅
        </button>
        <button
          className={`btn ${showFenInput ? 'active-secondary' : ''}`}
          onClick={() => setShowFenInput(v => !v)}
          title="Load position from FEN"
        >
          FEN
        </button>
      </div>

      {showFenInput && (
        <div className="fen-row">
          <input
            className={`fen-input ${fenError ? 'fen-input-error' : ''}`}
            type="text"
            value={fenInput}
            onChange={e => setFenInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoadFen()}
            placeholder="Paste FEN here…"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="btn btn-load" onClick={handleLoadFen}>Load</button>
        </div>
      )}
      {fenError && <p className="fen-error-msg">{fenError}</p>}

      <StatusBar
        turn={turn}
        isCheck={isCheck}
        isCheckmate={isCheckmate}
        isStalemate={isStalemate}
        isDraw={isDraw}
        lastMove={lastMove}
        lastHeard={lastHeard}
        parseError={parseError}
        isListening={isListening}
      />
    </div>
  )
}

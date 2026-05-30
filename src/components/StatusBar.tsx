interface StatusBarProps {
  turn: 'w' | 'b'
  isCheck: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  lastMove: { from: string; to: string } | null
  lastHeard: string | null
  parseError: string | null
  isListening: boolean
}

export function StatusBar({
  turn,
  isCheck,
  isCheckmate,
  isStalemate,
  isDraw,
  lastMove,
  lastHeard,
  parseError,
  isListening,
}: StatusBarProps) {
  function gameStatus() {
    if (isCheckmate) return { text: 'Checkmate!', cls: 'status-bad' }
    if (isStalemate) return { text: 'Stalemate', cls: 'status-warn' }
    if (isDraw) return { text: 'Draw', cls: 'status-warn' }
    if (isCheck) return { text: 'Check!', cls: 'status-warn' }
    return { text: turn === 'w' ? 'White to move' : 'Black to move', cls: '' }
  }

  const status = gameStatus()

  return (
    <div className="status-bar">
      <div className={`status-item ${status.cls}`}>
        <span className="status-label">Status</span>
        <span className="status-value">{status.text}</span>
      </div>

      {lastMove && (
        <div className="status-item">
          <span className="status-label">Last move</span>
          <span className="status-value mono">{lastMove.from} → {lastMove.to}</span>
        </div>
      )}

      {isListening && lastHeard && (
        <div className="status-item">
          <span className="status-label">Heard</span>
          <span className="status-value mono">"{lastHeard}"</span>
        </div>
      )}

      {parseError && (
        <div className="status-item status-bad">
          <span className="status-label">Error</span>
          <span className="status-value">{parseError}</span>
        </div>
      )}
    </div>
  )
}

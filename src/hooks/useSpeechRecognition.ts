import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal local type definitions — avoids relying on lib.dom.d.ts for Speech API types
interface SrAlternative { transcript: string }
interface SrResult { isFinal: boolean; length: number; [i: number]: SrAlternative }
interface SrResultList { length: number; [i: number]: SrResult }
interface SrEvent extends Event { readonly resultIndex: number; readonly results: SrResultList }
interface SrErrorEvent extends Event { readonly error: string }

interface SpeechRecognitionApi extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  grammars: unknown
  onresult: ((ev: SrEvent) => void) | null
  onerror: ((ev: SrErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

interface SpeechGrammarListApi {
  addFromString(grammar: string, weight?: number): void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionApi
    webkitSpeechRecognition?: new () => SpeechRecognitionApi
    SpeechGrammarList?: new () => SpeechGrammarListApi
    webkitSpeechGrammarList?: new () => SpeechGrammarListApi
  }
}

// JSGF grammar biasing chess vocabulary — helps on Chrome desktop; safely ignored elsewhere
const CHESS_JSGF = `#JSGF V1.0;
grammar chess;
public <move> = <piece>? <capture>? <square> | <castling> | <piece>? <square> <capture> <square>;
<piece> = knight | night | mike | bishop | rook | rock | queen | king | pawn;
<capture> = takes | captures | eats | x;
<square> = <file> <rank>;
<file> = a | b | c | d | e | f | g | h | alpha | alfa | able | bravo | beta | charlie | delta | echo | foxtrot | fox | golf | hotel | ay | aye | bee | sea | see | dee | aitch | haitch;
<rank> = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | one | won | two | too | three | tree | free | four | for | fore | five | six | seven | eight | ate;
<castling> = castle kingside | castle queenside | short castle | long castle | castles | oh oh oh | oh oh | zero zero zero | zero zero;`

interface UseSpeechRecognitionOptions {
  // Receives all ranked alternatives so the caller can try each through the parser
  onTranscripts: (transcripts: string[]) => void
}

interface UseSpeechRecognitionReturn {
  isListening: boolean
  isSupported: boolean
  toggleListening: () => void
}

export function useSpeechRecognition({
  onTranscripts,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const SpeechRecognitionClass =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : null

  const isSupported = SpeechRecognitionClass != null

  const recognitionRef = useRef<SpeechRecognitionApi | null>(null)
  const isListeningRef = useRef(false)
  const [isListening, setIsListening] = useState(false)

  // Keep callback in a ref so the recognition handler never captures a stale closure
  const onTranscriptsRef = useRef(onTranscripts)
  useEffect(() => {
    onTranscriptsRef.current = onTranscripts
  }, [onTranscripts])

  useEffect(() => {
    if (!SpeechRecognitionClass) return

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 5

    // Apply grammar biasing where supported (Chrome desktop); silently skip elsewhere
    try {
      const GrammarListClass = window.SpeechGrammarList ?? window.webkitSpeechGrammarList
      if (GrammarListClass) {
        const grammarList = new GrammarListClass()
        grammarList.addFromString(CHESS_JSGF, 1)
        recognition.grammars = grammarList
      }
    } catch {
      // Grammar API unavailable — no-op
    }

    recognition.onresult = (event: SrEvent) => {
      const result = event.results[event.resultIndex]
      if (result.isFinal) {
        const alternatives: string[] = []
        for (let i = 0; i < result.length; i++) {
          const t = result[i].transcript.trim()
          if (t) alternatives.push(t)
        }
        if (alternatives.length > 0) onTranscriptsRef.current(alternatives)
      }
    }

    recognition.onend = () => {
      // iOS Safari stops after each utterance even with continuous=true;
      // restart automatically if we're still supposed to be listening.
      if (isListeningRef.current) {
        try {
          recognition.start()
        } catch {
          // Already started (can happen on desktop Chrome)
        }
      }
    }

    recognition.onerror = (event: SrErrorEvent) => {
      // 'no-speech' is normal; only stop on hard permission errors
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        isListeningRef.current = false
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition

    return () => {
      isListeningRef.current = false
      recognition.stop()
    }
  }, [SpeechRecognitionClass])

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    if (isListeningRef.current) {
      isListeningRef.current = false
      setIsListening(false)
      recognition.stop()
    } else {
      isListeningRef.current = true
      setIsListening(true)
      try {
        recognition.start()
      } catch {
        // May already be running
      }
    }
  }, [])

  return { isListening, isSupported, toggleListening }
}

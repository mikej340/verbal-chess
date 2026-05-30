import { useCallback, useEffect, useRef, useState } from 'react'

// Define only what we need — avoids relying on lib.dom.d.ts SpeechRecognition availability
interface SrAlternative { transcript: string }
interface SrResult { isFinal: boolean; length: number; [i: number]: SrAlternative }
interface SrResultList { length: number; [i: number]: SrResult }
interface SrEvent extends Event { readonly resultIndex: number; readonly results: SrResultList }
interface SrErrorEvent extends Event { readonly error: string }

interface SpeechRecognitionApi extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: SrEvent) => void) | null
  onerror: ((ev: SrErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionApi
    webkitSpeechRecognition?: new () => SpeechRecognitionApi
  }
}

interface UseSpeechRecognitionOptions {
  onTranscript: (transcript: string) => void
}

interface UseSpeechRecognitionReturn {
  isListening: boolean
  isSupported: boolean
  toggleListening: () => void
}

export function useSpeechRecognition({
  onTranscript,
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
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    if (!SpeechRecognitionClass) return

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: SrEvent) => {
      const result = event.results[event.resultIndex]
      if (result.isFinal) {
        const transcript = result[0].transcript.trim()
        if (transcript) onTranscriptRef.current(transcript)
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
      // 'no-speech' is normal; don't stop listening for it
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

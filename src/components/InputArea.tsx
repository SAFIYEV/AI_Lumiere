import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { ArrowUp, Square, Paperclip, Camera, X, FileText, Image as ImageIcon, Mic, Loader2 } from 'lucide-react'
import type { FileAttachment } from '../types'
import { processFile, formatFileSize } from '../lib/fileProcessor'
import { useLang } from '../contexts/LangContext'

const API_BASE = import.meta.env.VITE_API_URL || ''

interface Props {
  onSend: (text: string, files?: FileAttachment[]) => void
  isStreaming: boolean
  onStop: () => void
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf'
const CAMERA_ACCEPT = 'image/*'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function InputArea({ onSend, isStreaming, onStop }: Props) {
  const { t, lang } = useLang()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [fileError, setFileError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<{ ctx: AudioContext; rafId: number } | null>(null)
  const silenceStartRef = useRef<number | null>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [text])

  useEffect(() => {
    if (fileError) {
      const timer = setTimeout(() => setFileError(''), 4000)
      return () => clearTimeout(timer)
    }
  }, [fileError])

  const [progressMsg, setProgressMsg] = useState('')

  const addFiles = useCallback(async (fileList: File[]) => {
    setProcessing(true)
    setFileError('')
    setProgressMsg('')
    for (const file of fileList) {
      try {
        const attachment = await processFile(file, setProgressMsg)
        setFiles((prev) => [...prev, attachment])
      } catch (err: any) {
        setFileError(err.message || t('file.error'))
      }
    }
    setProgressMsg('')
    setProcessing(false)
    textareaRef.current?.focus()
  }, [t])

  const handleAttachClick = useCallback(() => {
    if (isStreaming || processing) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      if (input.files?.length) {
        addFiles(Array.from(input.files))
      }
      document.body.removeChild(input)
    })
    input.click()
  }, [isStreaming, processing, addFiles])

  const handleCameraClick = useCallback(() => {
    if (isStreaming || processing) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = CAMERA_ACCEPT
    input.capture = 'environment'
    input.multiple = false
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      if (input.files?.length) {
        addFiles(Array.from(input.files))
      }
      document.body.removeChild(input)
    })
    input.click()
  }, [isStreaming, processing, addFiles])

  const handleSubmit = () => {
    if ((!text.trim() && !files.length) || isStreaming || processing) return
    onSend(text.trim(), files.length ? files : undefined)
    setText('')
    setFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) addFiles([file])
        return
      }
    }
  }, [addFiles])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length) addFiles(dropped)
  }, [addFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const startRecording = useCallback(async () => {
    setFileError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const dataArray = new Float32Array(analyser.fftSize)
      silenceStartRef.current = null

      const monitor = () => {
        if (!analyserRef.current) return
        analyser.getFloatTimeDomainData(dataArray)
        const rms = Math.sqrt(dataArray.reduce((sum, v) => sum + v * v, 0) / dataArray.length)
        const db = 20 * Math.log10(Math.max(rms, 0.0001))

        if (db < -42) {
          if (!silenceStartRef.current) silenceStartRef.current = Date.now()
          else if (Date.now() - silenceStartRef.current > 2000 && mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
            return
          }
        } else {
          silenceStartRef.current = null
        }
        if (analyserRef.current) {
          analyserRef.current.rafId = requestAnimationFrame(monitor)
        }
      }
      analyserRef.current = { ctx: audioCtx, rafId: 0 }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        if (analyserRef.current) {
          cancelAnimationFrame(analyserRef.current.rafId)
          analyserRef.current.ctx.close().catch(() => {})
          analyserRef.current = null
        }
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType.split(';')[0] })
        if (audioBlob.size < 1000) {
          setFileError(t('voice.noSpeech'))
          return
        }

        setTranscribing(true)
        try {
          const base64 = await blobToBase64(audioBlob)
          const langMap: Record<string, string> = { ru: 'ru', en: 'en', kz: 'kk' }
          const res = await fetch(`${API_BASE}/api/audio/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64,
              mimeType: audioBlob.type,
              language: langMap[lang] || 'ru',
            }),
          })
          if (!res.ok) {
            const d = await res.json()
            throw new Error(d.error?.message || 'Transcription failed')
          }
          const data = await res.json()
          const transcribed = data.text?.trim() || ''
          if (!transcribed) {
            setFileError(t('voice.noSpeech'))
          } else {
            setText((prev) => (prev ? prev + ' ' + transcribed : transcribed))
            textareaRef.current?.focus()
          }
        } catch (err: any) {
          setFileError(err.message || t('voice.error'))
        } finally {
          setTranscribing(false)
        }
      }

      recorder.start(250)
      setRecording(true)
      analyserRef.current.rafId = requestAnimationFrame(monitor)
    } catch {
      setFileError(t('voice.noMic'))
    }
  }, [lang, t])

  const handleMicClick = useCallback(() => {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [recording, startRecording, stopRecording])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      if (analyserRef.current) {
        cancelAnimationFrame(analyserRef.current.rafId)
        analyserRef.current.ctx.close().catch(() => {})
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className={`input-area ${dragOver ? 'input-area--dragover' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      {files.length > 0 && (
        <div className="input-area__files">
          {files.map((f) => (
            <div key={f.id} className="file-chip">
              {f.type === 'image' && f.preview ? (
                <img src={f.preview} alt={f.name} className="file-chip__thumb" />
              ) : (
                <div className="file-chip__icon">
                  {f.type === 'pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                </div>
              )}
              <div className="file-chip__info">
                <span className="file-chip__name">{f.name}</span>
                <span className="file-chip__size">{formatFileSize(f.size)}</span>
              </div>
              <button className="file-chip__remove" onClick={() => removeFile(f.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {fileError && <div className="input-area__file-error">{fileError}</div>}

      <div className="input-area__wrapper">
        <button
          type="button"
          className="input-area__attach"
          onClick={handleAttachClick}
          disabled={isStreaming || processing}
          aria-label={t('input.attach')}
        >
          <Paperclip size={18} />
        </button>

        <button
          type="button"
          className="input-area__camera"
          onClick={handleCameraClick}
          disabled={isStreaming || processing}
          aria-label={t('input.camera')}
        >
          <Camera size={18} />
        </button>

        <textarea
          ref={textareaRef}
          className="input-area__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={recording ? t('voice.listening') : files.length ? t('input.placeholderFiles') : t('input.placeholder')}
          rows={1}
          disabled={isStreaming || recording}
        />

        {processing && (
          <div className="input-area__processing">
            {progressMsg || t('input.processing')}
          </div>
        )}

        {transcribing && (
          <div className="input-area__processing">
            <Loader2 size={14} className="spin" /> {t('voice.thinking')}
          </div>
        )}

        <button
          type="button"
          className={`input-area__mic ${recording ? 'input-area__mic--active' : ''}`}
          onClick={handleMicClick}
          disabled={isStreaming || processing || transcribing}
          aria-label={recording ? t('voice.listening') : t('voice.title')}
        >
          <Mic size={18} />
        </button>

        {isStreaming ? (
          <button className="input-area__stop" onClick={onStop} aria-label={t('input.stop')}>
            <Square size={16} />
          </button>
        ) : (
          <button
            className="input-area__send"
            onClick={handleSubmit}
            disabled={(!text.trim() && !files.length) || processing || recording || transcribing}
            aria-label={t('input.send')}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
      <div className="input-area__hint">
        {t('input.hint')}
      </div>
    </div>
  )
}
